import 'server-only';
import { and, eq, inArray, isNotNull, isNull, or, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks } from '@/db/schema';
import { getPriceSource } from './price-sources';
import { recordPriceSnapshot } from './record-price-snapshot';
import { upsertSellerFromOffer } from './sources/mercado-livre-seller';
import './sources'; // registra os adapters disponíveis (efeito colateral do import)

/** Intervalo mínimo entre coletas — catálogo geral. */
const REFRESH_INTERVAL = sql`interval '15 minutes'`;
/** Intervalo mínimo entre coletas — jogos com pelo menos um cliente acompanhando (dado "quente"). */
const WATCHED_REFRESH_INTERVAL = sql`interval '5 minutes'`;
/** Protege contra timeout se o backlog crescer — o que sobrar pega no próximo tick do cron (a cada 5min). */
const MAX_OFFERS_PER_RUN = 200;

const isWatchedExpr = sql`EXISTS (
  SELECT 1 FROM affiliate_price_watches w
  WHERE w.master_product_id = ${affiliateOffers.masterProductId} AND w.is_active = true
)`;

export interface CollectPricesSummary {
  checked: number;
  updated: number;
  skippedNoSource: number;
  skippedNoOffer: number;
  errors: { offerId: string; message: string }[];
}

/**
 * Roda uma passada de coleta: pega ofertas ativas com external_ref cadastrado
 * e vencidas pro refresh, busca preço atual via o PriceSource da rede, grava
 * o snapshot (source: 'api') e marca last_checked_at — mesmo se falhar, pra
 * não martelar uma oferta com adapter quebrado a cada execução do cron.
 */
export async function collectPrices(): Promise<CollectPricesSummary> {
  const dueOffers = await db
    .select({
      id: affiliateOffers.id,
      externalRef: affiliateOffers.externalRef,
      networkId: affiliateOffers.networkId,
      networkSlug: affiliateNetworks.slug,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(
      and(
        // 'draft' entra aqui de propósito: produto descoberto automaticamente
        // (src/server/collector/discover-products.ts) começa sem link de afiliado
        // (não publicado), mas o histórico de preço deve começar a ser construído
        // mesmo assim — publicação e rastreamento de preço são decisões independentes.
        inArray(affiliateOffers.status, ['active', 'draft']),
        isNotNull(affiliateOffers.externalRef),
        or(
          isNull(affiliateOffers.lastCheckedAt),
          lt(
            affiliateOffers.lastCheckedAt,
            sql`now() - CASE WHEN ${isWatchedExpr} THEN ${WATCHED_REFRESH_INTERVAL} ELSE ${REFRESH_INTERVAL} END`
          )
        )
      )
    )
    .orderBy(sql`${isWatchedExpr} DESC`, sql`${affiliateOffers.lastCheckedAt} ASC NULLS FIRST`)
    .limit(MAX_OFFERS_PER_RUN);

  const summary: CollectPricesSummary = {
    checked: 0,
    updated: 0,
    skippedNoSource: 0,
    skippedNoOffer: 0,
    errors: [],
  };

  for (const offer of dueOffers) {
    const source = getPriceSource(offer.networkSlug);
    if (!source) {
      summary.skippedNoSource++;
      continue;
    }

    summary.checked++;
    try {
      const result = await source.fetchSnapshot(offer.externalRef!);
      if (!result) {
        summary.skippedNoOffer++;
        continue;
      }

      await recordPriceSnapshot({
        offerId: offer.id,
        priceCents: result.priceCents,
        listPriceCents: result.listPriceCents,
        couponCode: result.couponCode,
        source: 'api',
      });
      summary.updated++;

      if (result.externalSellerId) {
        try {
          const sellerId = await upsertSellerFromOffer(offer.networkId, result.externalSellerId);
          await db.update(affiliateOffers).set({ sellerId }).where(eq(affiliateOffers.id, offer.id));
        } catch (err) {
          // Reputação de vendedor não é crítica pro preço já ter sido gravado
          // com sucesso acima — não conta como erro da coleta, só loga.
          console.error(`Falha ao atualizar vendedor da oferta ${offer.id}:`, (err as Error).message);
        }
      }
    } catch (err) {
      summary.errors.push({ offerId: offer.id, message: (err as Error).message });
    } finally {
      await db.update(affiliateOffers).set({ lastCheckedAt: new Date() }).where(eq(affiliateOffers.id, offer.id));
    }
  }

  return summary;
}

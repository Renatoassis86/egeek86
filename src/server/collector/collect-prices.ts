import 'server-only';
import { and, eq, isNotNull, isNull, or, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks } from '@/db/schema';
import { getPriceSource } from './price-sources';
import { recordPriceSnapshot } from './record-price-snapshot';
import { upsertSellerFromOffer } from './sources/mercado-livre-seller';
import './sources'; // registra os adapters disponíveis (efeito colateral do import)

/** Intervalo mínimo entre coletas da mesma oferta. */
const REFRESH_INTERVAL = sql`interval '15 minutes'`;

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
        eq(affiliateOffers.status, 'active'),
        isNotNull(affiliateOffers.externalRef),
        or(isNull(affiliateOffers.lastCheckedAt), lt(affiliateOffers.lastCheckedAt, sql`now() - ${REFRESH_INTERVAL}`))
      )
    );

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

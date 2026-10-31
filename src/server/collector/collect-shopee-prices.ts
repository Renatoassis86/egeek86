import 'server-only';
import { and, eq, inArray, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks } from '@/db/schema';
import { mapWithConcurrency } from '@/lib/concurrency';
import { recordPriceSnapshot } from './record-price-snapshot';
import { ShopeeApiError, generateShopeeAffiliateLink, isShopeeAffiliateConfigured } from './sources/shopee-auth';
import { lookupShopeeItem, shopeeItemIdFromRef, shopeePublicUrl } from './sources/shopee';
import { getMasterReferencePrices, isImplausiblyLow } from './price-plausibility';

/** Mesma regra do coletor genérico: 3 respostas válidas SEGUIDAS sem preço expiram a oferta ativa. */
const MAX_CONSECUTIVE_MISSES = 3;
const ACTIVE_REFRESH = sql`interval '30 minutes'`;
/** Ofertas já expiradas são re-testadas devagar: a maioria não volta, e cada teste gasta cota da API. */
const EXPIRED_REFRESH = sql`interval '24 hours'`;
const CONCURRENCY = 3;
/** Parar de coletar ao acumular N falhas seguidas (API fora, schema mudou): evita martelar a API. */
const MAX_CONSECUTIVE_ERRORS = 10;

export interface CollectShopeeSummary {
  configured: boolean;
  selected: number;
  /** Consultas com resposta válida da API (com ou sem preço). */
  checked: number;
  /** Preços válidos recebidos (snapshot gravado só se o preço mudou, ver recordPriceSnapshot). */
  priced: number;
  reactivated: number;
  unavailable: number;
  expiredNow: number;
  rejectedImplausible: number;
  linksGenerated: number;
  errors: { externalRef: string; kind: string; message: string }[];
  /** Preenchido quando o lote foi interrompido (rate limit, auth, acesso, falhas seguidas, tempo). */
  stoppedBecause: string | null;
}

export async function collectShopeePrices(opts: { budgetMs?: number; maxOffers?: number } = {}): Promise<CollectShopeeSummary> {
  const summary: CollectShopeeSummary = {
    configured: isShopeeAffiliateConfigured(),
    selected: 0,
    checked: 0,
    priced: 0,
    reactivated: 0,
    unavailable: 0,
    expiredNow: 0,
    rejectedImplausible: 0,
    linksGenerated: 0,
    errors: [],
    stoppedBecause: null,
  };
  if (!summary.configured) return summary;

  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const maxOffers = opts.maxOffers ?? 600;

  const due = await db
    .select({
      id: affiliateOffers.id,
      externalRef: affiliateOffers.externalRef,
      masterProductId: affiliateOffers.masterProductId,
      status: affiliateOffers.status,
      affiliateLinkPending: affiliateOffers.affiliateLinkPending,
      imageUrl: affiliateOffers.imageUrl,
      consecutiveMissCount: affiliateOffers.consecutiveMissCount,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(
      and(
        eq(affiliateNetworks.slug, 'shopee'),
        isNotNull(affiliateOffers.externalRef),
        like(affiliateOffers.externalRef, 'shopee-%'),
        inArray(affiliateOffers.status, ['active', 'draft', 'expired']),
        or(
          isNull(affiliateOffers.lastCheckedAt),
          lt(
            affiliateOffers.lastCheckedAt,
            sql`now() - CASE WHEN ${affiliateOffers.status} = 'expired' THEN ${EXPIRED_REFRESH} ELSE ${ACTIVE_REFRESH} END`
          )
        )
      )
    )
    // Ativas/rascunho primeiro; dentro de cada grupo, as nunca checadas / mais antigas.
    .orderBy(sql`CASE WHEN ${affiliateOffers.status} = 'expired' THEN 1 ELSE 0 END`, sql`${affiliateOffers.lastCheckedAt} ASC NULLS FIRST`)
    .limit(maxOffers);

  summary.selected = due.length;
  let consecutiveErrors = 0;

  await mapWithConcurrency(due, CONCURRENCY, async (offer) => {
    if (summary.stoppedBecause) return;
    if (Date.now() > deadline) {
      summary.stoppedBecause = 'orcamento_de_tempo';
      return;
    }
    const itemId = shopeeItemIdFromRef(offer.externalRef ?? '');
    if (!itemId) {
      summary.errors.push({ externalRef: offer.externalRef ?? '?', kind: 'ref', message: 'external_ref fora do padrão shopee-<itemId>' });
      return;
    }

    try {
      const lookup = await lookupShopeeItem(itemId);
      consecutiveErrors = 0;
      summary.checked++;

      let validPrice: { priceCents: number; listPriceCents: number | null } | null = null;
      let node = lookup.status === 'ok' ? lookup.node : null;

      if (node) {
        const refs = await getMasterReferencePrices(offer.masterProductId, offer.id);
        if (isImplausiblyLow(node.priceCents, refs)) {
          summary.rejectedImplausible++;
          node = null; // trata como sem preço válido: não grava, não reativa
        } else {
          validPrice = { priceCents: node.priceCents, listPriceCents: node.listPriceCents };
        }
      }

      if (!node || !validPrice) {
        // Resposta VÁLIDA da API sem preço aproveitável: carimba a checagem
        // (EG-03) e conta a falha; só expira quem estava ativo.
        summary.unavailable++;
        const nextMiss = offer.consecutiveMissCount + 1;
        const expire = offer.status !== 'expired' && nextMiss >= MAX_CONSECUTIVE_MISSES;
        if (expire) summary.expiredNow++;
        await db
          .update(affiliateOffers)
          .set({
            lastCheckedAt: new Date(),
            consecutiveMissCount: offer.status === 'expired' ? offer.consecutiveMissCount : nextMiss,
            ...(expire ? { status: 'expired' as const, updatedAt: new Date() } : {}),
          })
          .where(eq(affiliateOffers.id, offer.id));
        return;
      }

      summary.priced++;
      await recordPriceSnapshot({
        offerId: offer.id,
        priceCents: validPrice.priceCents,
        listPriceCents: validPrice.listPriceCents,
        source: 'api',
      });

      const patch: Partial<typeof affiliateOffers.$inferInsert> = {
        lastCheckedAt: new Date(),
        consecutiveMissCount: 0,
        updatedAt: new Date(),
      };
      if (node.shopName) patch.storeName = node.shopName;
      if (!offer.imageUrl && node.imageUrl) patch.imageUrl = node.imageUrl;
      if (offer.status === 'expired') {
        patch.status = 'active';
        patch.publishedAt = new Date();
        summary.reactivated++;
      }
      if (offer.affiliateLinkPending) {
        const publicUrl = shopeePublicUrl(node);
        const short = await generateShopeeAffiliateLink(publicUrl);
        if (short) {
          patch.affiliateUrl = short;
          patch.affiliateLinkPending = false;
          summary.linksGenerated++;
        } else {
          // Falhou: mantém o link público e pending=true (nunca fingir comissão).
          patch.affiliateUrl = publicUrl;
          patch.affiliateLinkPending = true;
        }
      }
      await db.update(affiliateOffers).set(patch).where(eq(affiliateOffers.id, offer.id));
    } catch (err) {
      // Falha de consulta NÃO é "item indisponível": não carimba, não expira.
      const e = err as Error;
      const kind = err instanceof ShopeeApiError ? err.kind : 'internal';
      summary.errors.push({ externalRef: offer.externalRef ?? '?', kind, message: e.message.slice(0, 200) });
      consecutiveErrors++;
      if (err instanceof ShopeeApiError && err.isFatalForBatch) {
        summary.stoppedBecause = `erro_${err.kind}`;
      } else if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        summary.stoppedBecause = 'falhas_seguidas';
      }
    }
  });

  if (summary.errors.length > 20) summary.errors = summary.errors.slice(0, 20);
  return summary;
}

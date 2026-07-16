import 'server-only';
import { and, eq, or, isNull, lt, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliatePriceWatches, affiliateOffers, affiliateNetworks } from '@/db/schema';
import { getOfferMetrics } from '@/server/queries/affiliate';
import { getBestActiveOfferIdsForMasterProducts } from '@/server/queries/price-watches';
import { PRICE_DROP_AVG_THRESHOLD_PERCENT, NOTIFY_COOLDOWN_DAYS } from './constants';

export interface QualifyingDrop {
  watchId: string;
  userId: string;
  masterProductId: string;
  offerId: string;
  offerSlug: string;
  title: string;
  networkName: string;
  currentPriceCents: number;
  lowestPriceCents: number;
  avgPriceCents30d: number | null;
  reason: 'new_low' | 'below_average';
}

/**
 * Carrega watches ativos fora do cooldown, resolve a melhor oferta de cada
 * master_product e aplica a regra de "vale a pena avisar": novo menor preço
 * histórico OU preço meaningfully abaixo da média de 30d (ver constants.ts).
 * Não manda nada aqui — só detecta (ver send-daily-digest.ts pro envio).
 */
export async function detectQualifyingWatches(): Promise<QualifyingDrop[]> {
  const watches = await db
    .select({
      watchId: affiliatePriceWatches.id,
      userId: affiliatePriceWatches.userId,
      masterProductId: affiliatePriceWatches.masterProductId,
    })
    .from(affiliatePriceWatches)
    .where(
      and(
        eq(affiliatePriceWatches.isActive, true),
        or(
          isNull(affiliatePriceWatches.lastNotifiedAt),
          lt(affiliatePriceWatches.lastNotifiedAt, sql`now() - make_interval(days => ${NOTIFY_COOLDOWN_DAYS})`)
        )
      )
    );

  if (watches.length === 0) return [];

  const bestOfferIds = await getBestActiveOfferIdsForMasterProducts(watches.map((w) => w.masterProductId));
  const offerIds = [...bestOfferIds.values()];
  if (offerIds.length === 0) return [];

  const offerRows = await db
    .select({
      id: affiliateOffers.id,
      slug: affiliateOffers.slug,
      title: affiliateOffers.title,
      networkName: affiliateNetworks.name,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(inArray(affiliateOffers.id, offerIds));

  const offerById = new Map(offerRows.map((o) => [o.id, o]));

  const results: QualifyingDrop[] = [];
  for (const watch of watches) {
    const offerId = bestOfferIds.get(watch.masterProductId);
    const offer = offerId ? offerById.get(offerId) : null;
    if (!offerId || !offer) continue; // jogo acompanhado sem oferta ativa agora

    const metrics = await getOfferMetrics(offerId);
    if (!metrics) continue;

    const isNewLow = metrics.currentPriceCents <= metrics.lowestPriceCents;
    const isBelowAvg =
      metrics.avgPriceCents30d != null &&
      metrics.currentPriceCents <= metrics.avgPriceCents30d * (1 - PRICE_DROP_AVG_THRESHOLD_PERCENT / 100);

    if (!isNewLow && !isBelowAvg) continue;

    results.push({
      watchId: watch.watchId,
      userId: watch.userId,
      masterProductId: watch.masterProductId,
      offerId,
      offerSlug: offer.slug,
      title: offer.title,
      networkName: offer.networkName,
      currentPriceCents: metrics.currentPriceCents,
      lowestPriceCents: metrics.lowestPriceCents,
      avgPriceCents30d: metrics.avgPriceCents30d,
      reason: isNewLow ? 'new_low' : 'below_average',
    });
  }

  return results;
}

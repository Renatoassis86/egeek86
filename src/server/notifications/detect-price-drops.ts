import 'server-only';
import { and, eq, or, isNull, lt, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliatePriceWatches, affiliateOffers, affiliateNetworks } from '@/db/schema';
import { getMasterProductPriceStatsBatchRaw } from '@/server/queries/product-price-stats';
import { computeLowBadge, computeVerdict } from '@/lib/affiliate/price-verdict';
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
  /** Média única do produto (todas as lojas, todo o histórico). null se o histórico não é elegível. */
  avgPriceCents: number | null;
  /** Preço-alvo do cliente quando existe. */
  targetPriceCents: number | null;
  reason: 'new_low' | 'below_average' | 'target_reached';
}

/**
 * Carrega watches ativos fora do cooldown e aplica a regra de "vale a pena
 * avisar" sobre a FONTE ÚNICA (product-price-stats.ts, ADR 0001) e só com
 * ofertas PÚBLICAS (ADR 0002: coleta real <= 7 dias, preço plausível):
 *  - com preço-alvo do cliente: avisa quando o menor preço público <= alvo
 *    (`target_reached`); o alvo é decisão do cliente, vale mesmo com histórico curto;
 *  - sem alvo: exige histórico elegível (>= 5 cotações e >= 14 dias) e avisa
 *    se for o menor preço registrado (`new_low`) ou estiver >= 12% abaixo da
 *    média única (`below_average`).
 * Não manda nada aqui — só detecta (ver send-daily-digest.ts pro envio).
 */
export async function detectQualifyingWatches(): Promise<QualifyingDrop[]> {
  const watches = await db
    .select({
      watchId: affiliatePriceWatches.id,
      userId: affiliatePriceWatches.userId,
      masterProductId: affiliatePriceWatches.masterProductId,
      targetPriceCents: affiliatePriceWatches.targetPriceCents,
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

  const statsByProduct = await getMasterProductPriceStatsBatchRaw(watches.map((w) => w.masterProductId));
  const offerIds = [
    ...new Set(
      watches
        .map((w) => statsByProduct.get(w.masterProductId)?.currentLowestActive?.offerId)
        .filter((v): v is string => !!v)
    ),
  ];
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
    const stats = statsByProduct.get(watch.masterProductId);
    const best = stats?.currentLowestActive;
    const offer = best ? offerById.get(best.offerId) : null;
    if (!stats || !best || !offer) continue; // jogo acompanhado sem oferta pública agora

    const current = best.priceCents;
    const lowest = stats.lowAll?.priceCents ?? current;
    const hist = { quoteCount: stats.quoteCount, historyDays: stats.historyDays };

    let reason: QualifyingDrop['reason'] | null = null;
    let avgForReport: number | null = null;
    if (watch.targetPriceCents != null) {
      if (current <= watch.targetPriceCents) reason = 'target_reached';
    } else {
      const verdict = computeVerdict({ currentCents: current, avgCents: stats.avgCents, ...hist });
      if (verdict.eligibility.eligible) avgForReport = stats.avgCents;
      if (computeLowBadge({ currentCents: current, lowestCents: lowest, ...hist })) reason = 'new_low';
      else if (verdict.kind === 'below' && verdict.deltaPercent != null && -verdict.deltaPercent >= PRICE_DROP_AVG_THRESHOLD_PERCENT) {
        reason = 'below_average';
      }
    }
    if (!reason) continue;

    results.push({
      watchId: watch.watchId,
      userId: watch.userId,
      masterProductId: watch.masterProductId,
      offerId: best.offerId,
      offerSlug: offer.slug,
      title: offer.title,
      networkName: offer.networkName,
      currentPriceCents: current,
      lowestPriceCents: lowest,
      avgPriceCents: avgForReport,
      targetPriceCents: watch.targetPriceCents,
      reason,
    });
  }

  return results;
}

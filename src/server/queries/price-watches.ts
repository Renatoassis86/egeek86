import 'server-only';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliatePriceWatches, masterProducts, affiliateOffers, affiliateNetworks } from '@/db/schema';
import { getOfferMetrics, type OfferMetrics } from './affiliate';
import type { GameFormat, GamePlatformGen } from '@/db/schema';

/**
 * Pra cada master_product, resolve a oferta ativa com o menor preço — o
 * "melhor preço do jogo agora", independente de qual rede/vendedor está na
 * frente. Usado tanto pelo dashboard do cliente quanto pelo job de alerta.
 */
export async function getBestActiveOfferIdsForMasterProducts(
  masterProductIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (masterProductIds.length === 0) return map;

  const rows = await db.execute<{ master_product_id: string; offer_id: string }>(sql`
    SELECT DISTINCT ON (master_product_id) master_product_id, id AS offer_id
    FROM affiliate_offers
    WHERE master_product_id IN (${sql.join(
      masterProductIds.map((id) => sql`${id}`),
      sql`, `
    )})
      AND status = 'active'
    ORDER BY master_product_id, current_price_cents ASC
  `);

  for (const row of rows) map.set(row.master_product_id, row.offer_id);
  return map;
}

export interface WatchListItem {
  watchId: string;
  masterProductId: string;
  offerId: string;
  offerSlug: string;
  title: string;
  imageUrl: string | null;
  networkName: string;
  gameFormat: GameFormat;
  gamePlatformGen: GamePlatformGen;
  currentPriceCents: number;
  metrics: OfferMetrics | null;
}

/**
 * Lista de jogos acompanhados pro dashboard do cliente. N chamadas a
 * getOfferMetrics (N = qtde de watches do usuário) — aceitável pra uma tela
 * de conta, não é hot path como a vitrine pública.
 */
export async function getUserWatches(userId: string): Promise<WatchListItem[]> {
  const watches = await db
    .select({
      watchId: affiliatePriceWatches.id,
      masterProductId: affiliatePriceWatches.masterProductId,
      masterProductName: masterProducts.name,
      gameFormat: masterProducts.gameFormat,
      gamePlatformGen: masterProducts.gamePlatformGen,
    })
    .from(affiliatePriceWatches)
    .innerJoin(masterProducts, eq(affiliatePriceWatches.masterProductId, masterProducts.id))
    .where(and(eq(affiliatePriceWatches.userId, userId), eq(affiliatePriceWatches.isActive, true)));

  if (watches.length === 0) return [];

  const bestOfferIds = await getBestActiveOfferIdsForMasterProducts(watches.map((w) => w.masterProductId));
  const offerIds = [...bestOfferIds.values()];
  if (offerIds.length === 0) return [];

  const offerRows = await db
    .select({
      id: affiliateOffers.id,
      slug: affiliateOffers.slug,
      title: affiliateOffers.title,
      imageUrl: affiliateOffers.imageUrl,
      currentPriceCents: affiliateOffers.currentPriceCents,
      networkName: affiliateNetworks.name,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(inArray(affiliateOffers.id, offerIds));

  const offerById = new Map(offerRows.map((o) => [o.id, o]));

  const items: WatchListItem[] = [];
  for (const watch of watches) {
    const offerId = bestOfferIds.get(watch.masterProductId);
    const offer = offerId ? offerById.get(offerId) : null;
    if (!offerId || !offer) continue; // jogo acompanhado sem nenhuma oferta ativa no momento

    const metrics = await getOfferMetrics(offerId);
    items.push({
      watchId: watch.watchId,
      masterProductId: watch.masterProductId,
      offerId,
      offerSlug: offer.slug,
      title: offer.title,
      imageUrl: offer.imageUrl,
      networkName: offer.networkName,
      gameFormat: watch.gameFormat,
      gamePlatformGen: watch.gamePlatformGen,
      currentPriceCents: offer.currentPriceCents,
      metrics,
    });
  }

  return items;
}

/** Só os IDs — pro estado inicial do botão de favoritar na página de oferta. */
export async function getWatchedMasterProductIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ masterProductId: affiliatePriceWatches.masterProductId })
    .from(affiliatePriceWatches)
    .where(and(eq(affiliatePriceWatches.userId, userId), eq(affiliatePriceWatches.isActive, true)));

  return new Set(rows.map((r) => r.masterProductId));
}

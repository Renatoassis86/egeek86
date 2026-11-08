import 'server-only';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliatePriceWatches, masterProducts, affiliateOffers, affiliateNetworks, affiliateSellers } from '@/db/schema';
import { getMasterProductMetricsBatch, type OfferMetrics } from './affiliate';
import { publicOffersCtes } from './public-offers';
import { catalogHiddenFilter } from './catalog-dimensions';
import { suggestTargetPriceCents } from '@/lib/affiliate/price-verdict';
import { fuzzyMatch } from '@/lib/db/fuzzy-search';
import type { GameFormat, GamePlatformGen } from '@/db/schema';
import { GAMES } from '@/lib/catalog/verticais';

/**
 * Pra cada master_product, resolve a oferta PÚBLICA (ADR 0002: ativa, preço > 0,
 * coleta real <= 7 dias, preço plausível) com o menor preço — o "melhor preço do
 * jogo agora", independente de qual rede/vendedor está na frente. Se a mais
 * barata sai, vale a próxima (concorrência real).
 */
export async function getBestActiveOfferIdsForMasterProducts(
  masterProductIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (masterProductIds.length === 0) return map;

  const rows = await db.execute<{ master_product_id: string; offer_id: string }>(sql`
    WITH ${publicOffersCtes(GAMES)}
    SELECT DISTINCT ON (po.master_product_id) po.master_product_id, po.id AS offer_id
    FROM public_offers po
    WHERE po.master_product_id IN (${sql.join(
      masterProductIds.map((id) => sql`${id}`),
      sql`, `
    )})
    ORDER BY po.master_product_id, po.current_price_cents ASC
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
  /** Escopo PRODUTO, fonte única. `metrics.eligibility.eligible=false` => "histórico curto" (média e selo vêm null/false). */
  metrics: OfferMetrics | null;
  /** Preço-alvo do alerta gravado pelo cliente (ou o sugerido ao acompanhar). null = sem alvo. */
  targetPriceCents: number | null;
  /** ceil(menor registrado * 1,05); só com histórico elegível, senão null (a UI não sugere alvo sem base). */
  suggestedTargetCents: number | null;
  sellerNickname: string | null;
  sellerReputationLevel: string | null;
  sellerPositiveRatingPercent: string | null;
  sellerPowerSellerStatus: string | null;
}

/**
 * Lista de jogos acompanhados pro dashboard do cliente. Métricas em lote da
 * fonte única (getMasterProductMetricsBatch), não mais N consultas pesadas.
 */
export async function getUserWatches(userId: string): Promise<WatchListItem[]> {
  const watches = await db
    .select({
      watchId: affiliatePriceWatches.id,
      masterProductId: affiliatePriceWatches.masterProductId,
      masterProductName: masterProducts.name,
      gameFormat: masterProducts.gameFormat,
      gamePlatformGen: masterProducts.gamePlatformGen,
      targetPriceCents: affiliatePriceWatches.targetPriceCents,
    })
    .from(affiliatePriceWatches)
    .innerJoin(masterProducts, eq(affiliatePriceWatches.masterProductId, masterProducts.id))
    .where(and(eq(affiliatePriceWatches.userId, userId), eq(affiliatePriceWatches.isActive, true), eq(masterProducts.vertical, GAMES)));

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
      sellerNickname: affiliateSellers.nickname,
      sellerReputationLevel: affiliateSellers.reputationLevel,
      sellerPositiveRatingPercent: affiliateSellers.positiveRatingPercent,
      sellerPowerSellerStatus: affiliateSellers.powerSellerStatus,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .leftJoin(affiliateSellers, eq(affiliateOffers.sellerId, affiliateSellers.id))
    .where(inArray(affiliateOffers.id, offerIds));

  const offerById = new Map(offerRows.map((o) => [o.id, o]));

  const metricsByProduct = await getMasterProductMetricsBatch(watches.map((w) => w.masterProductId));

  const items: WatchListItem[] = [];
  for (const watch of watches) {
    const offerId = bestOfferIds.get(watch.masterProductId);
    const offer = offerId ? offerById.get(offerId) : null;
    if (!offerId || !offer) continue; // jogo acompanhado sem nenhuma oferta ativa no momento

    const metrics = metricsByProduct.get(watch.masterProductId) ?? null;
    items.push({
      watchId: watch.watchId,
      masterProductId: watch.masterProductId,
      offerId,
      offerSlug: offer.slug,
      title: watch.masterProductName,
      imageUrl: offer.imageUrl,
      networkName: offer.networkName,
      gameFormat: watch.gameFormat,
      gamePlatformGen: watch.gamePlatformGen,
      currentPriceCents: offer.currentPriceCents,
      metrics,
      targetPriceCents: watch.targetPriceCents,
      suggestedTargetCents: metrics?.eligibility?.eligible ? suggestTargetPriceCents(metrics.lowestPriceCents) : null,
      sellerNickname: offer.sellerNickname,
      sellerReputationLevel: offer.sellerReputationLevel,
      sellerPositiveRatingPercent: offer.sellerPositiveRatingPercent,
      sellerPowerSellerStatus: offer.sellerPowerSellerStatus,
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

export interface WatchSearchResult {
  masterProductId: string;
  name: string;
  imageUrl: string | null;
  currentPriceCents: number | null;
  networkName: string | null;
  offerSlug: string | null;
  alreadyWatched: boolean;
}

/**
 * Busca por nome pra o campo "+ Adicionar símbolo" do painel de
 * Monitoramento (estilo TradingView) — resolve cada resultado pro seu
 * melhor preço ativo (mesma lógica de getUserWatches) e marca se o usuário
 * já acompanha, pra desenhar "Adicionado" em vez de duplicar o watch.
 */
export async function searchMasterProductsToWatch(query: string, userId?: string | null, limit = 8): Promise<WatchSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const fuzzy = fuzzyMatch([masterProducts.name], trimmed);
  if (!fuzzy) return [];

  // Busca um pool maior que o limite final — produto sem oferta ativa
  // precificada não tem nada pra monitorar (aparecia como "Sem oferta ativa
  // no momento" e mesmo assim deixava clicar "Adicionar"), então é
  // descartado abaixo antes do corte pelo `limit` real.
  const [candidateRows, watchedIds] = await Promise.all([
    db
      .select({ id: masterProducts.id, name: masterProducts.name, defaultImages: masterProducts.defaultImages })
      .from(masterProducts)
      // Monitoramento só oferece itens da cartela pública (sem merchandise/peças)
      .where(and(fuzzy, eq(masterProducts.vertical, GAMES), await catalogHiddenFilter(sql`${masterProducts.id}`)))
      .limit(limit * 4),
    userId ? getWatchedMasterProductIds(userId) : Promise.resolve(new Set<string>()),
  ]);

  if (candidateRows.length === 0) return [];

  const bestOfferIds = await getBestActiveOfferIdsForMasterProducts(candidateRows.map((r) => r.id));
  const rows = candidateRows.filter((r) => bestOfferIds.has(r.id)).slice(0, limit);
  if (rows.length === 0) return [];

  const offerIds = [...bestOfferIds.values()];
  const offerRows = offerIds.length
    ? await db
        .select({
          id: affiliateOffers.id,
          slug: affiliateOffers.slug,
          currentPriceCents: affiliateOffers.currentPriceCents,
          networkName: affiliateNetworks.name,
        })
        .from(affiliateOffers)
        .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
        .where(inArray(affiliateOffers.id, offerIds))
    : [];
  const offerById = new Map(offerRows.map((o) => [o.id, o]));

  return rows.map((r) => {
    const offerId = bestOfferIds.get(r.id);
    const offer = offerId ? offerById.get(offerId) : null;
    const images = r.defaultImages as unknown as string[] | null;
    return {
      masterProductId: r.id,
      name: r.name,
      imageUrl: images?.[0] ?? null,
      currentPriceCents: offer?.currentPriceCents ?? null,
      networkName: offer?.networkName ?? null,
      offerSlug: offer?.slug ?? null,
      alreadyWatched: watchedIds.has(r.id),
    };
  });
}

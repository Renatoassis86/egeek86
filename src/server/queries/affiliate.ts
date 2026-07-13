import 'server-only';
import { and, count, desc, asc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  affiliateOffers,
  affiliateNetworks,
  affiliateCoupons,
  affiliateMessages,
  affiliateSellers,
  masterProducts,
  analyticsEvents,
  type AffiliateOffer,
  type AffiliateNetwork,
  type AffiliateCoupon,
  type AffiliateSeller,
  type MasterProduct,
  type GameFormat,
  type GamePlatformGen,
  type GameEditionType,
} from '@/db/schema';

type MasterProductPick = Pick<
  MasterProduct,
  | 'id'
  | 'name'
  | 'slug'
  | 'defaultImages'
  | 'gameFormat'
  | 'gamePlatformGen'
  | 'gameEditionType'
  | 'gameEditionSource'
  | 'gameCollection'
  | 'meliCatalogId'
>;
type SellerPick = Pick<AffiliateSeller, 'id' | 'nickname' | 'reputationLevel' | 'powerSellerStatus' | 'totalSales' | 'positiveRatingPercent'> | null;

export interface OfferWithRelations extends AffiliateOffer {
  masterProduct: MasterProductPick;
  network: Pick<AffiliateNetwork, 'id' | 'name' | 'slug' | 'colorHex'>;
  seller: SellerPick;
}

/** Config de seleção (colunas) para os JOINs — usado apenas para montar a query. */
function offerSelection() {
  return {
    offer: affiliateOffers,
    masterProduct: {
      id: masterProducts.id,
      name: masterProducts.name,
      slug: masterProducts.slug,
      defaultImages: masterProducts.defaultImages,
      gameFormat: masterProducts.gameFormat,
      gamePlatformGen: masterProducts.gamePlatformGen,
      gameEditionType: masterProducts.gameEditionType,
      gameEditionSource: masterProducts.gameEditionSource,
      gameCollection: masterProducts.gameCollection,
      meliCatalogId: masterProducts.meliCatalogId,
    },
    network: {
      id: affiliateNetworks.id,
      name: affiliateNetworks.name,
      slug: affiliateNetworks.slug,
      colorHex: affiliateNetworks.colorHex,
    },
    seller: {
      id: affiliateSellers.id,
      nickname: affiliateSellers.nickname,
      reputationLevel: affiliateSellers.reputationLevel,
      powerSellerStatus: affiliateSellers.powerSellerStatus,
      totalSales: affiliateSellers.totalSales,
      positiveRatingPercent: affiliateSellers.positiveRatingPercent,
    },
  };
}

/** Shape da ROW retornada em runtime pela query acima (não confundir com offerSelection). */
interface OfferRow {
  offer: AffiliateOffer;
  masterProduct: MasterProductPick;
  network: Pick<AffiliateNetwork, 'id' | 'name' | 'slug' | 'colorHex'>;
  seller: SellerPick;
}

function toOfferWithRelations(row: OfferRow): OfferWithRelations {
  return { ...row.offer, masterProduct: row.masterProduct, network: row.network, seller: row.seller };
}

/** JOINs comuns a toda query de oferta — LEFT JOIN em seller pois sellerId é opcional. */
function baseOfferQuery() {
  return db
    .select(offerSelection())
    .from(affiliateOffers)
    .innerJoin(masterProducts, eq(affiliateOffers.masterProductId, masterProducts.id))
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .leftJoin(affiliateSellers, eq(affiliateOffers.sellerId, affiliateSellers.id));
}

/** Vitrine pública — só ofertas ativas, mais recentes primeiro. */
export async function getPublicOffers(limit = 24): Promise<OfferWithRelations[]> {
  const rows = await baseOfferQuery()
    .where(eq(affiliateOffers.status, 'active'))
    .orderBy(desc(affiliateOffers.publishedAt))
    .limit(limit);

  return rows.map(toOfferWithRelations);
}

/** Detalhe público — só retorna se estiver ativa. */
export async function getOfferBySlug(slug: string): Promise<OfferWithRelations | null> {
  const [row] = await baseOfferQuery()
    .where(and(eq(affiliateOffers.slug, slug), eq(affiliateOffers.status, 'active')))
    .limit(1);

  return row ? toOfferWithRelations(row) : null;
}

/** Admin — qualquer status, usado nas telas de edição/geração de mensagem. */
export async function getOfferByIdForAdmin(id: string): Promise<OfferWithRelations | null> {
  const [row] = await baseOfferQuery()
    .where(eq(affiliateOffers.id, id))
    .limit(1);

  return row ? toOfferWithRelations(row) : null;
}

/** Admin — lista todas as ofertas (qualquer status), mais recentes primeiro. */
export async function listOffersForAdmin(): Promise<OfferWithRelations[]> {
  const rows = await baseOfferQuery().orderBy(desc(affiliateOffers.createdAt));

  return rows.map(toOfferWithRelations);
}

export interface RankedOffersFilter {
  gameFormat?: GameFormat;
  gamePlatformGen?: GamePlatformGen;
  gameEditionType?: GameEditionType;
  networkId?: string;
  minSellerSales?: number;
  sortBy?: 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
}

/**
 * Ranking/filtro pro dashboard — compõe várias chamadas (ex: uma por
 * gameFormat/gamePlatformGen) em vez de tentar uma única query com toda
 * a ordenação embutida; fica mais simples de renderizar em seções/tabs.
 */
export async function listRankedOffers(filter: RankedOffersFilter = {}): Promise<OfferWithRelations[]> {
  const conditions: SQL[] = [eq(affiliateOffers.status, 'active')];
  if (filter.gameFormat) conditions.push(eq(masterProducts.gameFormat, filter.gameFormat));
  if (filter.gamePlatformGen) conditions.push(eq(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  if (filter.gameEditionType) conditions.push(eq(masterProducts.gameEditionType, filter.gameEditionType));
  if (filter.networkId) conditions.push(eq(affiliateOffers.networkId, filter.networkId));
  if (filter.minSellerSales != null) conditions.push(sql`${affiliateSellers.totalSales} >= ${filter.minSellerSales}`);

  const orderColumn = filter.sortBy === 'price_desc' ? desc(affiliateOffers.currentPriceCents) : asc(affiliateOffers.currentPriceCents);

  const rows = await baseOfferQuery()
    .where(and(...conditions))
    .orderBy(orderColumn)
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0);

  return rows.map(toOfferWithRelations);
}

export async function listNetworks(): Promise<AffiliateNetwork[]> {
  return db.select().from(affiliateNetworks).orderBy(affiliateNetworks.name);
}

export async function listActiveCouponsByNetwork(networkId: string): Promise<AffiliateCoupon[]> {
  return db
    .select()
    .from(affiliateCoupons)
    .where(and(eq(affiliateCoupons.networkId, networkId), eq(affiliateCoupons.status, 'active')))
    .orderBy(desc(affiliateCoupons.createdAt));
}

export async function listCouponsForAdmin(): Promise<AffiliateCoupon[]> {
  return db.select().from(affiliateCoupons).orderBy(desc(affiliateCoupons.createdAt));
}

export interface RankedCouponsFilter {
  networkId?: string;
  sortBy?: 'discount_desc' | 'expiring_soon';
}

/**
 * Nota: discountValue não é comparável entre discountType diferentes (5% vs
 * R$10 vs frete grátis) — "discount_desc" é heurística best-effort (só
 * confiável quando a lista já é homogênea em discountType); não resolvemos
 * normalização entre tipos agora.
 */
export async function listActiveCouponsRanked(filter: RankedCouponsFilter = {}): Promise<AffiliateCoupon[]> {
  const conditions: SQL[] = [eq(affiliateCoupons.status, 'active')];
  if (filter.networkId) conditions.push(eq(affiliateCoupons.networkId, filter.networkId));

  const orderColumn =
    filter.sortBy === 'expiring_soon' ? asc(affiliateCoupons.validUntil) : desc(affiliateCoupons.discountValue);

  return db
    .select()
    .from(affiliateCoupons)
    .where(and(...conditions))
    .orderBy(orderColumn);
}

export interface MessageWithOffer {
  id: string;
  messageText: string;
  priceCentsAtSend: number;
  channel: string;
  destination: string | null;
  createdAt: Date;
  offerTitle: string;
  offerSlug: string;
}

export async function listMessagesForAdmin(limit = 100): Promise<MessageWithOffer[]> {
  const rows = await db
    .select({
      id: affiliateMessages.id,
      messageText: affiliateMessages.messageText,
      priceCentsAtSend: affiliateMessages.priceCentsAtSend,
      channel: affiliateMessages.channel,
      destination: affiliateMessages.destination,
      createdAt: affiliateMessages.createdAt,
      offerTitle: affiliateOffers.title,
      offerSlug: affiliateOffers.slug,
    })
    .from(affiliateMessages)
    .innerJoin(affiliateOffers, eq(affiliateMessages.offerId, affiliateOffers.id))
    .orderBy(desc(affiliateMessages.createdAt))
    .limit(limit);

  return rows;
}

export interface OfferMetrics {
  currentPriceCents: number;
  lowestPriceCents: number;
  lowestPriceAt: Date;
  avgPriceCents30d: number | null;
  discountVsLowestPercent: number;
  trend: 'up' | 'down' | 'stable';
  snapshotCount: number;
}

/**
 * Métricas simples via SQL sobre affiliate_price_snapshots (menor histórico,
 * média 30d, tendência). NÃO é o Geek Index™ (nota 0-100) — isso é roadmap
 * futuro, fora de escopo desta fase.
 */
export async function getOfferMetrics(offerId: string): Promise<OfferMetrics | null> {
  const aggRows = await db.execute<{
    lowest_price_cents: string | null;
    lowest_price_at: string | null;
    avg_price_30d: string | null;
    snapshot_count: string;
  }>(sql`
    SELECT
      MIN(price_cents)::bigint AS lowest_price_cents,
      (SELECT collected_at FROM affiliate_price_snapshots
        WHERE offer_id = ${offerId} ORDER BY price_cents ASC, collected_at ASC LIMIT 1) AS lowest_price_at,
      AVG(price_cents) FILTER (WHERE collected_at >= now() - interval '30 days')::numeric AS avg_price_30d,
      COUNT(*)::int AS snapshot_count
    FROM affiliate_price_snapshots WHERE offer_id = ${offerId}
  `);
  const agg = aggRows[0];
  if (!agg || Number(agg.snapshot_count) === 0 || !agg.lowest_price_cents) return null;

  const lastTwoRows = await db.execute<{ price_cents: string }>(sql`
    SELECT price_cents FROM affiliate_price_snapshots
    WHERE offer_id = ${offerId} ORDER BY collected_at DESC LIMIT 2
  `);
  const [last, prev] = lastTwoRows;
  const lastPrice = Number(last.price_cents);
  const prevPrice = prev ? Number(prev.price_cents) : null;
  const trend: OfferMetrics['trend'] =
    prevPrice === null ? 'stable' : lastPrice < prevPrice ? 'down' : lastPrice > prevPrice ? 'up' : 'stable';

  const lowest = Number(agg.lowest_price_cents);
  return {
    currentPriceCents: lastPrice,
    lowestPriceCents: lowest,
    lowestPriceAt: new Date(agg.lowest_price_at!),
    avgPriceCents30d: agg.avg_price_30d ? Number(agg.avg_price_30d) : null,
    discountVsLowestPercent: lowest > 0 ? Math.round(((lastPrice - lowest) / lowest) * 100) : 0,
    trend,
    snapshotCount: Number(agg.snapshot_count),
  };
}

export interface AdminDashboardMetrics {
  activeOffersCount: number;
  totalOffersCount: number;
  activeCouponsCount: number;
  clicks7d: number;
  clicks30d: number;
  messagesThisWeek: number;
  couponsExpiringSoon: number;
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const sevenDaysAgo = sql`now() - interval '7 days'`;
  const thirtyDaysAgo = sql`now() - interval '30 days'`;
  const sevenDaysFromNow = sql`now() + interval '7 days'`;

  const [
    [{ value: activeOffersCount }],
    [{ value: totalOffersCount }],
    [{ value: activeCouponsCount }],
    [{ value: clicks7d }],
    [{ value: clicks30d }],
    [{ value: messagesThisWeek }],
    [{ value: couponsExpiringSoon }],
  ] = await Promise.all([
    db.select({ value: count() }).from(affiliateOffers).where(eq(affiliateOffers.status, 'active')),
    db.select({ value: count() }).from(affiliateOffers),
    db.select({ value: count() }).from(affiliateCoupons).where(eq(affiliateCoupons.status, 'active')),
    db
      .select({ value: count() })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.eventName, 'affiliate_click'), gte(analyticsEvents.createdAt, sevenDaysAgo))),
    db
      .select({ value: count() })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.eventName, 'affiliate_click'), gte(analyticsEvents.createdAt, thirtyDaysAgo))),
    db.select({ value: count() }).from(affiliateMessages).where(gte(affiliateMessages.createdAt, sevenDaysAgo)),
    db
      .select({ value: count() })
      .from(affiliateCoupons)
      .where(
        and(
          eq(affiliateCoupons.status, 'active'),
          sql`${affiliateCoupons.validUntil} IS NOT NULL AND ${affiliateCoupons.validUntil} BETWEEN now() AND ${sevenDaysFromNow}`
        )
      ),
  ]);

  return {
    activeOffersCount,
    totalOffersCount,
    activeCouponsCount,
    clicks7d,
    clicks30d,
    messagesThisWeek,
    couponsExpiringSoon,
  };
}

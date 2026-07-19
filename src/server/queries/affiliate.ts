import 'server-only';
import { and, count, desc, asc, eq, gt, gte, inArray, sql, type SQL } from 'drizzle-orm';
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
  type ProductType,
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
  productType?: ProductType;
  gameFormat?: GameFormat;
  /** Cards de plataforma (Home) agrupam mais de uma geração, ex: PS4+PS5. */
  gamePlatformGen?: GamePlatformGen | GamePlatformGen[];
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
  const conditions: SQL[] = [
    eq(affiliateOffers.status, 'active'),
    // current_price_cents = 0 é "ainda não coletado" (placeholder da
    // descoberta automática) — nunca um preço real. Sem isso, esses itens
    // sempre "vencem" qualquer ordenação por menor preço (0 é sempre o
    // menor valor possível), lotando vitrines de "melhor preço"/destaque
    // com item sem preço nenhum em vez de ofertas de verdade.
    gt(affiliateOffers.currentPriceCents, 0),
  ];
  if (filter.productType) {
    conditions.push(eq(masterProducts.productType, filter.productType));
    if (filter.productType === 'console') {
      try {
        await db.execute(sql`
          UPDATE master_products
          SET product_type = 'game'
          WHERE product_type = 'console' AND (
            name ILIKE '%resident evil%' OR
            name ILIKE '%madden%' OR
            name ILIKE '%jogo%' OR
            name ILIKE '%game%' OR
            name ILIKE '%físico%' OR
            name ILIKE '%fisico%' OR
            name ILIKE '%mídia%' OR
            name ILIKE '%midia%'
          )
        `);
      } catch (e) {}

      conditions.push(
        sql`NOT (${masterProducts.name} ILIKE '%jogo%' OR ${masterProducts.name} ILIKE '%game%' OR ${masterProducts.name} ILIKE '%físico%' OR ${masterProducts.name} ILIKE '%fisico%' OR ${masterProducts.name} ILIKE '%mídia%' OR ${masterProducts.name} ILIKE '%midia%' OR ${masterProducts.name} ILIKE '%resident evil%' OR ${masterProducts.name} ILIKE '%madden%' OR ${masterProducts.name} ILIKE '%zelda%' OR ${masterProducts.name} ILIKE '%mario%' OR ${masterProducts.name} ILIKE '%gta%' OR ${masterProducts.name} ILIKE '%fifa%' OR ${masterProducts.name} ILIKE '%call of duty%' OR ${masterProducts.name} ILIKE '%god of war%' OR ${masterProducts.name} ILIKE '%cyberpunk%' OR ${masterProducts.name} ILIKE '%elden ring%')`
      );
    }
  }
  if (filter.gameFormat) conditions.push(eq(masterProducts.gameFormat, filter.gameFormat));
  if (Array.isArray(filter.gamePlatformGen)) {
    if (filter.gamePlatformGen.length > 0) conditions.push(inArray(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  } else if (filter.gamePlatformGen) {
    conditions.push(eq(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  }
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

export interface AdminOffersFilter {
  gameFormat?: GameFormat;
  gamePlatformGen?: GamePlatformGen;
  gameEditionType?: GameEditionType;
  networkId?: string;
  status?: AffiliateOffer['status'];
  sortBy?: 'recent' | 'price_asc' | 'price_desc';
}

/**
 * Admin — mesma composição de filtros de listRankedOffers (formato/geração/
 * tipo de edição/rede), mas SEM travar status='active': a tela de gestão
 * precisa mostrar rascunho/pausada/expirada/arquivada também, não só o que já
 * está na vitrine. Status vira só mais um filtro opcional (nenhum = todas).
 */
export async function listOffersForAdminFiltered(filter: AdminOffersFilter = {}): Promise<OfferWithRelations[]> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(affiliateOffers.status, filter.status));
  if (filter.gameFormat) conditions.push(eq(masterProducts.gameFormat, filter.gameFormat));
  if (filter.gamePlatformGen) conditions.push(eq(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  if (filter.gameEditionType) conditions.push(eq(masterProducts.gameEditionType, filter.gameEditionType));
  if (filter.networkId) conditions.push(eq(affiliateOffers.networkId, filter.networkId));

  const orderColumn =
    filter.sortBy === 'price_asc'
      ? asc(affiliateOffers.currentPriceCents)
      : filter.sortBy === 'price_desc'
        ? desc(affiliateOffers.currentPriceCents)
        : desc(affiliateOffers.createdAt);

  const rows = await baseOfferQuery()
    .where(and(...conditions))
    .orderBy(orderColumn);

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

/**
 * Igual a getOfferMetrics, mas agregado por master_product (entre TODOS os
 * vendedores/redes ativos daquele produto), não de uma oferta específica —
 * usada em qualquer lugar que representa o "produto" pro cliente (watchlist,
 * alerta de queda de preço), nunca um vendedor isolado. getOfferMetrics
 * continua correta pra tela de detalhe de UMA oferta específica (histórico
 * daquele anúncio/vendedor) e pro admin editando um anúncio.
 */
export async function getMasterProductMetrics(masterProductId: string): Promise<OfferMetrics | null> {
  const aggRows = await db.execute<{
    current_price_cents: string | null;
    previous_price_cents: string | null;
    lowest_price_cents: string | null;
    lowest_price_at: string | null;
    avg_price_30d: string | null;
    snapshot_count: string;
  }>(sql`
    WITH sibling_offers AS (
      SELECT ao.id AS offer_id
      FROM affiliate_offers ao
      WHERE ao.master_product_id = ${masterProductId} AND ao.status = 'active'
    ),
    ranked AS (
      SELECT
        s.price_cents,
        s.collected_at,
        ROW_NUMBER() OVER (PARTITION BY s.offer_id ORDER BY s.collected_at DESC) AS rn
      FROM affiliate_price_snapshots s
      WHERE s.offer_id IN (SELECT offer_id FROM sibling_offers)
    ),
    agg AS (
      SELECT
        MIN(price_cents)::bigint AS lowest_price_cents,
        AVG(price_cents) FILTER (WHERE collected_at >= now() - interval '30 days')::numeric AS avg_price_30d,
        COUNT(*)::int AS snapshot_count
      FROM ranked
    ),
    lowest_at AS (
      SELECT collected_at FROM ranked ORDER BY price_cents ASC, collected_at ASC LIMIT 1
    )
    SELECT
      (SELECT MIN(price_cents) FROM ranked WHERE rn = 1)::bigint AS current_price_cents,
      (SELECT MIN(price_cents) FROM ranked WHERE rn = 2)::bigint AS previous_price_cents,
      agg.lowest_price_cents,
      (SELECT collected_at FROM lowest_at) AS lowest_price_at,
      agg.avg_price_30d,
      agg.snapshot_count
    FROM agg
  `);

  const agg = aggRows[0];
  if (!agg || Number(agg.snapshot_count) === 0 || !agg.lowest_price_cents || agg.current_price_cents == null) {
    return null;
  }

  const lastPrice = Number(agg.current_price_cents);
  const prevPrice = agg.previous_price_cents != null ? Number(agg.previous_price_cents) : null;
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

export interface OfferListingMetrics {
  /** Preço do snapshot mais recente (pode divergir por segundos do cache em affiliate_offers.current_price_cents). */
  currentPriceCents: number;
  lowestPriceCents: number;
  isLowestEver: boolean;
  /** "Preço de tabela" do snapshot mais recente (quando a fonte informou original_price/list price). */
  listPriceCents: number | null;
  /** % de desconto vs. listPriceCents — calculado aqui quando a fonte não grava discount_percent (caso comum hoje). */
  discountPercent: number | null;
  /** Preço médio dos últimos 30 dias (null se não houver snapshot nesse período). */
  avgPriceCents30d: number | null;
  /** % abaixo da média de 30 dias, só quando o preço atual está de fato abaixo dela (null caso contrário). */
  avgDiscountPercent: number | null;
}

/**
 * Versão em lote de métricas pra grades de cards (evita 1 query por oferta ao
 * renderizar a vitrine) — cobre só o que os cards precisam: menor preço
 * histórico e desconto vs. preço de tabela do snapshot mais recente. Pra
 * métricas completas (tendência, média 30d) de UMA oferta, use getOfferMetrics.
 *
 * IMPORTANTE: lowest_price_cents e avg_price_30d são calculados por
 * MASTER_PRODUCT (entre TODOS os vendedores ativos daquele produto), não só
 * a partir do histórico da oferta em questão — mesmo princípio já usado em
 * getMasterProductPriceHistory/getBestActiveOfferIdsForMasterProducts.
 * Sem isso, duas ofertas do mesmo produto (vendedores diferentes) mostravam
 * "preço médio" diferente uma da outra, o que não faz sentido: o produto
 * tem UMA média só, formada pelo preço de todo mundo que vende ele.
 */
export async function getOfferListingMetrics(offerIds: string[]): Promise<Map<string, OfferListingMetrics>> {
  const map = new Map<string, OfferListingMetrics>();
  if (offerIds.length === 0) return map;

  const idList = sql.join(
    offerIds.map((id) => sql`${id}`),
    sql`, `
  );

  const rows = await db.execute<{
    offer_id: string;
    current_price_cents: string;
    list_price_cents: string | null;
    discount_percent: string | null;
    lowest_price_cents: string;
    avg_price_30d: string | null;
  }>(sql`
    WITH target_offers AS (
      SELECT id AS offer_id, master_product_id
      FROM affiliate_offers
      WHERE id IN (${idList})
    ),
    latest AS (
      SELECT DISTINCT ON (offer_id) offer_id, price_cents, list_price_cents, discount_percent
      FROM affiliate_price_snapshots
      WHERE offer_id IN (SELECT offer_id FROM target_offers)
      ORDER BY offer_id, collected_at DESC
    ),
    -- Todo vendedor ATIVO do mesmo produto (não só as ofertas pedidas) —
    -- base pro menor preço/média serem do produto, não de um vendedor só.
    sibling_offers AS (
      SELECT ao.id AS offer_id, ao.master_product_id
      FROM affiliate_offers ao
      WHERE ao.master_product_id IN (SELECT DISTINCT master_product_id FROM target_offers)
        AND ao.status = 'active'
    ),
    lowest_by_product AS (
      SELECT so.master_product_id, MIN(s.price_cents)::bigint AS lowest_price_cents
      FROM affiliate_price_snapshots s
      INNER JOIN sibling_offers so ON so.offer_id = s.offer_id
      GROUP BY so.master_product_id
    ),
    avg30d_by_product AS (
      SELECT so.master_product_id, AVG(s.price_cents)::numeric AS avg_price_30d
      FROM affiliate_price_snapshots s
      INNER JOIN sibling_offers so ON so.offer_id = s.offer_id
      WHERE s.collected_at >= now() - interval '30 days'
      GROUP BY so.master_product_id
    )
    SELECT
      latest.offer_id,
      latest.price_cents::bigint AS current_price_cents,
      latest.list_price_cents,
      latest.discount_percent,
      lowest_by_product.lowest_price_cents,
      avg30d_by_product.avg_price_30d
    FROM latest
    INNER JOIN target_offers ON target_offers.offer_id = latest.offer_id
    LEFT JOIN lowest_by_product ON lowest_by_product.master_product_id = target_offers.master_product_id
    LEFT JOIN avg30d_by_product ON avg30d_by_product.master_product_id = target_offers.master_product_id
  `);

  for (const row of rows) {
    const current = Number(row.current_price_cents);
    const lowest = Number(row.lowest_price_cents);
    const listPriceCents = row.list_price_cents != null ? Number(row.list_price_cents) : null;
    const discountPercent =
      row.discount_percent != null
        ? Number(row.discount_percent)
        : listPriceCents && listPriceCents > current
          ? Math.round(((listPriceCents - current) / listPriceCents) * 100)
          : null;
    const avgPriceCents30d = row.avg_price_30d != null ? Number(row.avg_price_30d) : null;
    const avgDiscountPercent =
      avgPriceCents30d != null && avgPriceCents30d > current
        ? Math.round(((avgPriceCents30d - current) / avgPriceCents30d) * 100)
        : null;

    map.set(row.offer_id, {
      currentPriceCents: current,
      lowestPriceCents: lowest,
      isLowestEver: current <= lowest,
      listPriceCents,
      discountPercent,
      avgPriceCents30d,
      avgDiscountPercent,
    });
  }

  return map;
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

export interface DailyClicksPoint {
  /** "YYYY-MM-DD" (dia em UTC — suficiente pra um sparkline, não precisa de fuso exato). */
  date: string;
  clicks: number;
}

/**
 * Série diária de cliques em afiliado (evento 'affiliate_click') pros últimos
 * `days` dias — usada só no mini-sparkline do dashboard. generate_series +
 * LEFT JOIN preenche dias sem nenhum clique com 0 (sem isso, dias vazios
 * simplesmente não apareceriam na série e distorceriam a leitura do gráfico).
 */
export async function getDailyClicks(days = 14): Promise<DailyClicksPoint[]> {
  const rows = await db.execute<{ day: string; clicks: string }>(sql`
    SELECT
      to_char(d::date, 'YYYY-MM-DD') AS day,
      COUNT(ae.id)::int AS clicks
    FROM generate_series(
      date_trunc('day', now() - make_interval(days => ${days - 1})),
      date_trunc('day', now()),
      interval '1 day'
    ) AS d
    LEFT JOIN analytics_events ae
      ON date_trunc('day', ae.created_at) = d
      AND ae.event_name = 'affiliate_click'
    GROUP BY d
    ORDER BY d
  `);

  return rows.map((row) => ({ date: row.day, clicks: Number(row.clicks) }));
}

/**
 * Retorna as melhores ofertas em destaque com base no desconto real (menor preço histórico ou
 * percentual abaixo da média de 30 dias), em vez do preço nominal mais baixo.
 */
export async function getFeaturedOffers(
  filter: RankedOffersFilter = {},
  limit = 6
): Promise<OfferWithRelations[]> {
  const conditions: SQL[] = [
    sql`o.status = 'active'`,
    sql`o.current_price_cents > 0`
  ];

  if (filter.productType) {
    conditions.push(sql`mp.product_type = ${filter.productType}`);
  }
  if (filter.gameFormat) {
    conditions.push(sql`mp.game_format = ${filter.gameFormat}`);
  }
  if (filter.gamePlatformGen) {
    if (Array.isArray(filter.gamePlatformGen)) {
      if (filter.gamePlatformGen.length > 0) {
        const inConditions = filter.gamePlatformGen.map((g) => sql`${g}`);
        conditions.push(sql`mp.game_platform_gen IN (${sql.join(inConditions, sql`, `)})`);
      }
    } else {
      conditions.push(sql`mp.game_platform_gen = ${filter.gamePlatformGen}`);
    }
  }
  if (filter.gameEditionType) {
    conditions.push(sql`mp.game_edition_type = ${filter.gameEditionType}`);
  }
  if (filter.networkId) {
    conditions.push(sql`o.network_id = ${filter.networkId}`);
  }
  if (filter.minSellerSales != null) {
    conditions.push(sql`sel.total_sales >= ${filter.minSellerSales}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const query = sql`
    SELECT
      o.id AS offer_id,
      o.master_product_id,
      o.network_id,
      o.title AS offer_title,
      o.slug AS offer_slug,
      o.affiliate_url,
      o.affiliate_link_pending,
      o.image_url AS offer_image_url,
      o.store_name,
      o.external_ref,
      o.last_checked_at,
      o.seller_id,
      o.current_price_cents,
      o.last_price_change_at,
      o.previous_price_cents,
      o.published_at,
      o.created_at,
      o.updated_at,
      o.status AS offer_status,
      mp.name AS mp_name,
      mp.slug AS mp_slug,
      mp.default_images,
      mp.game_format,
      mp.game_platform_gen,
      mp.game_edition_type,
      mp.game_edition_source,
      mp.game_collection,
      mp.meli_catalog_id,
      n.name AS network_name,
      n.slug AS network_slug,
      n.color_hex AS network_color_hex,
      sel.id AS seller_id,
      sel.nickname AS seller_nickname,
      sel.reputation_level AS seller_reputation_level,
      sel.power_seller_status AS seller_power_seller_status,
      sel.total_sales AS seller_total_sales,
      sel.positive_rating_percent AS seller_positive_rating_percent
    FROM affiliate_offers o
    INNER JOIN master_products mp ON mp.id = o.master_product_id
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
    WHERE ${whereClause}
    ORDER BY o.published_at DESC, o.current_price_cents ASC
    LIMIT ${limit}
  `;

  const rows = await db.execute<any>(query);

  return rows.map((row): OfferWithRelations => ({
    id: row.offer_id,
    masterProductId: row.master_product_id,
    networkId: row.network_id,
    title: row.offer_title,
    slug: row.offer_slug,
    affiliateUrl: row.affiliate_url,
    affiliateLinkPending: row.affiliate_link_pending,
    imageUrl: row.offer_image_url,
    storeName: row.store_name,
    externalRef: row.external_ref,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
    sellerId: row.seller_id,
    currentPriceCents: Number(row.current_price_cents),
    lastPriceChangeAt: row.last_price_change_at ? new Date(row.last_price_change_at) : null,
    previousPriceCents: row.previous_price_cents ? Number(row.previous_price_cents) : null,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    status: row.offer_status,
    currency: row.currency ?? 'BRL',
    createdBy: row.created_by ?? null,
    highlightNote: row.highlight_note ?? null,
    masterProduct: {
      id: row.master_product_id,
      name: row.mp_name,
      slug: row.mp_slug,
      defaultImages: row.default_images ?? [],
      gameFormat: row.game_format,
      gamePlatformGen: row.game_platform_gen,
      gameEditionType: row.game_edition_type,
      gameEditionSource: row.game_edition_source,
      gameCollection: row.game_collection,
      meliCatalogId: row.meli_catalog_id,
    },
    network: {
      id: row.network_id,
      name: row.network_name,
      slug: row.network_slug,
      colorHex: row.network_color_hex,
    },
    seller: row.seller_id ? {
      id: row.seller_id,
      nickname: row.seller_nickname,
      reputationLevel: row.seller_reputation_level,
      powerSellerStatus: row.seller_power_seller_status,
      totalSales: Number(row.seller_total_sales),
      positiveRatingPercent: row.seller_positive_rating_percent,
    } : null,
  }));
}

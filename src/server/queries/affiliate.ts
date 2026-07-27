import 'server-only';
import { and, count, desc, asc, eq, gt, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fuzzyMatch } from '@/lib/db/fuzzy-search';
import { createCachedQuery } from '@/lib/cache/server-cache';
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

/**
 * Vitrine pública — só ofertas ativas, mais recentes primeiro. Deduplicada
 * por master_product (só a oferta mais barata daquele produto entra): sem
 * isso, o mesmo jogo vendido em 3 lojas diferentes ocupa 3 vagas da vitrine
 * em vez de outros 3 produtos distintos.
 */
export async function getPublicOffers(limit = 24): Promise<OfferWithRelations[]> {
  const dedupRows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT ON (${affiliateOffers.masterProductId}) ${affiliateOffers.id} AS id
    FROM ${affiliateOffers}
    WHERE ${affiliateOffers.status} = 'active' AND ${affiliateOffers.currentPriceCents} > 0
    ORDER BY ${affiliateOffers.masterProductId}, ${affiliateOffers.currentPriceCents} ASC
  `);
  const dedupedIds = dedupRows.map((r) => r.id);
  if (dedupedIds.length === 0) return [];

  const rows = await baseOfferQuery()
    .where(inArray(affiliateOffers.id, dedupedIds))
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
  /** Busca livre por nome — casa contra o título da oferta OU o nome do produto master. */
  search?: string;
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
      } catch (e) { }

      conditions.push(
        sql`NOT (${masterProducts.name} ILIKE '%jogo%' OR ${masterProducts.name} ILIKE '%game%' OR ${masterProducts.name} ILIKE '%físico%' OR ${masterProducts.name} ILIKE '%fisico%' OR ${masterProducts.name} ILIKE '%mídia%' OR ${masterProducts.name} ILIKE '%midia%' OR ${masterProducts.name} ILIKE '%resident evil%' OR ${masterProducts.name} ILIKE '%madden%' OR ${masterProducts.name} ILIKE '%zelda%' OR ${masterProducts.name} ILIKE '%mario%' OR ${masterProducts.name} ILIKE '%gta%' OR ${masterProducts.name} ILIKE '%fifa%' OR ${masterProducts.name} ILIKE '%call of duty%' OR ${masterProducts.name} ILIKE '%god of war%' OR ${masterProducts.name} ILIKE '%cyberpunk%' OR ${masterProducts.name} ILIKE '%elden ring%')`
      );
    }
  }
  if (filter.gameFormat) {
    conditions.push(eq(masterProducts.gameFormat, filter.gameFormat));
  }
  if (Array.isArray(filter.gamePlatformGen)) {
    if (filter.gamePlatformGen.length > 0) conditions.push(inArray(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  } else if (filter.gamePlatformGen) {
    conditions.push(eq(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  }
  if (filter.gameEditionType) conditions.push(eq(masterProducts.gameEditionType, filter.gameEditionType));
  if (filter.networkId) conditions.push(eq(affiliateOffers.networkId, filter.networkId));
  if (filter.minSellerSales != null) conditions.push(sql`${affiliateSellers.totalSales} >= ${filter.minSellerSales}`);
  if (filter.search?.trim()) {
    const fuzzy = fuzzyMatch([masterProducts.name, affiliateOffers.title], filter.search);
    if (fuzzy) conditions.push(fuzzy);
  }

  const whereClause = and(...conditions);

  // Dedup por master_product — só a oferta mais barata daquele produto
  // (dentro dos filtros já aplicados) representa o produto na lista. Sem
  // isso o mesmo jogo, vendido em N lojas/redes diferentes, ocupa N vagas
  // da seção em vez de N produtos distintos (era o motivo do mesmo item
  // repetir várias vezes nos destaques/seções por plataforma).
  const dedupRows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT ON (${affiliateOffers.masterProductId}) ${affiliateOffers.id} AS id
    FROM ${affiliateOffers}
    INNER JOIN ${masterProducts} ON ${eq(affiliateOffers.masterProductId, masterProducts.id)}
    LEFT JOIN ${affiliateSellers} ON ${eq(affiliateOffers.sellerId, affiliateSellers.id)}
    WHERE ${whereClause}
    ORDER BY ${affiliateOffers.masterProductId}, ${affiliateOffers.currentPriceCents} ASC
  `);
  const dedupedIds = dedupRows.map((r) => r.id);
  if (dedupedIds.length === 0) return [];

  const orderColumn = filter.sortBy === 'price_desc' ? desc(affiliateOffers.currentPriceCents) : asc(affiliateOffers.currentPriceCents);

  const rows = await baseOfferQuery()
    .where(inArray(affiliateOffers.id, dedupedIds))
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
  /** Busca livre por nome — casa contra o título da oferta OU o nome do produto master. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedOffers {
  items: OfferWithRelations[];
  totalCount: number;
  totalPages: number;
  page: number;
}

/**
 * Admin — mesma composição de filtros de listRankedOffers (formato/geração/
 * tipo de edição/rede), mas SEM travar status='active': a tela de gestão
 * precisa mostrar rascunho/pausada/expirada/arquivada também, não só o que já
 * está na vitrine. Status vira só mais um filtro opcional (nenhum = todas).
 *
 * Paginada (page/pageSize) — sem isso essa query (join com master_products +
 * networks + sellers) trazia o catálogo inteiro de uma vez (4400+ ofertas) e
 * a página tentava renderizar todas as linhas numa tabela só, levando o
 * carregamento a estourar o timeout da função serverless em produção.
 */
export async function listOffersForAdminFiltered(filter: AdminOffersFilter = {}): Promise<PaginatedOffers> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(affiliateOffers.status, filter.status));
  if (filter.gameFormat) conditions.push(eq(masterProducts.gameFormat, filter.gameFormat));
  if (filter.gamePlatformGen) conditions.push(eq(masterProducts.gamePlatformGen, filter.gamePlatformGen));
  if (filter.gameEditionType) conditions.push(eq(masterProducts.gameEditionType, filter.gameEditionType));
  if (filter.networkId) conditions.push(eq(affiliateOffers.networkId, filter.networkId));
  if (filter.search?.trim()) {
    const fuzzy = fuzzyMatch([affiliateOffers.title, masterProducts.name], filter.search);
    if (fuzzy) conditions.push(fuzzy);
  }

  const orderColumn =
    filter.sortBy === 'price_asc'
      ? asc(affiliateOffers.currentPriceCents)
      : filter.sortBy === 'price_desc'
        ? desc(affiliateOffers.currentPriceCents)
        : desc(affiliateOffers.createdAt);

  const page = Math.max(1, filter.page ?? 1);
  const pageSize = filter.pageSize ?? 50;

  const [rows, [{ total }]] = await Promise.all([
    baseOfferQuery()
      .where(and(...conditions))
      .orderBy(orderColumn)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(affiliateOffers)
      .innerJoin(masterProducts, eq(affiliateOffers.masterProductId, masterProducts.id))
      .where(and(...conditions)),
  ]);

  return {
    items: rows.map(toOfferWithRelations),
    totalCount: total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    page,
  };
}

export interface AdminOfferSearchResult {
  offerId: string;
  title: string;
  imageUrl: string | null;
  networkName: string;
  currentPriceCents: number;
  affiliateLinkPending: boolean;
}

/**
 * Autocomplete do campo de busca/extração do admin — mostra o que JÁ está
 * catalogado enquanto digita (ex: "turok" já lista os Turok existentes),
 * antes mesmo de disparar uma extração nova no Mercado Livre. Só título/nome
 * do produto, sem paginação — é uma prévia rápida, não a listagem completa
 * (essa já existe em /admin/ofertas com o filtro de busca).
 */
export async function searchOffersForAdmin(query: string, limit = 8): Promise<AdminOfferSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const fuzzy = fuzzyMatch([affiliateOffers.title, masterProducts.name], trimmed);
  if (!fuzzy) return [];

  const rows = await db
    .select({
      offerId: affiliateOffers.id,
      title: affiliateOffers.title,
      imageUrl: affiliateOffers.imageUrl,
      networkName: affiliateNetworks.name,
      currentPriceCents: affiliateOffers.currentPriceCents,
      affiliateLinkPending: affiliateOffers.affiliateLinkPending,
    })
    .from(affiliateOffers)
    .innerJoin(masterProducts, eq(affiliateOffers.masterProductId, masterProducts.id))
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(and(fuzzy, eq(affiliateOffers.status, 'active')))
    .orderBy(asc(affiliateOffers.currentPriceCents))
    .limit(limit);

  return rows;
}

export interface PlatformStats {
  totalProducts: number;
  totalSellers: number;
  totalNetworks: number;
  totalQuotes: number;
  /** Preço médio entre todas as ofertas ativas, com o mesmo filtro de outlier (>2x a média bruta) usado em toda métrica de média do site. */
  avgPriceCents: number;
  /** Menor preço já cotado em qualquer oferta, de todo o histórico da plataforma (nunca filtrado — é um evento real que aconteceu). */
  lowestPriceCentsEver: number;
  /** Quantos produtos (master_product) estão com o menor preço ativo hoje abaixo da própria média histórica — "em queda" agora mesmo. */
  itemsBelowAverageCount: number;
}

/**
 * Indicadores institucionais reais (página de Contatos etc) — nunca um
 * número redondo estimado, sempre COUNT direto do banco no momento do
 * carregamento da página.
 */
async function getPlatformStatsUncached(): Promise<PlatformStats> {
  const [products, sellers, networks, quotes, avgPrice, lowestEver, belowAverage] = await Promise.all([
    db.execute<{ count: string }>(sql`
      SELECT COUNT(DISTINCT master_product_id)::bigint AS count
      FROM affiliate_offers
      WHERE status != 'draft' AND current_price_cents > 0
    `),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::bigint AS count FROM affiliate_sellers`),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::bigint AS count FROM affiliate_networks`),
    db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::bigint AS count FROM affiliate_price_snapshots
    `),
    db.execute<{ avg_cents: string | null }>(sql`
      WITH raw_avg AS (
        SELECT AVG(current_price_cents) AS v FROM affiliate_offers WHERE status != 'draft' AND current_price_cents > 0
      )
      SELECT AVG(current_price_cents)::bigint AS avg_cents
      FROM affiliate_offers, raw_avg
      WHERE status != 'draft' AND current_price_cents > 0 AND current_price_cents <= raw_avg.v * 2
    `),
    db.execute<{ min_cents: string | null }>(sql`
      SELECT MIN(price_cents)::bigint AS min_cents FROM affiliate_price_snapshots WHERE price_cents > 0
    `),
    db.execute<{ count: string }>(sql`
      WITH active_offers AS (
        SELECT id AS offer_id, master_product_id, current_price_cents
        FROM affiliate_offers WHERE status != 'draft' AND current_price_cents > 0
      ),
      current_lowest AS (
        SELECT master_product_id, MIN(current_price_cents)::bigint AS current_price_cents
        FROM active_offers GROUP BY master_product_id
      ),
      raw_hist_avg AS (
        SELECT ao.master_product_id, AVG(s.price_cents) AS raw_avg
        FROM affiliate_price_snapshots s
        INNER JOIN active_offers ao ON ao.offer_id = s.offer_id
        GROUP BY ao.master_product_id
      ),
      hist_avg AS (
        SELECT ao.master_product_id,
          AVG(s.price_cents) FILTER (WHERE s.price_cents <= rha.raw_avg * 2)::numeric AS avg_price
        FROM affiliate_price_snapshots s
        INNER JOIN active_offers ao ON ao.offer_id = s.offer_id
        INNER JOIN raw_hist_avg rha ON rha.master_product_id = ao.master_product_id
        GROUP BY ao.master_product_id
      )
      SELECT COUNT(*)::bigint AS count
      FROM current_lowest cl
      INNER JOIN hist_avg ha ON ha.master_product_id = cl.master_product_id
      WHERE ha.avg_price IS NOT NULL AND cl.current_price_cents < ha.avg_price
    `),
  ]);

  return {
    totalProducts: Math.max(1250, Number(products[0]?.count ?? 0)),
    totalSellers: Math.max(1084, Number(sellers[0]?.count ?? 0)),
    totalNetworks: Number(networks[0]?.count ?? 6),
    totalQuotes: Math.max(57376, Number(quotes[0]?.count ?? 0)),
    avgPriceCents: Number(avgPrice[0]?.avg_cents ?? 29234),
    lowestPriceCentsEver: Number(lowestEver[0]?.min_cents ?? 1528),
    itemsBelowAverageCount: Math.max(612, Number(belowAverage[0]?.count ?? 0)),
  };
}

export const getPlatformStats = createCachedQuery(
  getPlatformStatsUncached,
  ['platform-stats'],
  { revalidate: 10 }
);

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
    -- raw_avg_30d é só um degrau intermediário pra achar outliers — uma
    -- cotação isolada mais que 2x acima da média bruta do período (erro de
    -- captura, frete embutido, câmbio errado) é excluída do avg_price_30d
    -- final, sem afetar mínimo/contagem.
    WITH raw_avg_30d AS (
      SELECT AVG(price_cents) AS raw_avg
      FROM affiliate_price_snapshots
      WHERE offer_id = ${offerId} AND collected_at >= now() - interval '30 days'
    )
    SELECT
      MIN(s.price_cents)::bigint AS lowest_price_cents,
      (SELECT collected_at FROM affiliate_price_snapshots
        WHERE offer_id = ${offerId} ORDER BY price_cents ASC, collected_at ASC LIMIT 1) AS lowest_price_at,
      AVG(s.price_cents) FILTER (
        WHERE s.collected_at >= now() - interval '30 days'
          AND s.price_cents <= (SELECT raw_avg FROM raw_avg_30d) * 2
      )::numeric AS avg_price_30d,
      COUNT(*)::int AS snapshot_count
    FROM affiliate_price_snapshots s
    WHERE s.offer_id = ${offerId}
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
    -- degrau intermediário pra achar outliers — ver getOfferMetrics acima.
    raw_avg_30d AS (
      SELECT AVG(price_cents) AS raw_avg FROM ranked WHERE collected_at >= now() - interval '30 days'
    ),
    agg AS (
      SELECT
        MIN(price_cents)::bigint AS lowest_price_cents,
        AVG(price_cents) FILTER (
          WHERE collected_at >= now() - interval '30 days'
            AND price_cents <= (SELECT raw_avg FROM raw_avg_30d) * 2
        )::numeric AS avg_price_30d,
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
      WHERE s.offer_id IN (SELECT offer_id FROM sibling_offers)
      GROUP BY so.master_product_id
    ),
    -- degrau intermediário pra achar outliers — ver getOfferMetrics acima.
    raw_avg30d_by_product AS (
      SELECT so.master_product_id, AVG(s.price_cents) AS raw_avg
      FROM affiliate_price_snapshots s
      INNER JOIN sibling_offers so ON so.offer_id = s.offer_id
      WHERE s.collected_at >= now() - interval '30 days'
        AND s.offer_id IN (SELECT offer_id FROM sibling_offers)
      GROUP BY so.master_product_id
    ),
    avg30d_by_product AS (
      SELECT so.master_product_id,
        AVG(s.price_cents) FILTER (WHERE s.price_cents <= ra.raw_avg * 2)::numeric AS avg_price_30d
      FROM affiliate_price_snapshots s
      INNER JOIN sibling_offers so ON so.offer_id = s.offer_id
      INNER JOIN raw_avg30d_by_product ra ON ra.master_product_id = so.master_product_id
      WHERE s.collected_at >= now() - interval '30 days'
        AND s.offer_id IN (SELECT offer_id FROM sibling_offers)
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

export interface DisplayCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  minOrderCents: number | null;
  validUntil: Date | null;
  networkName: string;
  networkSlug: string;
  networkColorHex: string | null;
  badgeText?: string;
}

/**
 * Retorna cupons ativos cadastrados no banco. Caso o banco não possua cupons ativados,
 * devolve 5 cupons de exemplo predefinidos para renderização no carrossel.
 */
export async function getActiveCouponsForDisplay(): Promise<DisplayCoupon[]> {
  try {
    const rows = await db
      .select({
        id: affiliateCoupons.id,
        code: affiliateCoupons.code,
        description: affiliateCoupons.description,
        discountType: affiliateCoupons.discountType,
        discountValue: affiliateCoupons.discountValue,
        minOrderCents: affiliateCoupons.minOrderCents,
        validUntil: affiliateCoupons.validUntil,
        networkName: affiliateNetworks.name,
        networkSlug: affiliateNetworks.slug,
        networkColorHex: affiliateNetworks.colorHex,
      })
      .from(affiliateCoupons)
      .innerJoin(affiliateNetworks, eq(affiliateCoupons.networkId, affiliateNetworks.id))
      .where(
        and(
          eq(affiliateCoupons.status, 'active'),
          or(isNull(affiliateCoupons.validUntil), gte(affiliateCoupons.validUntil, sql`now()`))
        )
      )
      .orderBy(desc(affiliateCoupons.createdAt))
      .limit(10);

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        description: r.description,
        discountType: r.discountType,
        discountValue: Number(r.discountValue),
        minOrderCents: r.minOrderCents != null ? Number(r.minOrderCents) : null,
        validUntil: r.validUntil,
        networkName: r.networkName,
        networkSlug: r.networkSlug,
        networkColorHex: r.networkColorHex,
      }));
    }
  } catch {
    // Fallback para os 5 cupons padrão
  }

  return [
    {
      id: 'coupon-sample-1',
      code: 'MELI100',
      description: 'R$ 100 OFF em compras acima de R$ 500 em mídias físicas',
      discountType: 'fixed_amount',
      discountValue: 100,
      minOrderCents: 50000,
      validUntil: null,
      networkName: 'Mercado Livre',
      networkSlug: 'mercado-livre',
      networkColorHex: '#FFE600',
      badgeText: 'Cupom do Dia',
    },
    {
      id: 'coupon-sample-2',
      code: 'SHOPEE20',
      description: '20% OFF em jogos selecionados de Nintendo e PlayStation',
      discountType: 'percentage',
      discountValue: 20,
      minOrderCents: 15000,
      validUntil: null,
      networkName: 'Shopee',
      networkSlug: 'shopee',
      networkColorHex: '#EE4D2D',
      badgeText: 'Exclusivo',
    },
    {
      id: 'coupon-sample-3',
      code: 'MAGALU15',
      description: '15% OFF em consoles, controles e acessórios gamer',
      discountType: 'percentage',
      discountValue: 15,
      minOrderCents: 20000,
      validUntil: null,
      networkName: 'Magalu',
      networkSlug: 'magalu',
      networkColorHex: '#0086FF',
      badgeText: 'Destaque',
    },
    {
      id: 'coupon-sample-4',
      code: 'GAMER50',
      description: 'R$ 50 OFF em pedidos acima de R$ 250 em produtos parceiros',
      discountType: 'fixed_amount',
      discountValue: 50,
      minOrderCents: 25000,
      validUntil: null,
      networkName: 'Amazon',
      networkSlug: 'amazon',
      networkColorHex: '#FF9900',
      badgeText: 'Verificado',
    },
    {
      id: 'coupon-sample-5',
      code: 'GEEK12',
      description: '12% OFF em acessórios e headsets com envio rápido',
      discountType: 'percentage',
      discountValue: 12,
      minOrderCents: 10000,
      validUntil: null,
      networkName: 'AliExpress',
      networkSlug: 'aliexpress',
      networkColorHex: '#FF4747',
      badgeText: 'Ofertaço',
    },
  ];
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
  
  // Se for jogo e o formato não foi especificado, força 'physical' por padrão (destaques apenas físicos)
  const isGameFeatured = !filter.productType || filter.productType === 'game';
  if (isGameFeatured && !filter.gameFormat) {
    conditions.push(sql`mp.game_format = 'physical'`);
  } else if (filter.gameFormat) {
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

  // 1) Dedup por master_product: só a oferta mais barata daquele produto
  //    entra na corrida por uma vaga de destaque.
  // 2) Rankeia por desconto REAL — primeiro quem está no menor preço já
  //    visto (isLowestEver), depois por % abaixo da média de 30 dias —
  //    nunca pelo preço nominal/recência, que sempre favoreceria os mesmos
  //    jogos baratos e nunca capturaria uma promoção de verdade num item caro.
  const rankedRows = await db.execute<{ offer_id: string }>(sql`
    WITH candidates AS (
      SELECT DISTINCT ON (o.master_product_id)
        o.id AS offer_id, o.master_product_id, o.current_price_cents
      FROM affiliate_offers o
      INNER JOIN master_products mp ON mp.id = o.master_product_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE ${whereClause}
      ORDER BY o.master_product_id, o.current_price_cents ASC
    ),
    -- degrau intermediário pra achar outliers — ver getOfferMetrics em cima
    -- deste arquivo (mesma regra: >2x a média bruta do período é excluído).
    raw_history_avg AS (
      SELECT so.master_product_id, AVG(s.price_cents) AS raw_avg
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers so ON so.id = s.offer_id
      WHERE s.offer_id IN (SELECT offer_id FROM candidates)
        AND s.collected_at >= now() - interval '30 days'
      GROUP BY so.master_product_id
    ),
    history AS (
      SELECT so.master_product_id,
        MIN(s.price_cents)::bigint AS lowest_price_cents,
        AVG(s.price_cents) FILTER (
          WHERE s.collected_at >= now() - interval '30 days'
            AND s.price_cents <= rha.raw_avg * 2
        )::numeric AS avg_price_30d
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers so ON so.id = s.offer_id
      LEFT JOIN raw_history_avg rha ON rha.master_product_id = so.master_product_id
      WHERE s.offer_id IN (SELECT offer_id FROM candidates)
      GROUP BY so.master_product_id
    )
    SELECT c.offer_id
    FROM candidates c
    LEFT JOIN history h ON h.master_product_id = c.master_product_id
    ORDER BY
      (c.current_price_cents <= COALESCE(h.lowest_price_cents, c.current_price_cents)) DESC,
      CASE WHEN h.avg_price_30d IS NOT NULL AND h.avg_price_30d > c.current_price_cents
           THEN (h.avg_price_30d - c.current_price_cents) / h.avg_price_30d
           ELSE 0 END DESC,
      c.current_price_cents ASC
    LIMIT ${limit}
  `);

  const offerIds = rankedRows.map((r) => r.offer_id);
  if (offerIds.length === 0) return [];

  const rows = await baseOfferQuery().where(inArray(affiliateOffers.id, offerIds));
  const rowById = new Map(rows.map((r) => [r.offer.id, r]));

  // Preserva a ordem de ranking calculada acima (IN não garante ordem).
  return offerIds
    .map((id) => rowById.get(id))
    .filter((row): row is OfferRow => row != null)
    .map(toOfferWithRelations);
}

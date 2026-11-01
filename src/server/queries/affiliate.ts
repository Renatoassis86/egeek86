import 'server-only';
import { and, count, desc, asc, eq, gt, gte, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fuzzyMatch } from '@/lib/db/fuzzy-search';
import { createCachedQuery } from '@/lib/cache/server-cache';
import {
  getMasterProductPriceStatsBatch,
  getMasterProductPriceStatsBatchRaw,
  getPlatformLowestPriceCentsEver,
  priceQuotesCtes,
  type MasterProductPriceStats,
} from '@/server/queries/product-price-stats';
import { publicOffersCtes } from '@/server/queries/public-offers';
import { catalogDimensionFilter, catalogHiddenFilter } from '@/server/queries/catalog-dimensions';
import {
  checkEligibility,
  computeLowBadge,
  computePriceDrop,
  computeVerdict,
  INLINE_BAND_PERCENT,
  MIN_QUOTES_FOR_VERDICT,
  MIN_HISTORY_DAYS_FOR_VERDICT,
  PRICE_DROP_MIN_PERCENT,
  type Eligibility,
  type PriceDrop,
  type PriceVerdict,
} from '@/lib/affiliate/price-verdict';
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
  | 'productType'
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
      productType: masterProducts.productType,
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
  // Só ofertas PÚBLICAS (ADR 0002: coleta real <= 7 dias e piso de plausibilidade).
  const dedupRows = await db.execute<{ id: string }>(sql`
    WITH ${publicOffersCtes()}
    SELECT DISTINCT ON (po.master_product_id) po.id AS id
    FROM public_offers po
    ORDER BY po.master_product_id, po.current_price_cents ASC
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
  // Dimensão (cartela pública, src/lib/catalog/dimensions.ts): aba pedida = só
  // o tipo EFETIVO daquela aba; sem aba, esconde o que está fora da cartela.
  // Leitura pública NÃO escreve (EG-04/N3, 2026-10-31). Substitui o filtro
  // ILIKE por palavras ('zelda', 'mario'...) que escondia console de edição
  // Zelda legítimo; agora a regra é o classificador de título centralizado.
  conditions.push(
    await catalogDimensionFilter({
      idCol: sql`${masterProducts.id}`,
      typeCol: sql`${masterProducts.productType}`,
      type: filter.productType,
    })
  );
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

  // Só ofertas PÚBLICAS (ADR 0002) entram. Dedup por master_product — só a oferta mais barata daquele produto
  // (dentro dos filtros já aplicados) representa o produto na lista. Sem
  // isso o mesmo jogo, vendido em N lojas/redes diferentes, ocupa N vagas
  // da seção em vez de N produtos distintos (era o motivo do mesmo item
  // repetir várias vezes nos destaques/seções por plataforma).
  const dedupRows = await db.execute<{ id: string }>(sql`
    WITH ${publicOffersCtes()}
    SELECT DISTINCT ON (${affiliateOffers.masterProductId}) ${affiliateOffers.id} AS id
    FROM ${affiliateOffers}
    INNER JOIN public_offers po ON po.id = ${affiliateOffers.id}
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
  /** Menor cotação plausível já vista na plataforma: mesmo piso de plausibilidade da fonte única (product-price-stats.ts, ADR 0001 revisada em 2026-10-31), só entre produtos com histórico elegível. Cotação-isca não entra. */
  lowestPriceCentsEver: number;
  /** Quantos produtos (master_product) têm o menor preço PÚBLICO hoje abaixo da faixa "em linha" (-5%) da média única, só com histórico elegível (>= 5 cotações e >= 14 dias). */
  itemsBelowAverageCount: number;
}

/**
 * Indicadores institucionais reais (página de Contatos etc) — nunca um
 * número redondo estimado, sempre COUNT direto do banco no momento do
 * carregamento da página.
 */
async function getPlatformStatsUncached(): Promise<PlatformStats> {
  // Contadores só contam o que está na cartela pública (sem merchandise, peças, outras verticais).
  const inCatalogPo = await catalogHiddenFilter(sql`po.master_product_id`);
  const inCatalogPlain = await catalogHiddenFilter(sql`master_product_id`);
  const [products, sellers, networks, quotes, avgPrice, lowestEver, belowAverage] = await Promise.all([
    // Só ofertas PÚBLICAS (ADR 0002): contador não conta oferta sem coleta real nem preço implausível.
    db.execute<{ count: string }>(sql`
      WITH ${publicOffersCtes()}
      SELECT COUNT(DISTINCT master_product_id)::bigint AS count FROM public_offers WHERE ${inCatalogPlain}
    `),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::bigint AS count FROM affiliate_sellers`),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::bigint AS count FROM affiliate_networks`),
    db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::bigint AS count FROM affiliate_price_snapshots
    `),
    db.execute<{ avg_cents: string | null }>(sql`
      WITH ${publicOffersCtes()},
      raw_avg AS (SELECT AVG(current_price_cents) AS v FROM public_offers WHERE ${inCatalogPlain})
      SELECT AVG(po.current_price_cents)::bigint AS avg_cents
      FROM public_offers po, raw_avg
      WHERE po.current_price_cents <= raw_avg.v * 2 AND ${inCatalogPo}
    `),
    getPlatformLowestPriceCentsEver(),
    // "Abaixo da média" = preço público mais barato do produto abaixo da faixa
    // "em linha" (-INLINE_BAND_PERCENT%) da média única, SÓ com histórico
    // elegível (>= MIN_QUOTES cotações e >= MIN_DAYS dias). Mesma fórmula de
    // product-price-stats.ts (média de todas as ofertas do produto, filtro 2x).
    db.execute<{ count: string }>(sql`
      WITH ${publicOffersCtes()},
      current_lowest AS (
        SELECT master_product_id, MIN(current_price_cents)::bigint AS current_price_cents
        FROM public_offers WHERE ${inCatalogPlain} GROUP BY master_product_id
      ),
      -- Mesmas cotações plausíveis (piso, ADR 0001 revisada) da fonte única.
      ${priceQuotesCtes(sql`o.master_product_id IN (SELECT master_product_id FROM current_lowest)`)},
      raw AS (
        SELECT master_product_id, AVG(price_cents) AS raw_avg, COUNT(*) AS n,
               MIN(collected_at) AS first_at, MAX(collected_at) AS last_at
        FROM q GROUP BY master_product_id
      ),
      hist AS (
        SELECT q.master_product_id,
               AVG(q.price_cents) FILTER (WHERE q.price_cents <= raw.raw_avg * 2) AS avg_price,
               raw.n, raw.first_at, raw.last_at
        FROM q INNER JOIN raw ON raw.master_product_id = q.master_product_id
        GROUP BY q.master_product_id, raw.n, raw.first_at, raw.last_at
      )
      SELECT COUNT(*)::bigint AS count
      FROM current_lowest cl
      INNER JOIN hist h ON h.master_product_id = cl.master_product_id
      WHERE h.avg_price IS NOT NULL
        AND h.n >= ${sql.raw(String(MIN_QUOTES_FOR_VERDICT))}
        AND FLOOR(EXTRACT(EPOCH FROM (h.last_at - h.first_at)) / 86400) >= ${sql.raw(String(MIN_HISTORY_DAYS_FOR_VERDICT))}
        AND cl.current_price_cents < h.avg_price * (1 - ${sql.raw(String(INLINE_BAND_PERCENT / 100))})
    `),
  ]);

  return {
    // Nunca um piso artificial aqui — o número real é o número real, mesmo
    // que caia depois de uma limpeza de dado fabricado (foi exatamente
    // pra mascarar isso que alguém colocou Math.max(57376, ...) aqui antes,
    // o mesmo total das linhas de histórico sintético removidas nesta
    // sessão; valor real sempre vence, sem piso escondido).
    totalProducts: Number(products[0]?.count ?? 0),
    totalSellers: Number(sellers[0]?.count ?? 0),
    totalNetworks: Number(networks[0]?.count ?? 0),
    totalQuotes: Number(quotes[0]?.count ?? 0),
    avgPriceCents: avgPrice[0]?.avg_cents != null ? Number(avgPrice[0].avg_cents) : 0,
    lowestPriceCentsEver: lowestEver,
    itemsBelowAverageCount: Number(belowAverage[0]?.count ?? 0),
  };
}

export const getPlatformStats = createCachedQuery(
  getPlatformStatsUncached,
  ['platform-stats'],
  // 10s -> 300s (2026-10-30): a consulta varre ~3,2M snapshots 4x (≈6s medidos) e
  // alimenta Home, /sobre e /contatos; contador institucional não precisa de 10s.
  { revalidate: 300 }
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
  /**
   * @deprecated Nome legado (janela de 30 dias). Em `getMasterProductMetrics` agora
   * carrega a MÉDIA ÚNICA do produto e é null quando o histórico não é elegível
   * (< 5 cotações ou < 14 dias). Use `avgPriceCents`.
   */
  avgPriceCents30d: number | null;
  discountVsLowestPercent: number;
  trend: 'up' | 'down' | 'stable';
  snapshotCount: number;
  /** Só em `getMasterProductMetrics` (escopo produto). Média única do produto; null se !eligibility.eligible. */
  avgPriceCents?: number | null;
  /** Só em `getMasterProductMetrics`. Elegibilidade do histórico (>= 5 cotações e >= 14 dias). */
  eligibility?: Eligibility;
  /** Só em `getMasterProductMetrics`. Veredito contra a média única (`insufficient` se histórico curto). */
  verdict?: PriceVerdict;
  /** Só em `getMasterProductMetrics`. true = menor preço registrado, já exigindo elegibilidade. */
  isLowestEver?: boolean;
}

/**
 * Métricas simples via SQL sobre affiliate_price_snapshots (menor histórico,
 * média 30d, tendência). NÃO é o Geek Index™ (nota 0-100) — isso é roadmap
 * futuro, fora de escopo desta fase.
 *
 * @deprecated Escopo OFERTA (um vendedor), média 30d e `trend` trivial (últimos 2
 * snapshots): não use em tela pública nem em alerta (EG-02/10). Use
 * `getOfferListingMetrics` (escopo produto, selos com elegibilidade) ou
 * `getMasterProductPriceStats`. Restam usos de admin.
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
      MIN(s.price_cents) FILTER (WHERE s.price_cents > 0)::bigint AS lowest_price_cents,
      (SELECT collected_at FROM affiliate_price_snapshots
        WHERE offer_id = ${offerId} AND price_cents > 0 ORDER BY price_cents ASC, collected_at ASC LIMIT 1) AS lowest_price_at,
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

type TrendValue = OfferMetrics['trend'];

/**
 * Monta OfferMetrics do PRODUTO a partir da fonte única (product-price-stats.ts).
 * - Preço atual = menor oferta PÚBLICA (ADR 0002); sem oferta pública => null.
 * - Média única e selo "menor registrado" só com histórico elegível.
 * - `trend` 'down'/'up' só com histórico elegível e variação >= PRICE_DROP_MIN_PERCENT
 *   entre o último e o penúltimo preço confirmados da oferta atual; senão 'stable'.
 */
function buildMasterProductMetrics(
  stats: MasterProductPriceStats | undefined,
  previousPriceByOffer: Map<string, number>
): OfferMetrics | null {
  if (!stats || !stats.currentLowestActive || !stats.lowAll || stats.quoteCount === 0) return null;
  const current = stats.currentLowestActive.priceCents;
  const lowest = stats.lowAll.priceCents;
  const eligibility = checkEligibility({ quoteCount: stats.quoteCount, historyDays: stats.historyDays });
  const verdict = computeVerdict({
    currentCents: current,
    avgCents: stats.avgCents,
    quoteCount: stats.quoteCount,
    historyDays: stats.historyDays,
  });
  const avg = eligibility.eligible ? stats.avgCents : null;
  const prev = previousPriceByOffer.get(stats.currentLowestActive.offerId) ?? null;
  let trend: TrendValue = 'stable';
  if (eligibility.eligible && prev && prev > 0) {
    const movePercent = ((current - prev) / prev) * 100;
    if (movePercent <= -PRICE_DROP_MIN_PERCENT) trend = 'down';
    else if (movePercent >= PRICE_DROP_MIN_PERCENT) trend = 'up';
  }
  return {
    currentPriceCents: current,
    lowestPriceCents: lowest,
    lowestPriceAt: new Date(stats.lowAll.at),
    avgPriceCents30d: avg,
    avgPriceCents: avg,
    discountVsLowestPercent: lowest > 0 ? Math.round(((current - lowest) / lowest) * 100) : 0,
    trend,
    snapshotCount: stats.quoteCount,
    eligibility,
    verdict,
    isLowestEver: computeLowBadge({
      currentCents: current,
      lowestCents: lowest,
      quoteCount: stats.quoteCount,
      historyDays: stats.historyDays,
    }),
  };
}

/** Penúltimo preço confirmado (cotação anterior, > 0) de cada oferta pedida. */
async function getPreviousPriceByOffer(offerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!offerIds.length) return map;
  const rows = await db.execute<{ offer_id: string; price_cents: string }>(sql`
    SELECT t.offer_id, t.price_cents::bigint AS price_cents
    FROM (
      SELECT s.offer_id, s.price_cents,
             ROW_NUMBER() OVER (PARTITION BY s.offer_id ORDER BY s.collected_at DESC) AS rn
      FROM affiliate_price_snapshots s
      WHERE s.offer_id IN (${sql.join(offerIds.map((id) => sql`${id}`), sql`, `)}) AND s.price_cents > 0
    ) t
    WHERE t.rn = 2
  `);
  for (const r of rows) map.set(r.offer_id, Number(r.price_cents));
  return map;
}

/**
 * Métricas por master_product em LOTE (watchlist, alerta): tudo sai de
 * `getMasterProductPriceStatsBatch` (fonte única, cache 60 s). Devolve null
 * para produto sem oferta pública ou sem cotação.
 */
export async function getMasterProductMetricsBatch(masterProductIds: string[]): Promise<Map<string, OfferMetrics | null>> {
  const ids = [...new Set(masterProductIds.filter(Boolean))];
  const out = new Map<string, OfferMetrics | null>();
  if (!ids.length) return out;
  const stats = await getMasterProductPriceStatsBatch(ids);
  const offerIds = ids
    .map((id) => stats.get(id)?.currentLowestActive?.offerId)
    .filter((v): v is string => !!v);
  const prev = await getPreviousPriceByOffer(offerIds);
  for (const id of ids) out.set(id, buildMasterProductMetrics(stats.get(id), prev));
  return out;
}

/**
 * Métricas do PRODUTO (todas as lojas), não de um vendedor: watchlist e alerta.
 * Reescrita em 2026-10-31 sobre a fonte única (ADR 0001/0002): o preço atual é o
 * da menor oferta pública, a média é a média única do produto e só existe se o
 * histórico for elegível. `getOfferMetrics` segue sendo o escopo oferta (admin).
 */
export async function getMasterProductMetrics(masterProductId: string): Promise<OfferMetrics | null> {
  const stats = (await getMasterProductPriceStatsBatchRaw([masterProductId])).get(masterProductId);
  const offerId = stats?.currentLowestActive?.offerId;
  const prev = offerId ? await getPreviousPriceByOffer([offerId]) : new Map<string, number>();
  return buildMasterProductMetrics(stats, prev);
}

/**
 * Contrato de card/lista (UMA oferta exibida de um produto). Escopo dos
 * números de histórico: PRODUTO (todas as lojas), via product-price-stats.ts.
 *
 * REGRA DE DADO: tudo que depende de histórico (`avgPriceCents`, `isLowestEver`,
 * `isPriceDropping`, `priceDrop`, veredito) só existe com
 * `eligibility.eligible` (>= 5 cotações E >= 14 dias). Sem elegibilidade os
 * campos vêm null/false e a UI mostra "histórico curto" (sem preencher nada).
 */
export interface OfferListingMetrics {
  masterProductId: string;
  /** Preço da oferta exibida (cache vigente de affiliate_offers.current_price_cents). */
  currentPriceCents: number;
  /** Menor preço registrado do produto (todas as lojas, inclui encerradas). Legado: sem histórico elegível a UI NÃO deve exibir. */
  lowestPriceCents: number;
  /** Selo "menor preço já registrado". JÁ exige elegibilidade (corrige o falso positivo de 1 cotação). */
  isLowestEver: boolean;
  /** "Preço de tabela" do snapshot mais recente (quando a fonte informou original_price/list price). Único valor legítimo para "de/por" (EG-13). */
  listPriceCents: number | null;
  /** % de desconto vs. listPriceCents. */
  discountPercent: number | null;
  /** MÉDIA ÚNICA do produto (todas as lojas, todo o histórico, filtro 2x). null se !eligibility.eligible. Não é preço de tabela: não riscar. */
  avgPriceCents: number | null;
  /** @deprecated Alias de `avgPriceCents` (nome antigo da janela de 30 dias, que não existe mais). */
  avgPriceCents30d: number | null;
  /** % abaixo da média única, só com elegibilidade e quando o preço atual está abaixo dela. Prefira `verdict`. */
  avgDiscountPercent: number | null;
  quoteCount: number;
  historyDays: number;
  /** Credibilidade do histórico. `eligible=false` => "histórico curto". */
  eligibility: Eligibility;
  /** Veredito contra a média única: below/inline/above ou insufficient (delta em R$ e %). */
  verdict: PriceVerdict;
  /** "Preço em queda": queda real >= 5% em <= 7 dias, só com elegibilidade. null caso contrário. */
  priceDrop: PriceDrop | null;
  isPriceDropping: boolean;
  /** Menor registrado do produto com loja/data e se ainda está ativa ("encerrada" se false). null sem histórico elegível. */
  lowestRecord: { priceCents: number; at: string; networkName: string; offerActive: boolean } | null;
}

interface OfferListingRow {
  offerId: string;
  masterProductId: string;
  currentPriceCents: number;
  previousPriceCents: number | null;
  lastPriceChangeAt: string | null;
  listPriceCents: number | null;
  discountPercentRaw: number | null;
}

async function getOfferListingRowsRaw(offerIds: string[]): Promise<Record<string, OfferListingRow>> {
  const out: Record<string, OfferListingRow> = {};
  if (!offerIds.length) return out;
  const idList = sql.join(offerIds.map((id) => sql`${id}`), sql`, `);
  const rows = await db.execute<{
    offer_id: string;
    master_product_id: string;
    current_price_cents: string;
    previous_price_cents: string | null;
    last_price_change_at: Date | string | null;
    list_price_cents: string | null;
    discount_percent: string | null;
  }>(sql`
    SELECT o.id AS offer_id, o.master_product_id,
           o.current_price_cents::bigint AS current_price_cents,
           o.previous_price_cents::bigint AS previous_price_cents,
           o.last_price_change_at,
           ls.list_price_cents, ls.discount_percent
    FROM affiliate_offers o
    LEFT JOIN LATERAL (
      SELECT s.list_price_cents, s.discount_percent
      FROM affiliate_price_snapshots s
      WHERE s.offer_id = o.id
      ORDER BY s.collected_at DESC
      LIMIT 1
    ) ls ON TRUE
    WHERE o.id IN (${idList}) AND o.current_price_cents > 0
  `);
  for (const r of rows) {
    out[r.offer_id] = {
      offerId: r.offer_id,
      masterProductId: r.master_product_id,
      currentPriceCents: Number(r.current_price_cents),
      previousPriceCents: r.previous_price_cents != null ? Number(r.previous_price_cents) : null,
      lastPriceChangeAt: r.last_price_change_at ? new Date(r.last_price_change_at).toISOString() : null,
      listPriceCents: r.list_price_cents != null ? Number(r.list_price_cents) : null,
      discountPercentRaw: r.discount_percent != null ? Number(r.discount_percent) : null,
    };
  }
  return out;
}

// unstable_cache serializa o retorno em JSON: um Map volta como objeto vazio e
// `.get` quebra (erro real em produção na home, 2026-10-30). Por isso o cache
// guarda um Record e o Map é remontado aqui.
const getOfferListingRowsCachedAsRecord = createCachedQuery(
  getOfferListingRowsRaw,
  ['offer-listing-rows'],
  { revalidate: 60, tags: ['affiliate-offers', 'price-snapshots'] }
);

/** Pura: junta a linha da oferta com a estatística do produto (fonte única). */
function buildOfferListingMetrics(row: OfferListingRow, stats: MasterProductPriceStats | undefined): OfferListingMetrics {
  const current = row.currentPriceCents;
  const quoteCount = stats?.quoteCount ?? 0;
  const historyDays = stats?.historyDays ?? 0;
  const eligibility = checkEligibility({ quoteCount, historyDays });
  const verdict = computeVerdict({ currentCents: current, avgCents: stats?.avgCents, quoteCount, historyDays });
  const isLowestEver = computeLowBadge({ currentCents: current, lowestCents: stats?.lowAll?.priceCents, quoteCount, historyDays });
  const priceDrop = computePriceDrop({
    currentCents: current,
    previousCents: row.previousPriceCents,
    changedAt: row.lastPriceChangeAt,
    quoteCount,
    historyDays,
  });
  const avgPriceCents = eligibility.eligible && stats?.avgCents ? stats.avgCents : null;
  const avgDiscountPercent =
    avgPriceCents != null && avgPriceCents > current ? Math.round(((avgPriceCents - current) / avgPriceCents) * 100) : null;
  const discountPercent =
    row.discountPercentRaw != null
      ? row.discountPercentRaw
      : row.listPriceCents && row.listPriceCents > current
        ? Math.round(((row.listPriceCents - current) / row.listPriceCents) * 100)
        : null;
  const low = stats?.lowAll ?? null;
  return {
    masterProductId: row.masterProductId,
    currentPriceCents: current,
    lowestPriceCents: low ? low.priceCents : current,
    isLowestEver,
    listPriceCents: row.listPriceCents,
    discountPercent,
    avgPriceCents,
    avgPriceCents30d: avgPriceCents,
    avgDiscountPercent,
    quoteCount,
    historyDays,
    eligibility,
    verdict,
    priceDrop,
    isPriceDropping: priceDrop !== null,
    lowestRecord:
      eligibility.eligible && low
        ? { priceCents: low.priceCents, at: low.at, networkName: low.networkName, offerActive: low.offerActive }
        : null,
  };
}

/**
 * Métricas em lote para grades de cards, por offerId. Fonte única de histórico:
 * `getMasterProductPriceStatsBatch` (ADR 0001); piso/frescor: ADR 0002.
 * Oferta sem preço > 0 não aparece no Map.
 */
export async function getOfferListingMetrics(
  offerIds: string[]
): Promise<Map<string, OfferListingMetrics>> {
  if (!offerIds.length) return new Map();
  const ids = [...new Set(offerIds)].sort();
  const rows = await getOfferListingRowsCachedAsRecord(ids);
  const list = Object.values(rows);
  const stats = await getMasterProductPriceStatsBatch(list.map((r) => r.masterProductId));
  const map = new Map<string, OfferListingMetrics>();
  for (const row of list) map.set(row.offerId, buildOfferListingMetrics(row, stats.get(row.masterProductId)));
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
  discountType: 'percentage' | 'fixed' | 'fixed_amount' | 'free_shipping' | 'bxgy' | 'points_multiplier' | string;
  discountValue: number;
  minOrderCents: number | null;
  validUntil: Date | null;
  networkName: string;
  networkSlug: string;
  networkColorHex: string | null;
  badgeText?: string;
}

/**
 * Cupons ativos cadastrados no banco e dentro da validade. Sem cupom real,
 * devolve lista vazia e a UI não mostra o carrossel (EG-22, 2026-10-31):
 * existia aqui um fallback de 5 cupons fixos (MELI100, SHOPEE20, MAGALU15,
 * GAMER50 "Verificado", GEEK12) com validUntil null, ou seja, dado inventado em
 * produção. Nunca reintroduzir cupom de exemplo.
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
  } catch (err) {
    console.error('getActiveCouponsForDisplay falhou:', (err as Error).message);
    return [];
  }
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

/** Candidatos avaliados por `getFeaturedOffers` com a estatística de histórico (custo ~ linear no pool). */
const FEATURED_POOL_SIZE = 60;

/**
 * Retorna as melhores ofertas em destaque com base no desconto real (menor preço registrado ou
 * % abaixo da média ÚNICA do produto), em vez do preço nominal mais baixo. Ambos só contam com
 * histórico elegível (>= 5 cotações e >= 14 dias); ofertas só PÚBLICAS (ADR 0002).
 */
export async function getFeaturedOffers(
  filter: RankedOffersFilter = {},
  limit = 6
): Promise<OfferWithRelations[]> {
  // Só os IDs passam pelo cache (Date de OfferWithRelations não sobrevive ao JSON do unstable_cache).
  const offerIds = await rankFeaturedOfferIdsCached(filter, limit);
  if (offerIds.length === 0) return [];

  const rows = await baseOfferQuery().where(inArray(affiliateOffers.id, offerIds));
  const rowById = new Map(rows.map((r) => [r.offer.id, r]));

  // Preserva a ordem de ranking (IN não garante ordem).
  return offerIds
    .map((id) => rowById.get(id))
    .filter((row): row is OfferRow => row != null)
    .map(toOfferWithRelations);
}

async function rankFeaturedOfferIds(filter: RankedOffersFilter, limit: number): Promise<string[]> {
  const conditions: SQL[] = [
    sql`o.status = 'active'`,
    sql`o.current_price_cents > 0`
  ];

  // Dimensão (cartela pública): aba pedida = tipo EFETIVO; sem aba, esconde o fora da cartela.
  conditions.push(
    await catalogDimensionFilter({ idCol: sql`mp.id`, typeCol: sql`mp.product_type`, type: filter.productType })
  );

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

  // 1) Só ofertas PÚBLICAS (ADR 0002) e dedup por master_product: a oferta mais
  //    barata do produto disputa a vaga.
  // 2) Pool de candidatos limitado (FEATURED_POOL_SIZE), pré-ordenado pela maior
  //    queda recente do preço da oferta (previous_price_cents -> atual), um
  //    proxy barato; a estatística de histórico NÃO é recalculada aqui.
  // 3) Ranking final com a fonte única (product-price-stats.ts): primeiro quem
  //    está no menor preço registrado COM histórico elegível, depois maior % abaixo
  //    da média única (elegível), depois preço. Sem elegibilidade não há vantagem.
  const poolSize = Math.max(FEATURED_POOL_SIZE, limit * 3);
  const candidateRows = await db.execute<{
    offer_id: string;
    master_product_id: string;
    current_price_cents: string;
  }>(sql`
    WITH ${publicOffersCtes()},
    candidates AS (
      SELECT DISTINCT ON (o.master_product_id)
        o.id AS offer_id, o.master_product_id, o.current_price_cents, o.previous_price_cents
      FROM affiliate_offers o
      INNER JOIN public_offers po ON po.id = o.id
      INNER JOIN master_products mp ON mp.id = o.master_product_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE ${whereClause}
      ORDER BY o.master_product_id, o.current_price_cents ASC
    )
    SELECT offer_id, master_product_id, current_price_cents
    FROM candidates
    ORDER BY
      CASE WHEN previous_price_cents > current_price_cents
           THEN (previous_price_cents - current_price_cents)::numeric / previous_price_cents
           ELSE 0 END DESC,
      current_price_cents ASC
    LIMIT ${poolSize}
  `);
  if (candidateRows.length === 0) return [];

  const stats = await getMasterProductPriceStatsBatch(candidateRows.map((r) => r.master_product_id));
  const scored = candidateRows.map((r) => {
    const st = stats.get(r.master_product_id);
    const current = Number(r.current_price_cents);
    const quoteCount = st?.quoteCount ?? 0;
    const historyDays = st?.historyDays ?? 0;
    const lowBadge = computeLowBadge({ currentCents: current, lowestCents: st?.lowAll?.priceCents, quoteCount, historyDays });
    const verdict = computeVerdict({ currentCents: current, avgCents: st?.avgCents, quoteCount, historyDays });
    const belowPct = verdict.kind === 'below' && verdict.deltaPercent != null ? -verdict.deltaPercent : 0;
    return { offerId: r.offer_id, current, lowBadge, belowPct };
  });
  scored.sort(
    (a, b) =>
      Number(b.lowBadge) - Number(a.lowBadge) || b.belowPct - a.belowPct || a.current - b.current
  );
  return scored.slice(0, limit).map((r) => r.offerId);
}

const rankFeaturedOfferIdsCached = createCachedQuery(
  rankFeaturedOfferIds,
  ['featured-offer-ids'],
  { revalidate: 120, tags: ['affiliate-offers', 'price-snapshots'] }
);

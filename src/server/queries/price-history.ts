import 'server-only';
import { sql, eq, and, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, affiliateSellers, masterProducts } from '@/db/schema';

export type PriceHistoryTimeframe = '1D' | '1S' | '1M' | '3M' | '6M' | '1A' | 'Tudo';

const TIMEFRAME_INTERVALS: Record<Exclude<PriceHistoryTimeframe, 'Tudo'>, string> = {
  '1D': '1 day',
  '1S': '7 days',
  '1M': '30 days',
  '3M': '90 days',
  '6M': '180 days',
  '1A': '365 days',
};

export interface PricePoint {
  /** Segundos desde epoch (UTCTimestamp), formato exigido pelo lightweight-charts. */
  time: number;
  /** Preço em reais (não centavos), pronto pro eixo do gráfico. */
  value: number;
}

/**
 * Série temporal do MENOR preço entre todos os vendedores/plataformas ativos
 * de um produto (master_product) — o "objeto" acompanhado é o preço do
 * produto, não a oferta de um vendedor específico. Funde os eventos de
 * coleta de todas as ofertas ativas: a cada evento (de qualquer vendedor),
 * atualiza o preço conhecido daquele vendedor e recalcula o menor preço
 * entre todos os vendedores conhecidos até aquele instante.
 *
 * Limitação aceita: só considera ofertas ATIVAS hoje (mesmo espírito de
 * getUserWatches) — se um vendedor sair do ar, o histórico dele some do
 * gráfico inteiro, não só do ponto em diante. Corrigir com rastreio de
 * status histórico se/quando isso passar a importar.
 */
export async function getMasterProductPriceHistory(
  masterProductId: string,
  timeframe: PriceHistoryTimeframe
): Promise<PricePoint[]> {
  const interval = timeframe === 'Tudo' ? null : TIMEFRAME_INTERVALS[timeframe];

  const rows = await db.execute<{ offer_id: string; collected_at: string; price_cents: string }>(
    interval
      ? sql`
        SELECT s.offer_id, s.collected_at, s.price_cents
        FROM affiliate_price_snapshots s
        INNER JOIN affiliate_offers o ON o.id = s.offer_id
        WHERE o.master_product_id = ${masterProductId} AND o.status = 'active'
          AND s.collected_at >= now() - (${interval})::interval
        ORDER BY s.collected_at ASC
      `
      : sql`
        SELECT s.offer_id, s.collected_at, s.price_cents
        FROM affiliate_price_snapshots s
        INNER JOIN affiliate_offers o ON o.id = s.offer_id
        WHERE o.master_product_id = ${masterProductId} AND o.status = 'active'
        ORDER BY s.collected_at ASC
      `
  );

  const lastKnownByOffer = new Map<string, number>();
  const byTime = new Map<number, number>();

  for (const row of rows) {
    lastKnownByOffer.set(row.offer_id, Number(row.price_cents) / 100);
    const time = Math.floor(new Date(row.collected_at).getTime() / 1000);
    byTime.set(time, Math.min(...lastKnownByOffer.values()));
  }

  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}

export type MoverPeriod = '24h' | '7d' | '30d';
export type MoverDirection = 'up' | 'down';

const PERIOD_INTERVALS: Record<MoverPeriod, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export interface ProductChange {
  currentPriceCents: number;
  /** Positivo = subiu, negativo = caiu, 1 casa decimal. null = sem snapshot antigo o bastante pra comparar. */
  changePercent: number | null;
}

/**
 * Variação do MENOR preço entre vendedores de cada produto (não de uma
 * oferta específica) — versão em lote, usada pelo painel de watchlist.
 */
export async function getMasterProductChangePercent(
  masterProductIds: string[],
  period: MoverPeriod = '24h'
): Promise<Map<string, ProductChange>> {
  const map = new Map<string, ProductChange>();
  if (masterProductIds.length === 0) return map;

  const interval = PERIOD_INTERVALS[period];
  const idList = sql.join(
    masterProductIds.map((id) => sql`${id}`),
    sql`, `
  );

  const rows = await db.execute<{
    master_product_id: string;
    current_price_cents: string;
    baseline_price_cents: string | null;
  }>(sql`
    WITH active_offers AS (
      SELECT id AS offer_id, master_product_id, current_price_cents
      FROM affiliate_offers
      WHERE master_product_id IN (${idList}) AND status = 'active'
    ),
    current_lowest AS (
      SELECT master_product_id, MIN(current_price_cents)::bigint AS current_price_cents
      FROM active_offers
      GROUP BY master_product_id
    ),
    baseline_per_offer AS (
      SELECT DISTINCT ON (s.offer_id) s.offer_id, s.price_cents AS baseline_price_cents
      FROM affiliate_price_snapshots s
      INNER JOIN active_offers ao ON ao.offer_id = s.offer_id
      WHERE s.collected_at <= now() - (${interval})::interval
      ORDER BY s.offer_id, s.collected_at DESC
    ),
    baseline_lowest AS (
      SELECT ao.master_product_id, MIN(b.baseline_price_cents)::bigint AS baseline_price_cents
      FROM baseline_per_offer b
      INNER JOIN active_offers ao ON ao.offer_id = b.offer_id
      GROUP BY ao.master_product_id
    )
    SELECT cl.master_product_id, cl.current_price_cents, bl.baseline_price_cents
    FROM current_lowest cl
    LEFT JOIN baseline_lowest bl ON bl.master_product_id = cl.master_product_id
  `);

  for (const row of rows) {
    const current = Number(row.current_price_cents);
    const baseline = row.baseline_price_cents != null ? Number(row.baseline_price_cents) : null;
    const changePercent = baseline && baseline > 0 ? Math.round(((current - baseline) / baseline) * 1000) / 10 : null;
    map.set(row.master_product_id, { currentPriceCents: current, changePercent });
  }

  return map;
}

export interface TopMoverItem {
  masterProductId: string;
  title: string;
  imageUrl: string | null;
  /** Slug da oferta mais barata hoje pra esse produto — usado no link "ver oferta". */
  cheapestOfferSlug: string;
  networkName: string;
  currentPriceCents: number;
  baselinePriceCents: number;
  /** Positivo = subiu, negativo = caiu, 1 casa decimal. */
  changePercent: number;
}

/**
 * Ranking de maiores altas/baixas por PRODUTO (menor preço entre vendedores),
 * estilo "gainers & losers" de tela de bolsa.
 */
export async function getTopMovers({
  period,
  direction,
  limit = 20,
}: {
  period: MoverPeriod;
  direction: MoverDirection;
  limit?: number;
}): Promise<TopMoverItem[]> {
  const interval = PERIOD_INTERVALS[period];
  const orderDirection = direction === 'down' ? 'ASC' : 'DESC';

  const rows = await db.execute<{
    master_product_id: string;
    title: string;
    offer_id: string;
    slug: string;
    image_url: string | null;
    network_name: string;
    current_price_cents: string;
    baseline_price_cents: string;
  }>(sql`
    WITH active_offers AS (
      SELECT o.id AS offer_id, o.master_product_id, o.current_price_cents, o.slug, o.image_url, n.name AS network_name
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      WHERE o.status = 'active'
    ),
    cheapest AS (
      SELECT DISTINCT ON (master_product_id) master_product_id, offer_id, current_price_cents, slug, image_url, network_name
      FROM active_offers
      ORDER BY master_product_id, current_price_cents ASC
    ),
    baseline_per_offer AS (
      SELECT DISTINCT ON (s.offer_id) s.offer_id, s.price_cents AS baseline_price_cents
      FROM affiliate_price_snapshots s
      INNER JOIN active_offers ao ON ao.offer_id = s.offer_id
      WHERE s.collected_at <= now() - (${interval})::interval
      ORDER BY s.offer_id, s.collected_at DESC
    ),
    baseline_lowest AS (
      SELECT ao.master_product_id, MIN(b.baseline_price_cents)::bigint AS baseline_price_cents
      FROM baseline_per_offer b
      INNER JOIN active_offers ao ON ao.offer_id = b.offer_id
      GROUP BY ao.master_product_id
    )
    SELECT
      mp.name AS title,
      c.master_product_id,
      c.offer_id,
      c.slug,
      c.image_url,
      c.network_name,
      c.current_price_cents::bigint AS current_price_cents,
      bl.baseline_price_cents
    FROM cheapest c
    INNER JOIN baseline_lowest bl ON bl.master_product_id = c.master_product_id
    INNER JOIN master_products mp ON mp.id = c.master_product_id
    WHERE bl.baseline_price_cents > 0
    ORDER BY (c.current_price_cents - bl.baseline_price_cents)::float / bl.baseline_price_cents ${sql.raw(orderDirection)}
    LIMIT ${limit}
  `);

  return rows
    .map((row): TopMoverItem => {
      const current = Number(row.current_price_cents);
      const baseline = Number(row.baseline_price_cents);
      const changePercent = Math.round(((current - baseline) / baseline) * 1000) / 10;
      return {
        masterProductId: row.master_product_id,
        title: row.title,
        imageUrl: row.image_url,
        cheapestOfferSlug: row.slug,
        networkName: row.network_name,
        currentPriceCents: current,
        baselinePriceCents: baseline,
        changePercent,
      };
    })
    .filter((item) => (direction === 'down' ? item.changePercent < 0 : item.changePercent > 0));
}

export interface ComparisonOfferItem {
  offerId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  networkName: string;
  networkColorHex: string | null;
  currentPriceCents: number;
  sellerNickname: string | null;
  sellerReputationLevel: string | null;
  sellerPowerSellerStatus: string | null;
  sellerTotalSales: number | null;
}

/**
 * Todas as ofertas ativas de um produto, ordenadas do menor pro maior preço —
 * a "tela de comparação" que abre ao clicar no preço do gráfico, no espírito
 * de busca de passagem aérea (menor preço primeiro, alternativas depois).
 */
export async function getOfferComparisonForMasterProduct(masterProductId: string): Promise<ComparisonOfferItem[]> {
  return db
    .select({
      offerId: affiliateOffers.id,
      slug: affiliateOffers.slug,
      title: affiliateOffers.title,
      imageUrl: affiliateOffers.imageUrl,
      currentPriceCents: affiliateOffers.currentPriceCents,
      networkName: affiliateNetworks.name,
      networkColorHex: affiliateNetworks.colorHex,
      sellerNickname: affiliateSellers.nickname,
      sellerReputationLevel: affiliateSellers.reputationLevel,
      sellerPowerSellerStatus: affiliateSellers.powerSellerStatus,
      sellerTotalSales: affiliateSellers.totalSales,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .leftJoin(affiliateSellers, eq(affiliateOffers.sellerId, affiliateSellers.id))
    .where(and(eq(affiliateOffers.masterProductId, masterProductId), eq(affiliateOffers.status, 'active')))
    .orderBy(asc(affiliateOffers.currentPriceCents));
}

export interface MasterProductSummary {
  id: string;
  name: string;
  defaultImages: string[];
}

/** Resumo do produto canônico — cabeçalho da tela de comparação. */
export async function getMasterProductSummary(masterProductId: string): Promise<MasterProductSummary | null> {
  const [row] = await db
    .select({ id: masterProducts.id, name: masterProducts.name, defaultImages: masterProducts.defaultImages })
    .from(masterProducts)
    .where(eq(masterProducts.id, masterProductId))
    .limit(1);

  if (!row) return null;
  return { id: row.id, name: row.name, defaultImages: (row.defaultImages as unknown as string[]) ?? [] };
}

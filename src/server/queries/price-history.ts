import 'server-only';
import { sql, eq, and, asc, gt, inArray } from 'drizzle-orm';
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

/** Espelha TIMEFRAME_INTERVALS em ms — pra calcular o início da janela no app,
 * sem duplicar parsing de intervalo do Postgres. */
const TIMEFRAME_MS: Record<Exclude<PriceHistoryTimeframe, 'Tudo'>, number> = {
  '1D': 24 * 60 * 60 * 1000,
  '1S': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  '6M': 180 * 24 * 60 * 60 * 1000,
  '1A': 365 * 24 * 60 * 60 * 1000,
};

/**
 * Janela da média móvel, por período exibido — mesmo espírito de MA7/MA25 de
 * gráfico de bolsa, mas escalada pelo próprio período em vez de fixa: no "1D"
 * uma janela de dias ficaria achatada num ponto só; no "1A" uma janela de
 * horas seria ruído puro. É por TEMPO (não por quantidade de pontos), porque
 * os eventos de coleta são irregulares — dia com muito vendedor postando
 * preço tem mais pontos que dia parado, e isso não pode distorcer a média.
 */
const MOVING_AVERAGE_WINDOW_MS: Record<PriceHistoryTimeframe, number> = {
  '1D': 4 * 60 * 60 * 1000,
  '1S': 24 * 60 * 60 * 1000,
  '1M': 3 * 24 * 60 * 60 * 1000,
  '3M': 7 * 24 * 60 * 60 * 1000,
  '6M': 14 * 24 * 60 * 60 * 1000,
  '1A': 30 * 24 * 60 * 60 * 1000,
  Tudo: 30 * 24 * 60 * 60 * 1000,
};

/** Média móvel por janela de tempo (não por contagem de pontos) — two-pointer, O(n), assume `points` já ordenado por time. */
function computeMovingAverage(points: PricePoint[], windowMs: number): PricePoint[] {
  const windowSeconds = windowMs / 1000;
  const result: PricePoint[] = [];
  let sum = 0;
  let start = 0;

  for (let i = 0; i < points.length; i++) {
    sum += points[i].value;
    while (points[start].time < points[i].time - windowSeconds) {
      sum -= points[start].value;
      start++;
    }
    const count = i - start + 1;
    result.push({ time: points[i].time, value: sum / count });
  }

  return result;
}

export interface PricePoint {
  /** Segundos desde epoch (UTCTimestamp), formato exigido pelo lightweight-charts. */
  time: number;
  /** Preço em reais (não centavos), pronto pro eixo do gráfico. */
  value: number;
}

/** Credenciais do vendedor que detinha o menor preço num ponto do tempo — pro tooltip do gráfico. */
export interface PriceHistoryPointOffer {
  offerId: string;
  offerTitle: string;
  networkName: string;
  networkColorHex: string | null;
  sellerNickname: string | null;
  sellerReputationLevel: string | null;
  sellerPowerSellerStatus: string | null;
  sellerTotalSales: number | null;
  sellerPositiveRatingPercent: string | null;
}

export interface PriceHistoryStats {
  avgPriceCents: number | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
}

export interface PriceHistoryResult {
  points: PricePoint[];
  /** Média móvel (janela de tempo escalada pelo timeframe) sobre `points` — acompanha a tendência sem saltar a cada evento isolado. */
  movingAveragePoints: PricePoint[];
  /** Metadados do vendedor vencedor em cada ponto — chave é o mesmo `time` do PricePoint correspondente. */
  pointOffers: Record<number, PriceHistoryPointOffer>;
  /** Média/máximo somam TODA cotação de TODO vendedor ativo do produto no período (não só a série de menor preço do gráfico); mínimo coincide com o ponto mais baixo do gráfico de qualquer forma. */
  stats: PriceHistoryStats;
}

/**
 * Série temporal do MENOR preço entre todos os vendedores/plataformas ativos
 * de um produto (master_product) — o "objeto" acompanhado é o preço do
 * produto, não a oferta de um vendedor específico. Funde os eventos de
 * coleta de todas as ofertas ativas: a cada evento (de qualquer vendedor),
 * atualiza o preço conhecido daquele vendedor e recalcula o menor preço
 * entre todos os vendedores conhecidos até aquele instante.
 *
 * Também busca um preço-base de cada oferta ANTES do início da janela
 * (quando há timeframe): sem isso, uma oferta cujo snapshot mais recente cai
 * pouco antes do corte fica "invisível" pro merge até a próxima coleta dela,
 * inflando artificialmente o menor preço reconstruído no início do período.
 *
 * Limitação aceita: só considera ofertas ATIVAS hoje (mesmo espírito de
 * getUserWatches) — se um vendedor sair do ar, o histórico dele some do
 * gráfico inteiro, não só do ponto em diante. Corrigir com rastreio de
 * status histórico se/quando isso passar a importar.
 */
export async function getMasterProductPriceHistory(
  masterProductId: string,
  timeframe: PriceHistoryTimeframe
): Promise<PriceHistoryResult> {
  const interval = timeframe === 'Tudo' ? null : TIMEFRAME_INTERVALS[timeframe];

  const baselineRows = interval
    ? await db.execute<{ offer_id: string; price_cents: string }>(sql`
        SELECT DISTINCT ON (s.offer_id) s.offer_id, s.price_cents
        FROM affiliate_price_snapshots s
        INNER JOIN affiliate_offers o ON o.id = s.offer_id
        WHERE o.master_product_id = ${masterProductId} AND o.status = 'active'
          AND s.collected_at < now() - (${interval})::interval
        ORDER BY s.offer_id, s.collected_at DESC
      `)
    : [];

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
  for (const row of baselineRows) {
    lastKnownByOffer.set(row.offer_id, Number(row.price_cents) / 100);
  }

  function currentMin(): { value: number; offerId: string } {
    let minValue = Infinity;
    let minOfferId = '';
    for (const [offerId, price] of lastKnownByOffer) {
      if (price < minValue) {
        minValue = price;
        minOfferId = offerId;
      }
    }
    return { value: minValue, offerId: minOfferId };
  }

  const byTime = new Map<number, { value: number; offerId: string }>();

  // Com baseline conhecida, a janela já começa com o menor preço vigente até
  // ali, em vez de ficar "vazia" até a primeira coleta real dentro dela.
  if (interval && lastKnownByOffer.size > 0) {
    const windowStart = Math.floor((Date.now() - TIMEFRAME_MS[timeframe as Exclude<PriceHistoryTimeframe, 'Tudo'>]) / 1000);
    byTime.set(windowStart, currentMin());
  }

  for (const row of rows) {
    lastKnownByOffer.set(row.offer_id, Number(row.price_cents) / 100);
    const time = Math.floor(new Date(row.collected_at).getTime() / 1000);
    byTime.set(time, currentMin());
  }

  const points: PricePoint[] = [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, { value }]) => ({ time, value }));

  const winningOfferIds = [...new Set([...byTime.values()].map((v) => v.offerId))].filter(Boolean);

  const pointOffers: Record<number, PriceHistoryPointOffer> = {};
  if (winningOfferIds.length > 0) {
    const offerRows = await db
      .select({
        offerId: affiliateOffers.id,
        offerTitle: affiliateOffers.title,
        networkName: affiliateNetworks.name,
        networkColorHex: affiliateNetworks.colorHex,
        sellerNickname: affiliateSellers.nickname,
        sellerReputationLevel: affiliateSellers.reputationLevel,
        sellerPowerSellerStatus: affiliateSellers.powerSellerStatus,
        sellerTotalSales: affiliateSellers.totalSales,
        sellerPositiveRatingPercent: affiliateSellers.positiveRatingPercent,
      })
      .from(affiliateOffers)
      .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
      .leftJoin(affiliateSellers, eq(affiliateOffers.sellerId, affiliateSellers.id))
      .where(inArray(affiliateOffers.id, winningOfferIds));

    const offerById = new Map(offerRows.map((o) => [o.offerId, o]));
    for (const [time, { offerId }] of byTime) {
      const offer = offerById.get(offerId);
      if (offer) pointOffers[time] = offer;
    }
  }

  // Média/máximo vêm de TODAS as cotações de preço do período (soma de todo
  // snapshot de toda oferta ativa do produto, dividido pela quantidade) — não
  // da série de "menor preço vigente" (essa é só o traçado do gráfico, pesa
  // demais pro vendedor que mais posta preço e nunca reflete a cotação de um
  // vendedor que não estava ganhando o menor preço num dado momento). Mínimo
  // dá o mesmo valor nos dois cálculos, então fica como estava.
  const rawPrices = rows.map((r) => Number(r.price_cents) / 100);
  const values = points.map((p) => p.value);
  const stats: PriceHistoryStats = {
    avgPriceCents: rawPrices.length ? Math.round((rawPrices.reduce((a, b) => a + b, 0) / rawPrices.length) * 100) : null,
    minPriceCents: values.length ? Math.round(Math.min(...values) * 100) : null,
    maxPriceCents: rawPrices.length ? Math.round(Math.max(...rawPrices) * 100) : null,
  };

  const movingAveragePoints = computeMovingAverage(points, MOVING_AVERAGE_WINDOW_MS[timeframe]);

  return { points, movingAveragePoints, pointOffers, stats };
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
      -- current_price_cents = 0 é "ainda não coletado" (placeholder da
      -- descoberta automática) — nunca um preço real, nunca deixar vencer
      -- como "menor preço" de um produto.
      WHERE master_product_id IN (${idList}) AND status = 'active' AND current_price_cents > 0
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
      -- current_price_cents = 0 é "ainda não coletado", nunca um preço real.
      WHERE o.status = 'active' AND o.current_price_cents > 0
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
  /** Tag "vendedor alterou o preço" — null quando nunca mudou desde que a oferta foi criada. */
  lastPriceChangeAt: Date | null;
  previousPriceCents: number | null;
  /** true = ainda não tem link de afiliado real, CTA de compra fica desabilitado no front. */
  affiliateLinkPending: boolean;
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
      lastPriceChangeAt: affiliateOffers.lastPriceChangeAt,
      previousPriceCents: affiliateOffers.previousPriceCents,
      affiliateLinkPending: affiliateOffers.affiliateLinkPending,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .leftJoin(affiliateSellers, eq(affiliateOffers.sellerId, affiliateSellers.id))
    .where(
      and(
        eq(affiliateOffers.masterProductId, masterProductId),
        eq(affiliateOffers.status, 'active'),
        // current_price_cents = 0 é "ainda não coletado", nunca um preço real.
        gt(affiliateOffers.currentPriceCents, 0)
      )
    )
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

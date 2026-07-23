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
 * Tamanho do "balde" de tempo pra agregar o preço médio entre todas as lojas,
 * por período exibido — escalado pelo período (não por contagem de pontos):
 * no "1D" um balde de 4h ainda mostra a variação dentro do dia; no "1A" um
 * balde de hora seria ruído puro.
 */
const AVG_BUCKET_MS: Record<PriceHistoryTimeframe, number> = {
  '1D': 4 * 60 * 60 * 1000,
  '1S': 24 * 60 * 60 * 1000,
  '1M': 3 * 24 * 60 * 60 * 1000,
  '3M': 7 * 24 * 60 * 60 * 1000,
  '6M': 14 * 24 * 60 * 60 * 1000,
  '1A': 30 * 24 * 60 * 60 * 1000,
  Tudo: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Preço médio real de TODA cotação (toda loja, toda plataforma) dentro de
 * cada balde de tempo — soma de todo price_cents coletado no balde, dividido
 * pela quantidade. Diferente de `points` (menor preço vigente): aqui um
 * vendedor mais caro que nunca chegou a ganhar o "menor preço" ainda pesa na
 * média — é o preço médio de mercado do produto, não só o mais barato de
 * cada instante. Nunca fabrica ponto pra balde sem cotação nenhuma (ao
 * contrário de `points`, que precisa de linha contínua).
 */
function computeBucketedAverage(rows: { collected_at: string; price_cents: string }[], bucketMs: number): PricePoint[] {
  const bucketSeconds = Math.max(1, Math.floor(bucketMs / 1000));
  const buckets = new Map<number, { sum: number; count: number }>();

  for (const row of rows) {
    const timeSeconds = Math.floor(new Date(row.collected_at).getTime() / 1000);
    const bucketTime = Math.floor(timeSeconds / bucketSeconds) * bucketSeconds;
    const priceReais = Number(row.price_cents) / 100;
    const bucket = buckets.get(bucketTime);
    if (bucket) {
      bucket.sum += priceReais;
      bucket.count += 1;
    } else {
      buckets.set(bucketTime, { sum: priceReais, count: 1 });
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, { sum, count }]) => ({ time, value: sum / count }));
}

/**
 * Um ponto por balde de tempo: o MENOR preço batido entre todos os
 * vendedores/plataformas conhecidos durante aquele balde (herdando o preço
 * de quem já estava "rodando" desde antes do balde começar). Difere de um
 * gráfico por evento (um ponto a cada mudança de preço de qualquer
 * vendedor): aqui N mudanças de preço dentro do mesmo balde colapsam num
 * único ponto — a cada "ingestão" (balde de tempo), marca o menor preço
 * batido naquele intervalo, não uma corrente de pontos por cada pequena
 * oscilação entre vendedores concorrendo entre si (isso virava dezenas de
 * marcadores sobrepostos formando um bloco ilegível em vez de uma linha).
 */
function computeBucketedMinSeries(
  rows: { offer_id: string; collected_at: string; price_cents: string }[],
  baselineByOffer: Map<string, number>,
  bucketMs: number,
  windowStart: number,
  nowTime: number
): { points: PricePoint[]; offerByTime: Record<number, string> } {
  const bucketSeconds = Math.max(1, Math.floor(bucketMs / 1000));
  const lastKnown = new Map(baselineByOffer);

  function currentMin(): { value: number; offerId: string } | null {
    let minValue = Infinity;
    let minOfferId = '';
    for (const [offerId, price] of lastKnown) {
      if (price < minValue) {
        minValue = price;
        minOfferId = offerId;
      }
    }
    return minOfferId ? { value: minValue, offerId: minOfferId } : null;
  }

  const points: PricePoint[] = [];
  const offerByTime: Record<number, string> = {};
  const firstBucket = Math.floor(windowStart / bucketSeconds) * bucketSeconds;
  let rowIndex = 0;

  for (let bucketStart = firstBucket; bucketStart <= nowTime; bucketStart += bucketSeconds) {
    const bucketEnd = bucketStart + bucketSeconds;
    // Começa com o estado herdado de antes do balde (ninguém mudou de preço
    // não significa que o preço não existia) e vai descendo se algum evento
    // DENTRO do balde bater um preço ainda menor — assim o ponto reflete o
    // menor preço realmente vigente em algum instante daquele intervalo.
    let bucketMin = currentMin();

    while (rowIndex < rows.length) {
      const rowTime = Math.floor(new Date(rows[rowIndex].collected_at).getTime() / 1000);
      if (rowTime >= bucketEnd) break;
      lastKnown.set(rows[rowIndex].offer_id, Number(rows[rowIndex].price_cents) / 100);
      const min = currentMin();
      if (min && (!bucketMin || min.value < bucketMin.value)) bucketMin = min;
      rowIndex++;
    }

    if (bucketMin) {
      points.push({ time: bucketStart, value: bucketMin.value });
      offerByTime[bucketStart] = bucketMin.offerId;
    }
  }

  // Garante que o ponto mais recente reflita o estado atual mesmo que o
  // balde corrente ainda não tenha se fechado.
  const finalMin = currentMin();
  if (finalMin && (points.length === 0 || points[points.length - 1].time < nowTime)) {
    points.push({ time: nowTime, value: finalMin.value });
    offerByTime[nowTime] = finalMin.offerId;
  }

  return { points, offerByTime };
}

export interface PricePoint {
  /** Segundos desde epoch (UTCTimestamp), formato exigido pelo lightweight-charts. */
  time: number;
  /** Preço em reais (não centavos), pronto pro eixo do gráfico. */
  value: number;
}

/** Detalhes de cada cotação individual coletada — usada pro tooltip do balde, agrupada por `bucketTime`. */
export interface PriceQuotePoint {
  time: number;
  /** Início do balde de tempo (mesmo grid de `points`/`avgPoints`) — chave de agrupamento no tooltip. */
  bucketTime: number;
  value: number;
  networkName: string;
  networkColorHex: string | null;
  sellerNickname: string | null;
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
  globalMaxPriceCents: number | null;
}

export interface PriceHistoryResult {
  /** Um ponto por balde de tempo — o menor preço batido entre todas as lojas/plataformas naquele intervalo (não um ponto por evento de mudança de preço). */
  points: PricePoint[];
  /** Preço médio real entre TODAS as lojas/plataformas, no MESMO balde de tempo de `points` — não é média móvel de `points`, é a média de mercado do produto. */
  avgPoints: PricePoint[];
  /** Metadados do vendedor vencedor em cada ponto — chave é o mesmo `time` (início do balde) do PricePoint correspondente. */
  pointOffers: Record<number, PriceHistoryPointOffer>;
  /** Média/máximo somam TODA cotação de TODO vendedor ativo do produto no período (não só a série de menor preço do gráfico); mínimo coincide com o ponto mais baixo do gráfico de qualquer forma. */
  stats: PriceHistoryStats;
  /** Todas as cotações individuais do período, agrupáveis por `bucketTime` — alimenta o tooltip do ponto, não é mais plotada como camada própria no gráfico. */
  quotes: PriceQuotePoint[];
  /** Contagem de cotações DENTRO do período/timeframe selecionado (não histórico vitalício) — os marcadores de diário/semanal/mensal/trimestral/etc no topo do gráfico refletem o período marcado no seletor. */
  totalQuoteCount: number;
  /** Contagem total de ofertas (lojas/itens) cadastrados para este jogo em todas as plataformas. */
  totalOffersCount: number;
  /** Tamanho do balde de tempo (em segundos) usado em `points`/`avgPoints`/`bucketTime` — o client agrupa cotações por balde no tooltip com isso. */
  bucketSeconds: number;
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
function cleanGameName(name: string): string {
  // Remove termos de plataformas e pontuações do nome do produto para agrupamento cross-plataforma
  let cleaned = name
    .replace(/\b(nintendo switch 2|nintendo switch|switch 2|switch 1|switch|playstation 5|playstation 4|playstation 3|ps5|ps4|ps3|xbox series x\|s|xbox series x|xbox series s|xbox series|xbox one|xbox 360|pc|console|jogo)\b/gi, '')
    .replace(/[\(\)\[\]\-\:\+\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned.length >= 3 ? cleaned : name.trim();
}

export async function getMasterProductPriceHistory(
  masterProductId: string,
  timeframe: PriceHistoryTimeframe
): Promise<PriceHistoryResult> {
  const interval = timeframe === 'Tudo' ? null : TIMEFRAME_INTERVALS[timeframe];

  // Carrega o nome e plataforma do produto selecionado
  const [masterProduct] = await db
    .select({ name: masterProducts.name, gamePlatformGen: masterProducts.gamePlatformGen })
    .from(masterProducts)
    .where(eq(masterProducts.id, masterProductId))
    .limit(1);

  if (!masterProduct) {
    throw new Error('Produto master não encontrado');
  }

  const cleanName = cleanGameName(masterProduct.name);

  // Busca todos os produtos masters do mesmo jogo para o mesmo console
  const relatedProducts = await db
    .select({ id: masterProducts.id })
    .from(masterProducts)
    .where(
      and(
        sql`name ILIKE ${'%' + cleanName + '%'}`,
        eq(masterProducts.gamePlatformGen, masterProduct.gamePlatformGen)
      )
    );

  // O produto selecionado sempre entra, mesmo que o match fuzzy acima não o
  // encontre — o ILIKE roda sobre o nome JÁ limpo (sem termo de plataforma),
  // que pode nunca bater com o nome ORIGINAL na coluna quando o termo de
  // plataforma aparece no meio do nome (ex: "Minecraft Nintendo Switch Mídia
  // Física" vira "Minecraft Mídia Física" pra busca, que não é substring do
  // nome original). Sem essa garantia, masterProductIds podia vir vazio e o
  // `IN ()` resultante quebrava a query com erro de sintaxe.
  const masterProductIds = Array.from(new Set([masterProductId, ...relatedProducts.map((p) => p.id)]));
  const idsSql = sql.join(masterProductIds.map((id) => sql`${id}`), sql`, `);

  // As 5 consultas abaixo são independentes entre si (todas só dependem de
  // idsSql/interval, nenhuma do resultado da outra) — rodavam uma atrás da
  // outra antes, cada uma pagando a latência de rede até o Supabase de novo;
  // em paralelo, o tempo total cai pra próximo do da consulta mais lenta em
  // vez da soma de todas (chegava a 8-9s sequencial pra um produto só).
  const [baselineRows, rows, globalMaxRow, offersCountRow] = await Promise.all([
    interval
      ? db.execute<{ offer_id: string; price_cents: string }>(sql`
          SELECT DISTINCT ON (s.offer_id) s.offer_id, s.price_cents
          FROM affiliate_price_snapshots s
          INNER JOIN affiliate_offers o ON o.id = s.offer_id
          WHERE o.master_product_id IN (${idsSql}) AND o.status != 'draft'
            AND s.collected_at < now() - (${interval})::interval
          ORDER BY s.offer_id, s.collected_at DESC
        `)
      : Promise.resolve([] as { offer_id: string; price_cents: string }[]),

    db.execute<{
      offer_id: string;
      collected_at: string;
      price_cents: string;
      network_name: string;
      network_color_hex: string | null;
      seller_nickname: string | null;
    }>(
      interval
        ? sql`
          SELECT s.offer_id, s.collected_at, s.price_cents, n.name AS network_name, n.color_hex AS network_color_hex, sel.nickname AS seller_nickname
          FROM affiliate_price_snapshots s
          INNER JOIN affiliate_offers o ON o.id = s.offer_id
          INNER JOIN affiliate_networks n ON n.id = o.network_id
          LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
          WHERE o.master_product_id IN (${idsSql}) AND o.status != 'draft'
            AND s.collected_at >= now() - (${interval})::interval
          ORDER BY s.collected_at ASC
        `
        : sql`
          SELECT s.offer_id, s.collected_at, s.price_cents, n.name AS network_name, n.color_hex AS network_color_hex, sel.nickname AS seller_nickname
          FROM affiliate_price_snapshots s
          INNER JOIN affiliate_offers o ON o.id = s.offer_id
          INNER JOIN affiliate_networks n ON n.id = o.network_id
          LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
          WHERE o.master_product_id IN (${idsSql}) AND o.status != 'draft'
          ORDER BY s.collected_at ASC
        `
    ),

    db.execute<{ max_price: string }>(sql`
      SELECT MAX(s.price_cents)::bigint AS max_price
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers o ON o.id = s.offer_id
      WHERE o.master_product_id IN (${idsSql}) AND o.status != 'draft'
    `),

    db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::bigint AS total
      FROM affiliate_offers o
      WHERE o.master_product_id IN (${idsSql}) AND o.status != 'draft'
    `),
  ]);

  const baselineByOffer = new Map<string, number>();
  for (const row of baselineRows) {
    baselineByOffer.set(row.offer_id, Number(row.price_cents) / 100);
  }

  const windowStart = interval
    ? Math.floor((Date.now() - TIMEFRAME_MS[timeframe as Exclude<PriceHistoryTimeframe, 'Tudo'>]) / 1000)
    : Math.floor((Date.now() - 730 * 86400 * 1000) / 1000);

  const nowTime = Math.floor(Date.now() / 1000);
  // Mesmo balde de tempo usado pra média — assim as duas linhas ficam no
  // mesmo grid e são diretamente comparáveis ponto a ponto no tooltip.
  const bucketMs = AVG_BUCKET_MS[timeframe];

  const { points, offerByTime } = computeBucketedMinSeries(rows, baselineByOffer, bucketMs, windowStart, nowTime);

  const winningOfferIds = [...new Set(Object.values(offerByTime))].filter(Boolean);

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
    for (const [time, offerId] of Object.entries(offerByTime)) {
      const offer = offerById.get(offerId);
      if (offer) pointOffers[Number(time)] = offer;
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
  const globalMaxPriceCents = globalMaxRow[0]?.max_price ? Number(globalMaxRow[0].max_price) : null;

  const stats: PriceHistoryStats = {
    avgPriceCents: rawPrices.length ? Math.round((rawPrices.reduce((a, b) => a + b, 0) / rawPrices.length) * 100) : null,
    minPriceCents: values.length ? Math.round(Math.min(...values) * 100) : null,
    maxPriceCents: rawPrices.length ? Math.round(Math.max(...rawPrices) * 100) : null,
    globalMaxPriceCents,
  };

  // Escopado ao período/timeframe selecionado (não histórico vitalício) —
  // os marcadores de contagem no topo do gráfico precisam refletir
  // diário/semanal/mensal/trimestral/etc conforme o período marcado.
  const totalQuoteCount = rows.length;
  const totalOffersCount = Number(offersCountRow[0]?.total || 0);

  const bucketSeconds = Math.max(1, Math.floor(bucketMs / 1000));

  // Defesa contra histórico já inflado por checagens redundantes anteriores
  // (produtos monitorados há tempo podem ter dezenas de milhares de linhas
  // repetidas) — nunca manda mais que isso pro tooltip, mesmo que `rows`
  // tenha muito mais; amostragem uniforme ao longo do período pra não
  // perder a forma da distribuição no tempo. stats/avgPoints/points acima já
  // foram calculados sobre `rows` completo, então essa amostragem não afeta
  // média/mínimo/máximo — só a quantidade de cotações listadas no tooltip.
  const MAX_QUOTES = 2000;
  const sampledRows =
    rows.length > MAX_QUOTES
      ? rows.filter((_, i) => i % Math.ceil(rows.length / MAX_QUOTES) === 0)
      : rows;

  // Cada cotação carrega o `bucketTime` do mesmo grid de `points`/`avgPoints`
  // — o tooltip agrupa por esse valor pra mostrar "quem cotou o quê" dentro
  // do intervalo do ponto sob o cursor, sem depender de bater timestamp
  // exato (quase nunca bate entre uma cotação individual e o ponto do balde).
  const quotes: PriceQuotePoint[] = sampledRows.map((row) => {
    const time = Math.floor(new Date(row.collected_at).getTime() / 1000);
    return {
      time,
      bucketTime: Math.floor(time / bucketSeconds) * bucketSeconds,
      value: Number(row.price_cents) / 100,
      networkName: row.network_name,
      networkColorHex: row.network_color_hex,
      sellerNickname: row.seller_nickname,
    };
  });

  const avgPoints = computeBucketedAverage(rows, bucketMs);

  return { points, avgPoints, pointOffers, stats, quotes, totalQuoteCount, totalOffersCount, bucketSeconds };
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

import 'server-only';
import { sql, eq, and, asc, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { offerIdentityVisibleSql, notQuarantinedSql } from '@/server/queries/public-offers';
import { catalogHiddenFilter } from '@/server/queries/catalog-dimensions';
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
  '1D': 30 * 60 * 1000, // Baldes de 30 min no gráfico diário
  '1S': 6 * 60 * 60 * 1000, // Baldes de 6h no gráfico semanal
  '1M': 24 * 60 * 60 * 1000, // Baldes de 1 dia no gráfico mensal
  '3M': 2 * 24 * 60 * 60 * 1000, // Baldes de 2 dias no gráfico trimestral
  '6M': 4 * 24 * 60 * 60 * 1000, // Baldes de 4 dias no gráfico semestral
  '1A': 7 * 24 * 60 * 60 * 1000, // Baldes de 7 dias no gráfico anual
  Tudo: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Menor preço real em cada balde de tempo, com "carry-forward" por oferta.
 *
 * Achado real (2026-08-03): olhar só as cotações que caíram DENTRO de cada
 * balde criava picos artificiais (a loja barata não foi rechecada naquele
 * balde e a cara virava o "menor"). Por isso o último preço conhecido de cada
 * oferta é carregado adiante entre baldes, começando do `baselineByOffer` (a
 * cotação mais recente de cada oferta ANTES da janela): uma loja barata
 * continua valendo até uma cotação NOVA dizer o contrário.
 *
 * Desde 2026-11-01 recebe `entries` já agregadas no SQL: o ÚLTIMO preço de
 * cada oferta em cada balde (equivale a processar todas as cotações em ordem
 * cronológica, pois só o último valor por oferta/balde sobrevive ao carry).
 * Nenhum valor é inventado: só preços realmente coletados.
 */
function computeBucketedMinSeries(
  entries: { offerId: string; bucket: number; priceReais: number; firstSeen: number }[],
  baselineByOffer: Map<string, number>,
  bucketSeconds: number,
  windowStart: number,
  nowTime: number
): { points: PricePoint[]; offerByTime: Record<number, string> } {
  // Desempate por 1ª aparição da oferta na janela: preserva a ordem de inserção
  // do processamento cronológico (empate de preço entre ofertas vai pra que apareceu antes).
  const sortedEntries = [...entries].sort((a, b) => a.bucket - b.bucket || a.firstSeen - b.firstSeen);

  const lastKnownPriceByOffer = new Map<string, number>(baselineByOffer);
  const points: PricePoint[] = [];
  const offerByTime: Record<number, string> = {};

  const startBucket = Math.floor(windowStart / bucketSeconds) * bucketSeconds;
  const endBucket = Math.floor(nowTime / bucketSeconds) * bucketSeconds;

  let entryIndex = 0;
  for (let bucketTime = startBucket; bucketTime <= endBucket; bucketTime += bucketSeconds) {
    // Consome toda cotação cujo balde é <= ao atual (== cotação com tempo < fim do balde).
    while (entryIndex < sortedEntries.length && sortedEntries[entryIndex].bucket <= bucketTime) {
      const e = sortedEntries[entryIndex];
      lastKnownPriceByOffer.set(e.offerId, e.priceReais);
      entryIndex++;
    }

    if (lastKnownPriceByOffer.size === 0) continue;

    let minPrice = Infinity;
    let minOfferId = '';
    for (const [offerId, price] of lastKnownPriceByOffer) {
      if (price < minPrice) {
        minPrice = price;
        minOfferId = offerId;
      }
    }

    points.push({ time: bucketTime, value: minPrice });
    offerByTime[bucketTime] = minOfferId;
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
  /** Frequência/volume de cotações coletadas por balde de tempo — alimenta o histograma na parte inferior do gráfico. */
  frequencyPoints: PricePoint[];
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
export async function getMasterProductPriceHistory(
  masterProductId: string,
  timeframe: PriceHistoryTimeframe
): Promise<PriceHistoryResult> {
  const interval = timeframe === 'Tudo' ? null : TIMEFRAME_INTERVALS[timeframe];

  // Um jogo, um master_product (regra de negócio): sem agrupamento por nome
  // (ILIKE). A estatística canônica (getMasterProductPriceStats) cobre só este id.
  const [masterProduct] = await db
    .select({ id: masterProducts.id })
    .from(masterProducts)
    .where(eq(masterProducts.id, masterProductId))
    .limit(1);

  if (!masterProduct) {
    throw new Error('Produto master não encontrado');
  }

  const masterProductIds = [masterProductId];
  const idsSql = sql.join(masterProductIds.map((id) => sql`${id}`), sql`, `);

  const bucketMs = AVG_BUCKET_MS[timeframe];
  const bucketSeconds = Math.max(1, Math.floor(bucketMs / 1000));
  const MAX_QUOTES = 2000;

  // Antes: ~300 mil cotações (Switch 2) trafegavam do banco pro Node (~7 s) e
  // eram agregadas em JS. Agora UMA varredura da janela (CTE materializada) é
  // agregada no Postgres e só o resumo volta: estatísticas globais, último
  // preço por (oferta, balde), soma/contagem por balde, mudanças de preço por
  // balde e uma amostra determinística de no máximo MAX_QUOTES cotações
  // (1 a cada ceil(n / MAX_QUOTES), em ordem cronológica — a mesma regra de
  // antes). Todos os valores continuam sendo cotações reais.
  const windowFilter = interval ? sql`AND s.collected_at >= now() - (${interval})::interval` : sql``;

  type AggRow = {
    kind: string;
    bucket: string | null;
    offer_id: string | null;
    n1: string | null;
    n2: string | null;
    n3: string | null;
    network_name: string | null;
    network_color_hex: string | null;
    seller_nickname: string | null;
  };

  const [baselineRows, aggRows, globalMaxRow, offersCountRow, activeOffers] = await Promise.all([
    interval
      ? db.execute<{ offer_id: string; price_cents: string }>(sql`
          SELECT DISTINCT ON (s.offer_id) s.offer_id, s.price_cents
          FROM affiliate_price_snapshots s
          INNER JOIN affiliate_offers o ON o.id = s.offer_id
          WHERE o.master_product_id IN (${idsSql}) AND o.status = 'active' AND ${offerIdentityVisibleSql('o.id')}
            AND s.collected_at < now() - (${interval})::interval
          ORDER BY s.offer_id, s.collected_at DESC
        `)
      : Promise.resolve([] as { offer_id: string; price_cents: string }[]),

    db.execute<AggRow>(sql`
      WITH r AS MATERIALIZED (
        SELECT s.offer_id, s.collected_at, s.price_cents::bigint AS price_cents,
               (floor(extract(epoch FROM s.collected_at) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric)::bigint AS bucket
        FROM affiliate_price_snapshots s
        INNER JOIN affiliate_offers o ON o.id = s.offer_id
        WHERE o.master_product_id IN (${idsSql}) AND o.status = 'active' AND ${offerIdentityVisibleSql('o.id')}
          ${windowFilter}
      ),
      st AS (
        SELECT COUNT(*)::bigint AS n, COALESCE(SUM(price_cents), 0)::numeric AS sum_c, MAX(price_cents) AS max_c
        FROM r
      ),
      -- Mesma regra de outlier de antes: descarta cotação > 2x a média bruta.
      c AS MATERIALIZED (
        SELECT r.offer_id, r.price_cents, r.bucket,
               LAG(r.price_cents) OVER (PARTITION BY r.offer_id ORDER BY r.collected_at) AS prev_cents
        FROM r, st
        WHERE st.sum_c <= 0 OR r.price_cents::numeric * st.n <= 2 * st.sum_c
      )
      SELECT 'stat' AS kind, NULL::bigint AS bucket, NULL::text AS offer_id,
             st.n::numeric AS n1, st.max_c::numeric AS n2, st.sum_c AS n3,
             NULL::text AS network_name, NULL::text AS network_color_hex, NULL::text AS seller_nickname
      FROM st
      UNION ALL
      SELECT 'cstat', NULL, NULL, COUNT(*)::numeric, COALESCE(SUM(price_cents), 0)::numeric, NULL, NULL, NULL, NULL
      FROM c
      UNION ALL
      SELECT 'min', x.bucket, x.offer_id::text, x.price_cents::numeric, extract(epoch FROM x.first_at)::numeric, NULL, NULL, NULL, NULL
      FROM (
        SELECT DISTINCT ON (offer_id, bucket) offer_id, bucket, price_cents,
               MIN(collected_at) OVER (PARTITION BY offer_id) AS first_at
        FROM r
        ORDER BY offer_id, bucket, collected_at DESC
      ) x
      UNION ALL
      SELECT 'avg', bucket, NULL, SUM(price_cents)::numeric, COUNT(*)::numeric, NULL, NULL, NULL, NULL
      FROM c
      GROUP BY bucket
      UNION ALL
      SELECT 'freq', bucket, NULL, COUNT(*)::numeric, NULL, NULL, NULL, NULL, NULL
      FROM c
      WHERE prev_cents IS NULL OR prev_cents <> price_cents
      GROUP BY bucket
      UNION ALL
      SELECT 'quote', q.bucket, NULL, floor(extract(epoch FROM q.collected_at))::numeric, q.price_cents::numeric, q.rn::numeric,
             n.name, n.color_hex, sel.nickname
      FROM (
        SELECT r.offer_id, r.collected_at, r.price_cents, r.bucket,
               ROW_NUMBER() OVER (ORDER BY r.collected_at) AS rn
        FROM r
      ) q
      CROSS JOIN st
      INNER JOIN affiliate_offers o ON o.id = q.offer_id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE (q.rn - 1) % GREATEST(1, CEIL(st.n::numeric / ${MAX_QUOTES}::numeric)::bigint) = 0
    `),

    db.execute<{ max_price: string }>(sql`
      SELECT MAX(s.price_cents)::bigint AS max_price
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers o ON o.id = s.offer_id
      WHERE o.master_product_id IN (${idsSql}) AND o.status = 'active' AND ${offerIdentityVisibleSql('o.id')}
    `),

    db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::bigint AS total
      FROM affiliate_offers o
      WHERE o.master_product_id IN (${idsSql}) AND o.status = 'active' AND ${offerIdentityVisibleSql('o.id')}
    `),

    db.execute<{
      offer_id: string;
      current_price_cents: string;
      network_name: string;
      network_color_hex: string | null;
      seller_nickname: string | null;
    }>(sql`
      SELECT o.id AS offer_id, o.current_price_cents, n.name AS network_name, n.color_hex AS network_color_hex, sel.nickname AS seller_nickname
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE o.master_product_id IN (${idsSql}) AND o.status = 'active' AND ${offerIdentityVisibleSql('o.id')} AND o.current_price_cents > 0
    `),
  ]);

  const baselineByOffer = new Map<string, number>();
  for (const row of baselineRows) {
    baselineByOffer.set(row.offer_id, Number(row.price_cents) / 100);
  }

  const nowTime = Math.floor(Date.now() / 1000);
  const windowStart = interval
    ? Math.floor((Date.now() - TIMEFRAME_MS[timeframe as Exclude<PriceHistoryTimeframe, 'Tudo'>]) / 1000)
    : Math.floor((Date.now() - 730 * 86400 * 1000) / 1000);

  let totalQuoteCount = 0;
  let rawMaxCents: number | null = null;
  let rawSumCents = 0;
  let cleanCount = 0;
  let cleanSumCents = 0;
  const minEntries: { offerId: string; bucket: number; priceReais: number; firstSeen: number }[] = [];
  const avgPoints: PricePoint[] = [];
  const frequencyPoints: PricePoint[] = [];
  const quoteRows: { rn: number; quote: PriceQuotePoint }[] = [];

  for (const row of aggRows) {
    switch (row.kind) {
      case 'stat':
        totalQuoteCount = Number(row.n1);
        rawMaxCents = totalQuoteCount > 0 ? Number(row.n2) : null;
        rawSumCents = Number(row.n3);
        break;
      case 'cstat':
        cleanCount = Number(row.n1);
        cleanSumCents = Number(row.n2);
        break;
      case 'min':
        minEntries.push({ offerId: row.offer_id as string, bucket: Number(row.bucket), priceReais: Number(row.n1) / 100, firstSeen: Number(row.n2) });
        break;
      case 'avg': {
        const count = Number(row.n2);
        avgPoints.push({
          time: Number(row.bucket),
          value: Math.round((Number(row.n1) / 100 / count) * 100) / 100,
        });
        break;
      }
      case 'freq':
        frequencyPoints.push({ time: Number(row.bucket), value: Number(row.n1) });
        break;
      case 'quote':
        quoteRows.push({
          rn: Number(row.n3),
          quote: {
            time: Number(row.n1),
            bucketTime: Number(row.bucket),
            value: Number(row.n2) / 100,
            networkName: row.network_name as string,
            networkColorHex: row.network_color_hex,
            sellerNickname: row.seller_nickname,
          },
        });
        break;
    }
  }

  avgPoints.sort((a, b) => a.time - b.time);
  frequencyPoints.sort((a, b) => a.time - b.time);
  quoteRows.sort((a, b) => a.rn - b.rn);
  const quotes: PriceQuotePoint[] = quoteRows.map((q) => q.quote);

  const { points, offerByTime } = computeBucketedMinSeries(minEntries, baselineByOffer, bucketSeconds, windowStart, nowTime);

  // Sincronização 100% exata: Garante que o último ponto do gráfico (hoje) seja rigorosamente igual ao menor preço ativo do produto
  if (points.length > 0 && activeOffers.length > 0) {
    const sortedActiveOffers = [...activeOffers].sort((a, b) => Number(a.current_price_cents) - Number(b.current_price_cents));
    const lowestCurrentOffer = sortedActiveOffers[0];
    const lowestReais = Number(lowestCurrentOffer.current_price_cents) / 100;

    if (lowestReais > 0) {
      const lastIndex = points.length - 1;
      points[lastIndex].value = lowestReais;
      offerByTime[points[lastIndex].time] = lowestCurrentOffer.offer_id;
    }
  }

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

  const values = points.map((p) => p.value);
  const globalMaxPriceCents = globalMaxRow[0]?.max_price ? Number(globalMaxRow[0].max_price) : null;

  // Média sem outliers (> 2x a média bruta); sem nenhuma cotação limpa, cai na bruta.
  const avgSumCents = cleanCount > 0 ? cleanSumCents : rawSumCents;
  const avgCount = cleanCount > 0 ? cleanCount : totalQuoteCount;

  const stats: PriceHistoryStats = {
    avgPriceCents: avgCount > 0 ? Math.round(avgSumCents / avgCount) : null,
    // reduce, não Math.min(...arr): evita estouro de pilha com séries grandes.
    minPriceCents: values.length ? Math.round(values.reduce((m, v) => (v < m ? v : m), Infinity) * 100) : null,
    maxPriceCents: rawMaxCents,
    globalMaxPriceCents,
  };

  const totalOffersCount = Number(offersCountRow[0]?.total || 1);

  return { points, avgPoints, frequencyPoints, pointOffers, stats, quotes, totalQuoteCount, totalOffersCount, bucketSeconds };
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
      WHERE master_product_id IN (${idList}) AND status = 'active' AND current_price_cents > 0 AND quarantined_at IS NULL
    ),
    current_lowest AS (
      SELECT master_product_id, MIN(current_price_cents)::bigint AS current_price_cents
      FROM active_offers
      GROUP BY master_product_id
    ),
    -- LATERAL com LIMIT 1 usa o índice (offer_id, collected_at) e lê 1 linha por
    -- oferta; o DISTINCT ON anterior ordenava ~3M snapshots (28s -> 1,2s medido
    -- em 2026-10-30, resultado idêntico).
    baseline_per_offer AS (
      SELECT ao.offer_id, b.price_cents AS baseline_price_cents
      FROM active_offers ao
      CROSS JOIN LATERAL (
        SELECT s.price_cents
        FROM affiliate_price_snapshots s
        WHERE s.offer_id = ao.offer_id AND s.collected_at <= now() - (${interval})::interval
        ORDER BY s.collected_at DESC
        LIMIT 1
      ) b
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
  // Cartela pública (F-07): altas e baixas não mostram teclado, peça, jogo digital etc.
  const inCatalog = await catalogHiddenFilter(sql`mp.id`);

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
      WHERE o.status = 'active' AND o.current_price_cents > 0 AND ${notQuarantinedSql('o')}
    ),
    cheapest AS (
      SELECT DISTINCT ON (master_product_id) master_product_id, offer_id, current_price_cents, slug, image_url, network_name
      FROM active_offers
      ORDER BY master_product_id, current_price_cents ASC
    ),
    baseline_per_offer AS (
      SELECT ao.offer_id, b.price_cents AS baseline_price_cents
      FROM active_offers ao
      CROSS JOIN LATERAL (
        SELECT s.price_cents
        FROM affiliate_price_snapshots s
        WHERE s.offer_id = ao.offer_id AND s.collected_at <= now() - (${interval})::interval
        ORDER BY s.collected_at DESC
        LIMIT 1
      ) b
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
    WHERE bl.baseline_price_cents > 0 AND ${inCatalog}
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
        gt(affiliateOffers.currentPriceCents, 0),
        isNull(affiliateOffers.quarantinedAt)
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

import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { swrBatch, withTimeout } from '@/lib/cache/swr';
import { verticalSql, GAMES, type Vertical } from '@/lib/catalog/verticais';
import { publicOffersCtes, medianSql, weakSellerSql, catalogGateVisibleSql, offerIdentityVisibleSql, avgExcludedFlagSql } from '@/server/queries/public-offers';
import {
  AGGREGATE_CEILING_MEDIAN_MULTIPLE,
  LOW_BADGE_CORROBORATION_BAND_PERCENT,
  MIN_HISTORY_DAYS_FOR_VERDICT,
  MIN_QUOTES_FOR_VERDICT,
  PLAUSIBILITY_FLOOR_PERCENT,
  PLAUSIBILITY_MIN_OFFERS,
  checkEligibility,
  lowBadgeBlockReason,
  sellerTier,
  DISPERSION_LOW_CONFIDENCE_RATIO,
  type LowBadgeBlockReason,
  type SellerTier,
} from '@/lib/affiliate/price-verdict';

/**
 * FONTE ÚNICA de estatística de preço por `master_product` (ADR 0001).
 *
 * Regras (ver docs/modelo-indicadores.md, seção 7):
 * - Escopo: UM `master_product_id` (sem agrupamento fuzzy por nome).
 * - Cotações = todos os `affiliate_price_snapshots` de TODAS as ofertas do
 *   produto, de QUALQUER status (ativa, pausada, expirada...), com
 *   `price_cents > 0`. Histórico é intocável: oferta expirada continua contando.
 * - PISO DE PLAUSIBILIDADE (ADR 0001 decisão 3 revista em 2026-10-31): a cotação
 *   abaixo de PLAUSIBILITY_FLOOR_PERCENT % da MEDIANA das cotações do produto é
 *   anúncio-isca e sai de TUDO (mínimos, média, máximo, contagem, elegibilidade).
 *   Só vale com >= PLAUSIBILITY_MIN_OFFERS cotações (sem régua, passa). A
 *   cotação não é apagada; `rawMinCents`/`floorApplied`/`floorExcludedQuoteCount`
 *   expõem o que foi cortado. Esta é a ÚNICA implementação: vitrine, busca,
 *   produto, tabela de preços e home leem daqui (`priceQuotesCtes`).
 * - Média única = soma de todas as cotações / total de cotações, em TODO o
 *   histórico, depois do piso e do filtro de outlier: descarta cotação
 *   `price_cents > 2 x média bruta` (erro de captura, frete embutido, câmbio).
 *   O filtro nunca afeta o mínimo; afeta média e máximo (o máximo "limpo").
 * - Menor preço (tudo / 1 ano / 3 meses): cotação mais barata da janela;
 *   empate => primeira ocorrência (menor `collected_at`).
 * - "Preço atual" e CTA saem só de ofertas PÚBLICAS (ADR 0002: ativa, preço > 0,
 *   coleta real <= 7 dias, preço >= 35% da mediana do produto quando há >= 3
 *   ofertas; ver public-offers.ts): a mais barata hoje (concorrência real).
 *   O histórico (lowAll/média/contagem) continua contando TODA cotação.
 * - Nada é interpolado: janela sem cotação => `null`.
 * - Rodada 2026-11-01 (docs/conselho/pareceres-2026-11-01): piso ESTRITO (`>`);
 *   mediana = `medianSql` (uma definição só, public-offers.ts); teto de
 *   AGGREGATE_CEILING_MEDIAN_MULTIPLE x mediana só em média e máximo; cotação de
 *   vendedor fraco (`weakSellerSql`) não define o menor preço histórico (continua
 *   em média e contagem); o menor preço INCLUI a oferta pública atual (F-14);
 *   dispersão (máx limpo / mín limpo) > DISPERSION_LOW_CONFIDENCE_RATIO => `lowConfidence`;
 *   `lowBadgeBlock` diz por que o selo "menor registrado" não vale. Nada é apagado.
 *
 * Datas viajam como string ISO (o cache do Next serializa em JSON).
 */

/**
 * CTEs compartilhadas (`q_all`, `pfloor`, `q`) das cotações do produto com o
 * piso de plausibilidade aplicado. `scope` é a condição SQL sobre `o`
 * (affiliate_offers), ex.: `o.master_product_id IN (...)` ou `TRUE`.
 * `q` = cotações plausíveis (colunas master_product_id, offer_id, price_cents,
 * collected_at); `pfloor` = por produto n_all, raw_min, median_cents, floor_cents
 * (null quando há menos de PLAUSIBILITY_MIN_OFFERS cotações: sem régua).
 */
export function priceQuotesCtes(scope: SQL, vertical: Vertical): SQL {
  const pct = sql.raw(String(PLAUSIBILITY_FLOOR_PERCENT / 100));
  const minN = sql.raw(String(Math.trunc(PLAUSIBILITY_MIN_OFFERS)));
  return sql`
    q_all AS MATERIALIZED (
      SELECT o.master_product_id, o.id AS offer_id, s.price_cents, s.collected_at,
             ${weakSellerSql('sel')} AS weak_seller, ${avgExcludedFlagSql('o')} AS avg_excluded
      FROM affiliate_offers o
      INNER JOIN affiliate_price_snapshots s ON s.offer_id = o.id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE (${scope}) AND s.price_cents > 0
        AND ${verticalSql('o', vertical)}
        AND ${catalogGateVisibleSql('o.master_product_id')}
        AND ${offerIdentityVisibleSql('o.id')}
    ),
    pfloor AS (
      SELECT master_product_id,
             COUNT(*) FILTER (WHERE NOT avg_excluded)::int AS n_all,
             MIN(price_cents) AS raw_min,
             ${medianSql('price_cents')} FILTER (WHERE NOT avg_excluded) AS median_cents,
             CASE WHEN COUNT(*) FILTER (WHERE NOT avg_excluded) >= ${minN}
                  THEN ${medianSql('price_cents')} FILTER (WHERE NOT avg_excluded) * ${pct} END AS floor_cents
      FROM q_all GROUP BY master_product_id
    ),
    q AS (
      SELECT a.master_product_id, a.offer_id, a.price_cents, a.collected_at, a.weak_seller, a.avg_excluded
      FROM q_all a INNER JOIN pfloor f ON f.master_product_id = a.master_product_id
      WHERE f.floor_cents IS NULL OR a.price_cents > f.floor_cents
    )
  `;
}

/**
 * Agregados por produto, UMA implementação (tabela, página, cards, busca).
 * Inclui `priceQuotesCtes` e termina na CTE `product_stats` (uma linha por
 * master_product com cotação plausível):
 *   quote_count, avg_quote_count, avg_cents, raw_avg_cents, max_cents, max_raw_cents,
 *   history_since, history_until, history_days, min_all/min_1y/min_3m (sem vendedor fraco),
 *   median_cents (das cotações limpas), dispersion_ratio, n_all, raw_min, floor_cents,
 *   pf_median (mediana de todas as cotações; null sem régua).
 * "Limpa" = não passa de 2x a média bruta E, com régua, não passa de
 * AGGREGATE_CEILING_MEDIAN_MULTIPLE x a mediana. O mínimo nunca depende do teto.
 */
export function statsAggCtes(scope: SQL, vertical: Vertical): SQL {
  const mult = sql.raw(String(AGGREGATE_CEILING_MEDIAN_MULTIPLE));
  const clean = sql`(q.price_cents <= raw.raw_avg * 2 AND (pf.floor_cents IS NULL OR q.price_cents <= pf.median_cents * ${mult}))`;
  return sql`
    ${priceQuotesCtes(scope, vertical)},
    raw AS (
      SELECT master_product_id,
             AVG(price_cents) FILTER (WHERE NOT avg_excluded) AS raw_avg,
             COUNT(*)::int AS quote_count,
             MAX(price_cents)::bigint AS max_raw_cents,
             MIN(collected_at) AS history_since,
             MAX(collected_at) AS history_until,
             MIN(price_cents) FILTER (WHERE NOT weak_seller) AS min_all,
             MIN(price_cents) FILTER (WHERE NOT weak_seller AND collected_at >= now() - interval '365 days') AS min_1y,
             MIN(price_cents) FILTER (WHERE NOT weak_seller AND collected_at >= now() - interval '90 days') AS min_3m
      FROM q GROUP BY master_product_id
    ),
    agg AS (
      SELECT q.master_product_id,
             COUNT(*) FILTER (WHERE ${clean} AND NOT q.avg_excluded)::int AS avg_quote_count,
             AVG(q.price_cents) FILTER (WHERE ${clean} AND NOT q.avg_excluded)::numeric AS avg_cents,
             MAX(q.price_cents) FILTER (WHERE ${clean} AND NOT q.avg_excluded)::bigint AS max_cents,
             MIN(q.price_cents) FILTER (WHERE ${clean} AND NOT q.avg_excluded)::bigint AS clean_min_cents,
             ${medianSql('q.price_cents')} FILTER (WHERE ${clean} AND NOT q.avg_excluded) AS median_cents
      FROM q
      INNER JOIN raw ON raw.master_product_id = q.master_product_id
      INNER JOIN pfloor pf ON pf.master_product_id = q.master_product_id
      GROUP BY q.master_product_id
    ),
    product_stats AS (
      SELECT raw.master_product_id, raw.quote_count, agg.avg_quote_count, agg.avg_cents,
             raw.raw_avg::numeric AS raw_avg_cents, agg.max_cents, raw.max_raw_cents,
             raw.history_since, raw.history_until,
             FLOOR(EXTRACT(EPOCH FROM (raw.history_until - raw.history_since)) / 86400)::int AS history_days,
             raw.min_all, raw.min_1y, raw.min_3m,
             agg.median_cents,
             CASE WHEN agg.clean_min_cents > 0 THEN agg.max_cents::numeric / agg.clean_min_cents END AS dispersion_ratio,
             pf.n_all, pf.raw_min, pf.floor_cents,
             CASE WHEN pf.floor_cents IS NOT NULL THEN pf.median_cents END AS pf_median
      FROM raw
      INNER JOIN agg ON agg.master_product_id = raw.master_product_id
      INNER JOIN pfloor pf ON pf.master_product_id = raw.master_product_id
    )
  `;
}

/**
 * "Menor preço já visto" da home: menor cotação plausível (piso aplicado) entre
 * os produtos com histórico elegível (>= 5 cotações e >= 14 dias). 0 se nenhum.
 */
export async function getPlatformLowestPriceCentsEver(): Promise<number> {
  const rows = await db.execute<Row>(sql`
    WITH ${priceQuotesCtes(sql`TRUE`, GAMES)},
    agg AS (
      SELECT master_product_id, MIN(price_cents) AS mn, COUNT(*) AS n,
             FLOOR(EXTRACT(EPOCH FROM (MAX(collected_at) - MIN(collected_at))) / 86400) AS d
      FROM q GROUP BY master_product_id
    )
    SELECT MIN(mn)::bigint AS min_cents FROM agg
    WHERE n >= ${sql.raw(String(MIN_QUOTES_FOR_VERDICT))} AND d >= ${sql.raw(String(MIN_HISTORY_DAYS_FOR_VERDICT))}
  `);
  return rows[0]?.min_cents != null ? Number(rows[0].min_cents) : 0;
}

export type PriceLowWindow = 'all' | '1y' | '3m';

export interface PriceLow {
  priceCents: number;
  /** ISO 8601 do `collected_at` da primeira cotação com esse preço na janela. */
  at: string;
  offerId: string;
  offerSlug: string;
  networkName: string;
  sellerNickname: string | null;
  /** true se a oferta da cotação ainda está `active`; false => rotular "encerrada" na UI. */
  offerActive: boolean;
  offerStatus: string;
}

export interface CurrentLowestOffer {
  offerId: string;
  offerSlug: string;
  priceCents: number;
  networkName: string;
  sellerNickname: string | null;
  /** Confiança do vendedor da oferta (price-verdict.ts `sellerTier`): 'low' fica fora de destaques e selos. */
  sellerTier: SellerTier;
  sellerReputationLevel: string | null;
  sellerTotalSales: number | null;
}

export interface MasterProductPriceStats {
  masterProductId: string;
  /** Menor preço hoje entre ofertas ativas com preço > 0; null se não há nenhuma. */
  currentLowestActive: CurrentLowestOffer | null;
  lowAll: PriceLow | null;
  low1y: PriceLow | null;
  low3m: PriceLow | null;
  /** Maior cotação, já sem os outliers (> 2x média bruta). */
  maxCents: number | null;
  /** Maior cotação bruta, incluindo outliers (auditoria). */
  maxRawCents: number | null;
  /** Média única (todas as lojas, todo o histórico, filtro 2x). Arredondada em centavos. */
  avgCents: number | null;
  /** Média bruta, sem filtro (auditoria do filtro). */
  rawAvgCents: number | null;
  /** Menor cotação BRUTA (sem piso), para auditoria. null sem cotação. */
  rawMinCents: number | null;
  /** Piso aplicado em centavos (PLAUSIBILITY_FLOOR_PERCENT % da mediana); null = sem régua (poucas cotações). */
  floorCents: number | null;
  /** true se o mínimo bruto estava abaixo do piso (isca removida do mínimo). */
  floorApplied: boolean;
  /** Cotações abaixo do piso (fora de mínimo, média, máximo e contagem). */
  floorExcludedQuoteCount: number;
  /** Total de cotações reais plausíveis (price_cents > 0, depois do piso), antes do filtro 2x. */
  quoteCount: number;
  /** Cotações que entraram na média (depois do filtro 2x). */
  avgQuoteCount: number;
  /** Cotações descartadas pelo filtro 2x. */
  excludedQuoteCount: number;
  /** ISO da primeira cotação; null se não há cotação. */
  historySince: string | null;
  /** ISO da última cotação; null se não há cotação. */
  historyUntil: string | null;
  /** Dias inteiros entre a primeira e a última cotação. */
  historyDays: number;
  /**
   * Mediana das cotações limpas ("preço típico"). Só com histórico elegível; null
   * caso contrário. Informação extra: NÃO substitui a média no veredito.
   */
  medianCents: number | null;
  /** Máximo limpo / mínimo limpo; null sem cotação. */
  dispersionRatio: number | null;
  /** dispersionRatio > DISPERSION_LOW_CONFIDENCE_RATIO: sem selo e sem "abaixo do normal". */
  lowConfidence: boolean;
  /** Por que o selo "menor registrado" não vale para o preço atual (null = pode valer). Passe `blocked: lowBadgeBlock !== null` a `computeLowBadge`. */
  lowBadgeBlock: LowBadgeBlockReason | null;
}

type Row = Record<string, unknown>;

function toIso(v: unknown): string {
  return new Date(v as string | Date).toISOString();
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function idList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
}

function emptyStats(masterProductId: string): MasterProductPriceStats {
  return {
    masterProductId,
    currentLowestActive: null,
    lowAll: null,
    low1y: null,
    low3m: null,
    maxCents: null,
    maxRawCents: null,
    rawMinCents: null,
    floorCents: null,
    floorApplied: false,
    floorExcludedQuoteCount: 0,
    avgCents: null,
    rawAvgCents: null,
    quoteCount: 0,
    avgQuoteCount: 0,
    excludedQuoteCount: 0,
    historySince: null,
    historyUntil: null,
    historyDays: 0,
    medianCents: null,
    dispersionRatio: null,
    lowConfidence: false,
    lowBadgeBlock: null,
  };
}

/** Versão sem cache; use `getMasterProductPriceStatsBatch` nas telas. */
export async function getMasterProductPriceStatsBatchRaw(
  masterProductIds: string[],
  /** Recebe as linhas cruas de `product_stats` (colunas canônicas) da MESMA consulta; usado pelo cron para persistir sem recalcular. */
  onAggRows?: (rows: Row[]) => void
): Promise<Map<string, MasterProductPriceStats>> {
  const result = new Map<string, MasterProductPriceStats>();
  const ids = [...new Set(masterProductIds.filter(Boolean))];
  if (!ids.length) return result;
  for (const id of ids) result.set(id, emptyStats(id));

  const list = idList(ids);
  const bandLo = sql.raw(String((100 - LOW_BADGE_CORROBORATION_BAND_PERCENT) / 100));
  const bandHi = sql.raw(String((100 + LOW_BADGE_CORROBORATION_BAND_PERCENT) / 100));

  // UMA varredura dos snapshots do lote (`statsAggCtes`): piso estrito, teto só
  // nos agregados, mínimo sem vendedor fraco. O mínimo por janela nunca depende
  // da média nem do teto; empate => primeira ocorrência (menor collected_at).
  const [aggRows, currentRows, nearRows] = await Promise.all([
    db.execute<Row>(sql`
      WITH ${statsAggCtes(sql`o.master_product_id IN (${list})`, GAMES)},
      low_all AS (
        SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.collected_at
        FROM q INNER JOIN product_stats ps ON ps.master_product_id = q.master_product_id AND q.price_cents = ps.min_all
        WHERE NOT q.weak_seller
        ORDER BY q.master_product_id, q.collected_at ASC
      ),
      low_1y AS (
        SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.collected_at
        FROM q INNER JOIN product_stats ps ON ps.master_product_id = q.master_product_id AND q.price_cents = ps.min_1y
        WHERE NOT q.weak_seller AND q.collected_at >= now() - interval '365 days'
        ORDER BY q.master_product_id, q.collected_at ASC
      ),
      low_3m AS (
        SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.collected_at
        FROM q INNER JOIN product_stats ps ON ps.master_product_id = q.master_product_id AND q.price_cents = ps.min_3m
        WHERE NOT q.weak_seller AND q.collected_at >= now() - interval '90 days'
        ORDER BY q.master_product_id, q.collected_at ASC
      )
      SELECT ps.*,
             la.offer_id AS all_offer_id, la.price_cents::bigint AS all_price, la.collected_at AS all_at,
             ly.offer_id AS y_offer_id, ly.price_cents::bigint AS y_price, ly.collected_at AS y_at,
             lm.offer_id AS m_offer_id, lm.price_cents::bigint AS m_price, lm.collected_at AS m_at
      FROM product_stats ps
      LEFT JOIN low_all la ON la.master_product_id = ps.master_product_id
      LEFT JOIN low_1y ly ON ly.master_product_id = ps.master_product_id
      LEFT JOIN low_3m lm ON lm.master_product_id = ps.master_product_id
    `),

    // Preço atual: oferta pública mais barata (concorrência real), com o sinal do vendedor.
    db.execute<Row>(sql`
      WITH ${publicOffersCtes(GAMES)}
      SELECT DISTINCT ON (o.master_product_id)
        o.master_product_id, o.id AS offer_id, o.slug AS offer_slug,
        o.current_price_cents::bigint AS price_cents,
        n.name AS network_name, sel.nickname AS seller_nickname,
        sel.reputation_level AS seller_reputation_level, sel.total_sales AS seller_total_sales,
        sel.power_seller_status AS seller_power_status
      FROM affiliate_offers o
      INNER JOIN public_offers po ON po.id = o.id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE o.master_product_id IN (${list})
      -- o.id por último: empate exato de preço e de last_checked_at (comum: o coletor grava o mesmo
      -- instante em lote) escolhia a oferta conforme o plano/tamanho do lote; agora é determinístico.
      ORDER BY o.master_product_id, o.current_price_cents ASC, o.last_checked_at DESC NULLS LAST, o.id ASC
    `),

    // Corroboração do selo: vendedores distintos com oferta pública perto do preço atual.
    db.execute<Row>(sql`
      WITH ${publicOffersCtes(GAMES)}
      SELECT o.master_product_id, po.current_price_cents::bigint AS price_cents,
             COALESCE(o.seller_id::text, 'rede:' || o.network_id::text) AS seller_key
      FROM public_offers po
      INNER JOIN affiliate_offers o ON o.id = po.id
      WHERE o.master_product_id IN (${list})
        AND po.current_price_cents <= (
          SELECT MIN(p2.current_price_cents) FROM public_offers p2 WHERE p2.master_product_id = o.master_product_id
        ) * ${bandHi} / ${bandLo}
    `),
  ]);

  onAggRows?.(aggRows as unknown as Row[]);

  type LowRef = { win: 'all' | '1y' | '3m'; productId: string; offerId: string; price: number; at: string };
  const lowRefs: LowRef[] = [];
  const pfMedian = new Map<string, number | null>();

  for (const r of aggRows) {
    const id = String(r.master_product_id);
    const s = result.get(id);
    if (!s) continue;
    s.quoteCount = Number(r.quote_count);
    s.rawMinCents = numOrNull(r.raw_min);
    s.floorCents = numOrNull(r.floor_cents);
    s.floorExcludedQuoteCount = Number(r.n_all) - s.quoteCount;
    s.avgQuoteCount = Number(r.avg_quote_count);
    s.dispersionRatio = r.dispersion_ratio != null ? Math.round(Number(r.dispersion_ratio) * 100) / 100 : null;
    s.lowConfidence = s.dispersionRatio != null && s.dispersionRatio > DISPERSION_LOW_CONFIDENCE_RATIO;
    pfMedian.set(id, numOrNull(r.pf_median));
    s.excludedQuoteCount = s.quoteCount - s.avgQuoteCount;
    s.avgCents = r.avg_cents != null ? Math.round(Number(r.avg_cents)) : null;
    s.rawAvgCents = r.raw_avg_cents != null ? Math.round(Number(r.raw_avg_cents)) : null;
    s.maxCents = numOrNull(r.max_cents);
    s.maxRawCents = numOrNull(r.max_raw_cents);
    s.floorApplied = s.rawMinCents != null && s.floorCents != null && s.rawMinCents < s.floorCents;
    s.historySince = toIso(r.history_since);
    s.historyUntil = toIso(r.history_until);
    s.historyDays = Math.floor(
      (new Date(s.historyUntil).getTime() - new Date(s.historySince).getTime()) / 86_400_000
    );
    s.medianCents =
      checkEligibility({ quoteCount: s.quoteCount, historyDays: s.historyDays }).eligible && r.median_cents != null
        ? Math.round(Number(r.median_cents))
        : null;
    if (r.all_offer_id) lowRefs.push({ win: 'all', productId: id, offerId: String(r.all_offer_id), price: Number(r.all_price), at: toIso(r.all_at) });
    if (r.y_offer_id) lowRefs.push({ win: '1y', productId: id, offerId: String(r.y_offer_id), price: Number(r.y_price), at: toIso(r.y_at) });
    if (r.m_offer_id) lowRefs.push({ win: '3m', productId: id, offerId: String(r.m_offer_id), price: Number(r.m_price), at: toIso(r.m_at) });
  }

  // Loja/vendedor/status das ofertas dos mínimos (poucas linhas, busca por PK).
  if (lowRefs.length) {
    const offerIds = [...new Set(lowRefs.map((l) => l.offerId))];
    const offerRows = await db.execute<Row>(sql`
      SELECT o.id AS offer_id, o.slug AS offer_slug, o.status AS offer_status,
             n.name AS network_name, sel.nickname AS seller_nickname
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE o.id IN (${idList(offerIds)})
    `);
    const offerById = new Map(offerRows.map((o) => [String(o.offer_id), o]));
    for (const l of lowRefs) {
      const o = offerById.get(l.offerId);
      const s = result.get(l.productId);
      if (!o || !s) continue;
      const low: PriceLow = {
        priceCents: l.price,
        at: l.at,
        offerId: l.offerId,
        offerSlug: String(o.offer_slug),
        networkName: String(o.network_name),
        sellerNickname: (o.seller_nickname as string | null) ?? null,
        offerActive: o.offer_status === 'active',
        offerStatus: String(o.offer_status),
      };
      if (l.win === 'all') s.lowAll = low;
      else if (l.win === '1y') s.low1y = low;
      else s.low3m = low;
    }
  }

  for (const r of currentRows) {
    const s = result.get(String(r.master_product_id));
    if (!s) continue;
    const seller = {
      reputationLevel: (r.seller_reputation_level as string | null) ?? null,
      totalSales: r.seller_total_sales != null ? Number(r.seller_total_sales) : null,
      powerSellerStatus: (r.seller_power_status as string | null) ?? null,
    };
    s.currentLowestActive = {
      offerId: String(r.offer_id),
      offerSlug: String(r.offer_slug),
      priceCents: Number(r.price_cents),
      networkName: String(r.network_name),
      sellerNickname: (r.seller_nickname as string | null) ?? null,
      sellerTier: sellerTier(seller),
      sellerReputationLevel: seller.reputationLevel,
      sellerTotalSales: seller.totalSales,
    };
  }

  // Vendedores distintos perto do preço atual (inclui o próprio) => corroboração do selo.
  const nearByProduct = new Map<string, Array<{ price: number; key: string }>>();
  for (const r of nearRows) {
    const id = String(r.master_product_id);
    const arr = nearByProduct.get(id) ?? [];
    arr.push({ price: Number(r.price_cents), key: String(r.seller_key) });
    nearByProduct.set(id, arr);
  }

  const nowIso = new Date().toISOString();
  for (const s of result.values()) {
    const cur = s.currentLowestActive;
    if (!cur) continue;
    // F-14: o menor preço INCLUI a oferta pública atual. "Menor já visto" nunca
    // fica acima do preço de hoje. (O histórico bruto continua intocado.)
    const asLow = (): PriceLow => ({
      priceCents: cur.priceCents,
      at: nowIso,
      offerId: cur.offerId,
      offerSlug: cur.offerSlug,
      networkName: cur.networkName,
      sellerNickname: cur.sellerNickname,
      offerActive: true,
      offerStatus: 'active',
    });
    if (!s.lowAll || cur.priceCents < s.lowAll.priceCents) s.lowAll = asLow();
    if (!s.low1y || cur.priceCents < s.low1y.priceCents) s.low1y = asLow();
    if (!s.low3m || cur.priceCents < s.low3m.priceCents) s.low3m = asLow();

    const lo = cur.priceCents * ((100 - LOW_BADGE_CORROBORATION_BAND_PERCENT) / 100);
    const hi = cur.priceCents * ((100 + LOW_BADGE_CORROBORATION_BAND_PERCENT) / 100);
    const sellers = new Set(
      (nearByProduct.get(s.masterProductId) ?? []).filter((o) => o.price >= lo && o.price <= hi).map((o) => o.key)
    );
    s.lowBadgeBlock = lowBadgeBlockReason({
      currentCents: cur.priceCents,
      medianCents: pfMedian.get(s.masterProductId) ?? null,
      lowConfidence: s.lowConfidence,
      sellerTier: cur.sellerTier,
      corroboratingSellers: sellers.size,
    });
  }

  return result;
}

/**
 * Cache POR PRODUTO (SWR): a estatística de um produto não depende de quais outros
 * vieram no lote, então o resultado é idêntico ao do lote inteiro. Antes a chave era
 * a lista de ids: cada filtro/página recalculava tudo (300 produtos = ~25 s no banco).
 * Agora: produto já calculado é servido na hora; vencido é recalculado por trás em
 * lotes pequenos (single-flight, no máximo 3 consultas pesadas simultâneas no processo).
 */
// Medido em 2026-11-02: ~90 ms de banco por produto popular (~4,6 mil cotações cada); recalcular
// 600 produtos a cada 2 min seria carga contínua. É histórico agregado (média/mínimo/mediana de
// milhares de cotações), que não muda de verdade em 10 min; o preço ATUAL vem das linhas de
// oferta (60 s) e da própria oferta, ao vivo.
const STATS_FRESH_MS = 600_000;
const STATS_MAX_STALE_MS = 6 * 3600_000;

async function fetchStatsChunk(ids: string[]): Promise<Record<string, MasterProductPriceStats>> {
  return Object.fromEntries(await getMasterProductPriceStatsBatchRaw(ids));
}

/**
 * Idade máxima do pré-cálculo persistido (`product_price_stats`, escrito pelo cron a cada ~15 min) que as
 * telas aceitam. Passou disso (cron parado), a tela volta ao cálculo ao vivo abaixo.
 */
export const STATS_PERSIST_MAX_AGE_MS = 3 * 3600_000;

/** Linhas do pré-cálculo com idade <= STATS_PERSIST_MAX_AGE_MS (cláusula SQL da tabela `product_price_stats`, alias `ps`). */
export const STATS_PERSIST_FRESH_SQL = sql`ps.computed_at > now() - (${sql.raw(String(Math.round(STATS_PERSIST_MAX_AGE_MS / 1000)))} * interval '1 second')`;

const readyMemo = (globalThis as unknown as { __egeekStatsReady?: { at: number; ok: boolean } });

/**
 * O pré-cálculo está utilizável? (>= 80 % das linhas dentro da idade máxima, e pelo menos uma). Só então a
 * tabela de preços lê as estatísticas de `product_price_stats` em vez de varrer ~3 M de cotações. Não
 * pronto (migration não aplicada, cron parado) => comportamento anterior, sem nenhum valor inventado.
 * `PRICE_STATS_LIVE=1` força o cálculo ao vivo (comparação de equivalência). Memo de 30 s por processo.
 */
export async function statsSnapshotReady(): Promise<boolean> {
  if (process.env.PRICE_STATS_LIVE === '1') return false;
  const memo = readyMemo.__egeekStatsReady;
  if (memo && Date.now() - memo.at < 30_000) return memo.ok;
  let ok = false;
  try {
    const rows = await withTimeout(
      db.execute<{ fresh: number; total: number }>(sql`
        SELECT COUNT(*) FILTER (WHERE ${STATS_PERSIST_FRESH_SQL})::int AS fresh, COUNT(*)::int AS total FROM product_price_stats ps
      `),
      4_000,
      'product_price_stats pronto?'
    );
    const fresh = Number(rows[0]?.fresh ?? 0);
    const total = Number(rows[0]?.total ?? 0);
    ok = fresh > 0 && fresh >= total * 0.8;
  } catch {
    ok = false;
  }
  readyMemo.__egeekStatsReady = { at: Date.now(), ok };
  return ok;
}

/**
 * Lê as estatísticas já calculadas pelo cron (FONTE ÚNICA: o payload é o resultado de
 * `getMasterProductPriceStatsBatchRaw`, byte a byte o que a tela calcularia). Produto ausente/velho,
 * tabela inexistente ou leitura lenta => fica fora do Map e o chamador calcula ao vivo.
 */
export async function readPersistedStats(ids: string[]): Promise<Map<string, MasterProductPriceStats>> {
  const out = new Map<string, MasterProductPriceStats>();
  if (!ids.length) return out;
  try {
    const rows = await withTimeout(
      db.execute<{ master_product_id: string; payload: MasterProductPriceStats }>(sql`
        SELECT master_product_id, payload FROM product_price_stats
        WHERE master_product_id IN (${idList(ids)})
          AND computed_at > now() - (${Math.round(STATS_PERSIST_MAX_AGE_MS / 1000)} * interval '1 second')
      `),
      6_000,
      'product_price_stats'
    );
    for (const r of rows) out.set(String(r.master_product_id), r.payload);
  } catch (err) {
    console.error('[stats] leitura do pré-cálculo falhou (calcula ao vivo):', err instanceof Error ? err.message : err);
  }
  return out;
}

/**
 * Em lote: primeiro o pré-cálculo persistido (1 consulta por PK); só o que faltar (produto novo, cron parado)
 * cai no cache SWR por produto (fresco 10 min; vencido é servido e recalculado por trás).
 */
export async function getMasterProductPriceStatsBatch(
  masterProductIds: string[],
  opts: { coldTimeoutMs?: number; direct?: boolean; partialOnTimeout?: boolean } = {}
): Promise<Map<string, MasterProductPriceStats>> {
  const ids = [...new Set(masterProductIds.filter(Boolean))].sort();
  if (!ids.length) return new Map();
  const persisted = await readPersistedStats(ids);
  const missing = ids.filter((id) => !persisted.has(id));
  if (!missing.length) return persisted;
  const rec = await swrBatch('mp-price-stats-v1', missing, fetchStatsChunk, { ttlMs: STATS_FRESH_MS, maxStaleMs: STATS_MAX_STALE_MS, chunkSize: 30, coldTimeoutMs: opts.coldTimeoutMs, direct: opts.direct, partialOnTimeout: opts.partialOnTimeout });
  for (const [id, v] of Object.entries(rec)) persisted.set(id, v);
  return persisted;
}

/** Um produto. Produto sem nenhuma cotação devolve estatística vazia (quoteCount 0), nunca valores inventados. */
export async function getMasterProductPriceStats(
  masterProductId: string,
  opts: { coldTimeoutMs?: number; direct?: boolean } = {}
): Promise<MasterProductPriceStats> {
  const map = await getMasterProductPriceStatsBatch([masterProductId], opts);
  return map.get(masterProductId) ?? emptyStats(masterProductId);
}

import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { publicOffersCtes } from '@/server/queries/public-offers';
import {
  MIN_HISTORY_DAYS_FOR_VERDICT,
  MIN_QUOTES_FOR_VERDICT,
  PLAUSIBILITY_FLOOR_PERCENT,
  PLAUSIBILITY_MIN_OFFERS,
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
export function priceQuotesCtes(scope: SQL): SQL {
  const pct = sql.raw(String(PLAUSIBILITY_FLOOR_PERCENT / 100));
  const minN = sql.raw(String(Math.trunc(PLAUSIBILITY_MIN_OFFERS)));
  return sql`
    q_all AS MATERIALIZED (
      SELECT o.master_product_id, o.id AS offer_id, s.price_cents, s.collected_at
      FROM affiliate_offers o
      INNER JOIN affiliate_price_snapshots s ON s.offer_id = o.id
      WHERE (${scope}) AND s.price_cents > 0
    ),
    pfloor AS (
      SELECT master_product_id,
             COUNT(*)::int AS n_all,
             MIN(price_cents) AS raw_min,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) AS median_cents,
             CASE WHEN COUNT(*) >= ${minN}
                  THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) * ${pct} END AS floor_cents
      FROM q_all GROUP BY master_product_id
    ),
    q AS (
      SELECT a.master_product_id, a.offer_id, a.price_cents, a.collected_at
      FROM q_all a INNER JOIN pfloor f ON f.master_product_id = a.master_product_id
      WHERE f.floor_cents IS NULL OR a.price_cents >= f.floor_cents
    )
  `;
}

/**
 * "Menor preço já visto" da home: menor cotação plausível (piso aplicado) entre
 * os produtos com histórico elegível (>= 5 cotações e >= 14 dias). 0 se nenhum.
 */
export async function getPlatformLowestPriceCentsEver(): Promise<number> {
  const rows = await db.execute<Row>(sql`
    WITH ${priceQuotesCtes(sql`TRUE`)},
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
  };
}

/** Versão sem cache; use `getMasterProductPriceStatsBatch` nas telas. */
export async function getMasterProductPriceStatsBatchRaw(
  masterProductIds: string[]
): Promise<Map<string, MasterProductPriceStats>> {
  const result = new Map<string, MasterProductPriceStats>();
  const ids = [...new Set(masterProductIds.filter(Boolean))];
  if (!ids.length) return result;
  for (const id of ids) result.set(id, emptyStats(id));

  const list = idList(ids);

  // UMA varredura dos snapshots do lote: `q_all` é materializada, recebe o piso
  // de plausibilidade (`priceQuotesCtes`) e alimenta agregados, média filtrada e
  // as três janelas de mínimo. Resultado idêntico ao anterior
  // (conferido produto a produto em 2026-10-31).
  const [aggRows, currentRows] = await Promise.all([
    db.execute<Row>(sql`
      WITH ${priceQuotesCtes(sql`o.master_product_id IN (${list})`)},
      raw AS (
        SELECT master_product_id,
               AVG(price_cents) AS raw_avg,
               COUNT(*)::int AS quote_count,
               MAX(price_cents)::bigint AS max_raw_cents,
               MIN(collected_at) AS history_since,
               MAX(collected_at) AS history_until,
               MIN(price_cents) AS min_all,
               MIN(price_cents) FILTER (WHERE collected_at >= now() - interval '365 days') AS min_1y,
               MIN(price_cents) FILTER (WHERE collected_at >= now() - interval '90 days') AS min_3m
        FROM q GROUP BY master_product_id
      ),
      agg AS (
        SELECT q.master_product_id,
               COUNT(*) FILTER (WHERE q.price_cents <= raw.raw_avg * 2)::int AS avg_quote_count,
               AVG(q.price_cents) FILTER (WHERE q.price_cents <= raw.raw_avg * 2)::numeric AS avg_cents,
               MAX(q.price_cents) FILTER (WHERE q.price_cents <= raw.raw_avg * 2)::bigint AS max_cents
        FROM q INNER JOIN raw ON raw.master_product_id = q.master_product_id
        GROUP BY q.master_product_id
      ),
      -- Cotação mais barata por janela; empate => primeira ocorrência (menor collected_at).
      low_all AS (
        SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.collected_at
        FROM q INNER JOIN raw ON raw.master_product_id = q.master_product_id AND q.price_cents = raw.min_all
        ORDER BY q.master_product_id, q.collected_at ASC
      ),
      low_1y AS (
        SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.collected_at
        FROM q INNER JOIN raw ON raw.master_product_id = q.master_product_id AND q.price_cents = raw.min_1y
        WHERE q.collected_at >= now() - interval '365 days'
        ORDER BY q.master_product_id, q.collected_at ASC
      ),
      low_3m AS (
        SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.collected_at
        FROM q INNER JOIN raw ON raw.master_product_id = q.master_product_id AND q.price_cents = raw.min_3m
        WHERE q.collected_at >= now() - interval '90 days'
        ORDER BY q.master_product_id, q.collected_at ASC
      )
      SELECT raw.master_product_id, raw.quote_count, agg.avg_quote_count, agg.avg_cents,
             pf.n_all, pf.raw_min, pf.floor_cents,
             raw.raw_avg::numeric AS raw_avg_cents, agg.max_cents, raw.max_raw_cents,
             raw.history_since, raw.history_until,
             la.offer_id AS all_offer_id, la.price_cents::bigint AS all_price, la.collected_at AS all_at,
             ly.offer_id AS y_offer_id, ly.price_cents::bigint AS y_price, ly.collected_at AS y_at,
             lm.offer_id AS m_offer_id, lm.price_cents::bigint AS m_price, lm.collected_at AS m_at
      FROM raw
      INNER JOIN agg ON agg.master_product_id = raw.master_product_id
      INNER JOIN pfloor pf ON pf.master_product_id = raw.master_product_id
      LEFT JOIN low_all la ON la.master_product_id = raw.master_product_id
      LEFT JOIN low_1y ly ON ly.master_product_id = raw.master_product_id
      LEFT JOIN low_3m lm ON lm.master_product_id = raw.master_product_id
    `),

    // 3) Preço atual: oferta ativa mais barata (concorrência real).
    db.execute<Row>(sql`
      WITH ${publicOffersCtes()}
      SELECT DISTINCT ON (o.master_product_id)
        o.master_product_id, o.id AS offer_id, o.slug AS offer_slug,
        o.current_price_cents::bigint AS price_cents,
        n.name AS network_name, sel.nickname AS seller_nickname
      FROM affiliate_offers o
      INNER JOIN public_offers po ON po.id = o.id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE o.master_product_id IN (${list})
      ORDER BY o.master_product_id, o.current_price_cents ASC, o.last_checked_at DESC NULLS LAST
    `),
  ]);

  type LowRef = { win: 'all' | '1y' | '3m'; productId: string; offerId: string; price: number; at: string };
  const lowRefs: LowRef[] = [];

  for (const r of aggRows) {
    const id = String(r.master_product_id);
    const s = result.get(id);
    if (!s) continue;
    s.quoteCount = Number(r.quote_count);
    s.rawMinCents = numOrNull(r.raw_min);
    s.floorCents = numOrNull(r.floor_cents);
    s.floorExcludedQuoteCount = Number(r.n_all) - s.quoteCount;
    s.avgQuoteCount = Number(r.avg_quote_count);
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
    s.currentLowestActive = {
      offerId: String(r.offer_id),
      offerSlug: String(r.offer_slug),
      priceCents: Number(r.price_cents),
      networkName: String(r.network_name),
      sellerNickname: (r.seller_nickname as string | null) ?? null,
    };
  }

  return result;
}

const getStatsBatchCachedAsRecord = createCachedQuery(
  async (ids: string[]): Promise<Record<string, MasterProductPriceStats>> => {
    const map = await getMasterProductPriceStatsBatchRaw(ids);
    return Object.fromEntries(map);
  },
  ['master-product-price-stats'],
  { revalidate: 60, tags: ['affiliate-offers', 'price-snapshots'] }
);

/** Em lote, com cache de 60s (mesmas tags de getOfferListingMetrics). */
export async function getMasterProductPriceStatsBatch(
  masterProductIds: string[]
): Promise<Map<string, MasterProductPriceStats>> {
  const ids = [...new Set(masterProductIds.filter(Boolean))].sort();
  if (!ids.length) return new Map();
  return new Map(Object.entries(await getStatsBatchCachedAsRecord(ids)));
}

/** Um produto. Produto sem nenhuma cotação devolve estatística vazia (quoteCount 0), nunca valores inventados. */
export async function getMasterProductPriceStats(masterProductId: string): Promise<MasterProductPriceStats> {
  const map = await getMasterProductPriceStatsBatch([masterProductId]);
  return map.get(masterProductId) ?? emptyStats(masterProductId);
}

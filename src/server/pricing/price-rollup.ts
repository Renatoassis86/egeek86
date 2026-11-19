import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { verticalSql, GAMES, type Vertical } from '@/lib/catalog/verticais';
import { weakSellerSql, catalogGateVisibleSql, avgExcludedFlagSql } from '@/server/queries/public-offers';
import { offerExcludedTitleSql } from '@/lib/affiliate/offer-identity-sql';
import { AGGREGATE_CEILING_MEDIAN_MULTIPLE, PLAUSIBILITY_FLOOR_PERCENT, PLAUSIBILITY_MIN_OFFERS } from '@/lib/affiliate/price-verdict';
import { snapshotNaoIscaSql } from '@/server/pricing/preco-isca-sql';
import { gatilhoIscaLigado } from '@/lib/pricing/preco-isca';

/**
 * RESUMO INCREMENTAL DE COTACOES (migration 0068; dono 2026-11-19). `product_price_rollup` guarda, por (oferta, preco), a contagem de
 * cotacoes e a primeira/ultima data. As estatisticas por produto (`product_price_stats`) saem desse resumo com a MESMA formula do
 * calculo completo (`statsAggCtes`), sem varrer as cotacoes: so as cotacoes NOVAS sao lidas a cada ciclo. Prova: scripts/test-rollup-equivalencia.ts.
 *
 * Desenho:
 *  - Flags por oferta (vendedor fraco, avg_excluded, quarentena/identidade) e do produto (catalogGate) sao aplicadas AO VIVO sobre o
 *    resumo; nao ficam gravadas. Por isso mudar flag nao exige reconstruir nada.
 *  - Janela incremental por ID de cotacao (a tabela e append-only): le `id > marca d'agua`, ate `max(id) - LAG_IDS` (cotacao ainda em
 *    transacao nao e perdida). Oferta construida depois entra com `base_id` proprio (so le id > base_id): nunca conta duas vezes.
 *  - Deriva possivel (cotacao commitada fora de ordem, marca de isca criada/liberada depois): oferta reconstruida do zero quando a marca de
 *    isca muda (`marcado_em/liberado_em > built_at`) e, por rede de seguranca, a cada REBUILD_AFTER_HOURS (as mais antigas, em lotes).
 *  - Filtro de isca ligado/desligado diferente do que fez o resumo => resumo inutilizavel (cai no calculo completo).
 *  - Cotacao nunca e apagada; as 3 tabelas sao derivadas e podem ser reconstruidas a qualquer hora.
 * Flag: `PRICE_STATS_ROLLUP=on` liga (padrao desligado ate a equivalencia ser provada); sem ela vale o calculo completo (statsAggCtes).
 */

/** Folga em ids de cotação (cotação ainda em transação não é perdida). `PRICE_ROLLUP_LAG_IDS` só para teste. */
export const rollupLagIds = () => Math.max(0, Number(process.env.PRICE_ROLLUP_LAG_IDS ?? 300) || 0);
export const ROLLUP_REBUILD_AFTER_HOURS = 72;
const LOCK_KEY = 86068;

export function rollupFlagOn(): boolean {
  // PADRAO DESLIGADO ate a prova de equivalencia (scripts/test-rollup-equivalencia.ts) passar com >= 200 produtos.
  return /^(1|on|true)$/i.test((process.env.PRICE_STATS_ROLLUP ?? '').trim());
}

type Row = Record<string, unknown>;
const uuidList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** O resumo existe e foi feito com o mesmo filtro de isca de hoje? (false => cai no calculo completo). */
export async function rollupUsable(): Promise<boolean> {
  try {
    const rows = await db.execute<Row>(sql`SELECT isca_on FROM product_price_rollup_meta WHERE id = 1`);
    return rows.length > 0 && rows[0].isca_on === gatilhoIscaLigado();
  } catch {
    return false;
  }
}

/** Constroi (ou reconstroi do zero) o resumo das ofertas dadas, em uma transacao. Le so as cotacoes dessas ofertas. */
export async function buildRollupOffers(offerIds: string[]): Promise<number> {
  const ids = [...new Set(offerIds)];
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const list = uuidList(part);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
      const h = await tx.execute<Row>(sql`SELECT GREATEST(COALESCE(max(id), 0) - ${rollupLagIds()}, 0)::bigint AS h FROM affiliate_price_snapshots`);
      const hi = String(h[0].h);
      await tx.execute(sql`DELETE FROM product_price_rollup WHERE offer_id IN (${list})`);
      await tx.execute(sql`
        INSERT INTO product_price_rollup (offer_id, price_cents, n, first_at, last_at)
        SELECT s.offer_id, s.price_cents, COUNT(*)::int, MIN(s.collected_at), MAX(s.collected_at)
        FROM affiliate_price_snapshots s
        WHERE s.offer_id IN (${list}) AND s.id <= ${hi}::bigint AND s.price_cents > 0 AND ${snapshotNaoIscaSql('s')}
        GROUP BY s.offer_id, s.price_cents
      `);
      await tx.execute(sql`
        INSERT INTO product_price_rollup_state (offer_id, base_id, built_at)
        SELECT x.id, ${hi}::bigint, now() FROM (SELECT unnest(ARRAY[${list}]) AS id) x
        ON CONFLICT (offer_id) DO UPDATE SET base_id = EXCLUDED.base_id, built_at = EXCLUDED.built_at
      `);
      await tx.execute(sql`
        INSERT INTO product_price_rollup_meta (id, last_id, isca_on) VALUES (1, ${hi}::bigint, ${gatilhoIscaLigado()})
        ON CONFLICT (id) DO NOTHING
      `);
    });
    done += part.length;
  }
  return done;
}

export interface IngestSummary {
  ok: boolean;
  reason?: string;
  fromId: number;
  toId: number;
  touchedOffers: string[];
}

/** Soma ao resumo as cotacoes novas (id > marca d'agua) das ofertas que ja tem resumo. Devolve as ofertas tocadas. */
export async function ingestRollupWindow(): Promise<IngestSummary> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    const meta = await tx.execute<Row>(sql`SELECT last_id::bigint AS last_id, isca_on FROM product_price_rollup_meta WHERE id = 1`);
    if (!meta.length) return { ok: false, reason: 'sem resumo construido', fromId: 0, toId: 0, touchedOffers: [] };
    if (meta[0].isca_on !== gatilhoIscaLigado()) return { ok: false, reason: 'filtro de isca mudou desde a construcao', fromId: 0, toId: 0, touchedOffers: [] };
    const last = String(meta[0].last_id);
    const h = await tx.execute<Row>(sql`SELECT (COALESCE(max(id), 0) - ${rollupLagIds()})::bigint AS h FROM affiliate_price_snapshots`);
    const hi = String(h[0].h);
    if (BigInt(hi) <= BigInt(last)) return { ok: true, fromId: Number(last), toId: Number(last), touchedOffers: [] };
    const touched = await tx.execute<Row>(sql`
      WITH win AS (
        SELECT s.offer_id, s.price_cents, COUNT(*)::int AS n, MIN(s.collected_at) AS f, MAX(s.collected_at) AS l
        FROM affiliate_price_snapshots s
        INNER JOIN product_price_rollup_state st ON st.offer_id = s.offer_id
        WHERE s.id > ${last}::bigint AND s.id <= ${hi}::bigint AND s.id > st.base_id
          AND s.price_cents > 0 AND ${snapshotNaoIscaSql('s')}
        GROUP BY s.offer_id, s.price_cents
      )
      INSERT INTO product_price_rollup AS r (offer_id, price_cents, n, first_at, last_at)
      SELECT offer_id, price_cents, n, f, l FROM win
      ON CONFLICT (offer_id, price_cents) DO UPDATE
        SET n = r.n + EXCLUDED.n, first_at = LEAST(r.first_at, EXCLUDED.first_at), last_at = GREATEST(r.last_at, EXCLUDED.last_at)
      RETURNING r.offer_id
    `);
    await tx.execute(sql`UPDATE product_price_rollup_meta SET last_id = ${hi}::bigint, updated_at = now() WHERE id = 1`);
    return { ok: true, fromId: Number(last), toId: Number(hi), touchedOffers: [...new Set(touched.map((t) => String(t.offer_id)))] };
  });
}

/** Ofertas (Games, com produto) ainda sem resumo. `productIds` limita a esses produtos. */
export async function offersWithoutRollup(opts: { productIds?: string[]; limit?: number } = {}): Promise<string[]> {
  const scope = opts.productIds?.length ? sql`AND o.master_product_id IN (${uuidList(opts.productIds)})` : sql``;
  const rows = await db.execute<Row>(sql`
    SELECT o.id FROM affiliate_offers o
    WHERE o.master_product_id IS NOT NULL AND ${verticalSql('o', GAMES)} ${scope}
      AND NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = o.id)
    LIMIT ${opts.limit ?? 5000}
  `);
  return rows.map((r) => String(r.id));
}

/** Ofertas a reconstruir: marca de isca mudou depois da construcao; depois as ATIVAS com resumo mais velho que a rede de seguranca. */
export async function offersToRebuild(limit: number): Promise<string[]> {
  const iscaRows = await db.execute<Row>(sql`
    SELECT DISTINCT st.offer_id FROM preco_isca_marcas pm
    INNER JOIN product_price_rollup_state st ON st.offer_id = pm.offer_id
    WHERE pm.marcado_em > st.built_at OR pm.liberado_em > st.built_at
    LIMIT ${limit}
  `);
  const out = iscaRows.map((r) => String(r.offer_id));
  if (out.length >= limit) return out;
  const old = await db.execute<Row>(sql`
    SELECT st.offer_id FROM product_price_rollup_state st
    INNER JOIN affiliate_offers o ON o.id = st.offer_id
    WHERE o.status = 'active' AND st.built_at < now() - (${ROLLUP_REBUILD_AFTER_HOURS} * interval '1 hour')
    ORDER BY st.built_at ASC
    LIMIT ${limit - out.length}
  `);
  for (const r of old) out.push(String(r.offer_id));
  return [...new Set(out)];
}

/** Produtos (de `ids`) com alguma oferta sem resumo: nao podem usar o caminho do resumo. */
export async function productsWithUnbuiltOffers(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.execute<Row>(sql`
    SELECT DISTINCT o.master_product_id AS id FROM affiliate_offers o
    WHERE o.master_product_id IN (${uuidList(ids)}) AND ${verticalSql('o', GAMES)}
      AND NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = o.id)
  `);
  return new Set(rows.map((r) => String(r.id)));
}

/** Mediana ponderada (mesma definicao de percentile_cont(0.5)): `src` = CTE (master_product_id, price_cents, c) com c = quantidade. Resultado `name`(master_product_id, med float8). */
function weightedMedianCtes(name: string, src: string): SQL {
  const n = sql.raw(name);
  const s = sql.raw(src);
  return sql`
    ${n}_c AS (
      SELECT master_product_id, price_cents, c,
             SUM(c) OVER (PARTITION BY master_product_id ORDER BY price_cents)::bigint AS ce,
             SUM(c) OVER (PARTITION BY master_product_id)::bigint AS tot
      FROM ${s} WHERE c > 0
    ),
    ${n} AS (
      SELECT master_product_id,
             (MIN(price_cents) FILTER (WHERE ce - c <= (tot - 1) / 2 AND ce > (tot - 1) / 2)::float8
              + MIN(price_cents) FILTER (WHERE ce - c <= tot / 2 AND ce > tot / 2)::float8) / 2 AS med
      FROM ${n}_c GROUP BY master_product_id
    )`;
}

/** Idem a `offerIdentityVisibleSql`, mas correlacionada por oferta (nao varre as ~58 mil ofertas a cada consulta). Mesma regra; a equivalencia e provada no teste. */
function offerIdentityVisibleCorrelatedSql(o: string): SQL {
  const a = sql.raw(o.replace(/[^a-z0-9_]/gi, ''));
  return sql`NOT EXISTS (
    SELECT 1 FROM affiliate_offers xo INNER JOIN master_products xm ON xm.id = xo.master_product_id
    CROSS JOIN LATERAL (SELECT lower(xo.title) AS lt) xl
    WHERE xo.id = ${a}.id AND ((${offerExcludedTitleSql('xl.lt', 'xm.product_type', 'xm.game_format')}) OR xo.quarantined_at IS NOT NULL))`;
}

/**
 * Equivalente de `statsAggCtes` + CTEs `low_all/low_1y/low_3m` de `getMasterProductPriceStatsBatchRaw`, lendo o resumo.
 * Termina nas CTEs `product_stats`, `low_all`, `low_1y`, `low_3m` (mesmas colunas). `scope` = condicao sobre `o` (affiliate_offers).
 */
export function rollupStatsCtes(scope: SQL, vertical: Vertical): SQL {
  const pct = sql.raw(String(PLAUSIBILITY_FLOOR_PERCENT / 100));
  const minN = sql.raw(String(Math.trunc(PLAUSIBILITY_MIN_OFFERS)));
  const mult = sql.raw(String(AGGREGATE_CEILING_MEDIAN_MULTIPLE));
  const clean = sql`(q.price_cents <= raw.raw_avg * 2 AND (pf.floor_cents IS NULL OR q.price_cents <= pf.median_cents * ${mult}))`;
  const y = sql`now() - interval '365 days'`;
  const m = sql`now() - interval '90 days'`;
  return sql`
    rr AS MATERIALIZED (
      SELECT o.master_product_id, r.offer_id, r.price_cents, r.n, r.first_at, r.last_at,
             ${weakSellerSql('sel')} AS weak_seller, ${avgExcludedFlagSql('o')} AS avg_excluded
      FROM affiliate_offers o
      INNER JOIN product_price_rollup r ON r.offer_id = o.id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE (${scope}) AND ${verticalSql('o', vertical)}
        AND ${catalogGateVisibleSql('o.master_product_id')}
        AND ${offerIdentityVisibleCorrelatedSql('o')}
    ),
    pfa AS (
      SELECT master_product_id,
             COALESCE(SUM(n) FILTER (WHERE NOT avg_excluded), 0)::int AS n_all,
             MIN(price_cents) AS raw_min
      FROM rr GROUP BY master_product_id
    ),
    pp_all AS (
      SELECT master_product_id, price_cents, SUM(n) AS c FROM rr WHERE NOT avg_excluded GROUP BY master_product_id, price_cents
    ),
    ${weightedMedianCtes('pf_med', 'pp_all')},
    pfloor AS (
      SELECT a.master_product_id, a.n_all, a.raw_min, md.med AS median_cents,
             CASE WHEN a.n_all >= ${minN} THEN md.med * ${pct} END AS floor_cents
      FROM pfa a LEFT JOIN pf_med md ON md.master_product_id = a.master_product_id
    ),
    qq AS (
      SELECT a.master_product_id, a.offer_id, a.price_cents, a.n, a.first_at, a.last_at, a.weak_seller, a.avg_excluded
      FROM rr a INNER JOIN pfloor f ON f.master_product_id = a.master_product_id
      WHERE f.floor_cents IS NULL OR a.price_cents > f.floor_cents
    ),
    raw AS (
      SELECT master_product_id,
             SUM(price_cents * n::bigint) FILTER (WHERE NOT avg_excluded)::numeric / NULLIF(SUM(n) FILTER (WHERE NOT avg_excluded), 0) AS raw_avg,
             SUM(n)::int AS quote_count,
             MAX(price_cents)::bigint AS max_raw_cents,
             MIN(first_at) AS history_since,
             MAX(last_at) AS history_until,
             MIN(price_cents) FILTER (WHERE NOT weak_seller) AS min_all,
             MIN(price_cents) FILTER (WHERE NOT weak_seller AND last_at >= ${y}) AS min_1y,
             MIN(price_cents) FILTER (WHERE NOT weak_seller AND last_at >= ${m}) AS min_3m
      FROM qq GROUP BY master_product_id
    ),
    cq AS (
      SELECT q.master_product_id, q.price_cents, q.n
      FROM qq q
      INNER JOIN raw ON raw.master_product_id = q.master_product_id
      INNER JOIN pfloor pf ON pf.master_product_id = q.master_product_id
      WHERE ${clean} AND NOT q.avg_excluded
    ),
    pp_clean AS (
      SELECT master_product_id, price_cents, SUM(n) AS c FROM cq GROUP BY master_product_id, price_cents
    ),
    ${weightedMedianCtes('cl_med', 'pp_clean')},
    agg AS (
      SELECT master_product_id,
             SUM(n)::int AS avg_quote_count,
             SUM(price_cents * n::bigint)::numeric / SUM(n) AS avg_cents,
             MAX(price_cents)::bigint AS max_cents,
             MIN(price_cents)::bigint AS clean_min_cents
      FROM cq GROUP BY master_product_id
    ),
    product_stats AS (
      SELECT raw.master_product_id, raw.quote_count, COALESCE(agg.avg_quote_count, 0) AS avg_quote_count, agg.avg_cents,
             raw.raw_avg::numeric AS raw_avg_cents, agg.max_cents, raw.max_raw_cents,
             raw.history_since, raw.history_until,
             FLOOR(EXTRACT(EPOCH FROM (raw.history_until - raw.history_since)) / 86400)::int AS history_days,
             raw.min_all, raw.min_1y, raw.min_3m,
             cm.med AS median_cents,
             CASE WHEN agg.clean_min_cents > 0 THEN agg.max_cents::numeric / agg.clean_min_cents END AS dispersion_ratio,
             pf.n_all, pf.raw_min, pf.floor_cents,
             CASE WHEN pf.floor_cents IS NOT NULL THEN pf.median_cents END AS pf_median
      FROM raw
      INNER JOIN pfloor pf ON pf.master_product_id = raw.master_product_id
      LEFT JOIN agg ON agg.master_product_id = raw.master_product_id
      LEFT JOIN cl_med cm ON cm.master_product_id = raw.master_product_id
    ),
    low_all AS (
      SELECT DISTINCT ON (q.master_product_id) q.master_product_id, q.offer_id, q.price_cents, q.first_at AS collected_at
      FROM qq q INNER JOIN product_stats ps ON ps.master_product_id = q.master_product_id AND q.price_cents = ps.min_all
      WHERE NOT q.weak_seller
      ORDER BY q.master_product_id, q.first_at ASC, q.offer_id
    ),
    l_1y AS (
      SELECT q.master_product_id, q.offer_id, q.price_cents,
             CASE WHEN q.first_at >= ${y} THEN q.first_at
                  ELSE (SELECT MIN(s.collected_at) FROM affiliate_price_snapshots s
                        WHERE s.offer_id = q.offer_id AND s.price_cents = q.price_cents AND s.collected_at >= ${y} AND ${snapshotNaoIscaSql('s')}) END AS collected_at
      FROM qq q INNER JOIN product_stats ps ON ps.master_product_id = q.master_product_id AND q.price_cents = ps.min_1y
      WHERE NOT q.weak_seller AND q.last_at >= ${y}
    ),
    low_1y AS (
      SELECT DISTINCT ON (master_product_id) master_product_id, offer_id, price_cents, collected_at
      FROM l_1y ORDER BY master_product_id, collected_at ASC, offer_id
    ),
    l_3m AS (
      SELECT q.master_product_id, q.offer_id, q.price_cents,
             CASE WHEN q.first_at >= ${m} THEN q.first_at
                  ELSE (SELECT MIN(s.collected_at) FROM affiliate_price_snapshots s
                        WHERE s.offer_id = q.offer_id AND s.price_cents = q.price_cents AND s.collected_at >= ${m} AND ${snapshotNaoIscaSql('s')}) END AS collected_at
      FROM qq q INNER JOIN product_stats ps ON ps.master_product_id = q.master_product_id AND q.price_cents = ps.min_3m
      WHERE NOT q.weak_seller AND q.last_at >= ${m}
    ),
    low_3m AS (
      SELECT DISTINCT ON (master_product_id) master_product_id, offer_id, price_cents, collected_at
      FROM l_3m ORDER BY master_product_id, collected_at ASC, offer_id
    )
  `;
}

/**
 * CARGA INICIAL (uma vez; idempotente): varre `affiliate_price_snapshots` por FAIXAS DE ID (leitura sequencial, uma passada na tabela) e
 * soma ao resumo as ofertas Games ainda sem resumo. O estado (`base_id`) só nasce no fim, sob o lock, depois de um ajuste final até a
 * marca d'água atual: nenhuma cotação é contada duas vezes nem perdida. Faixas pequenas e pausas: o banco de produção é pequeno.
 */
export async function backfillRollup(opts: { rangeIds?: number; pauseMs?: number; log?: (s: string) => void } = {}): Promise<{ offers: number; ranges: number }> {
  const range = opts.rangeIds ?? 150_000;
  const pause = opts.pauseMs ?? 3000;
  const log = opts.log ?? (() => {});
  const target = sql`EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.id = s.offer_id AND o.master_product_id IS NOT NULL AND ${verticalSql('o', GAMES)})
        AND NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = s.offer_id)`;
  const scan = (a: string, b: string) => sql`
    INSERT INTO product_price_rollup AS r (offer_id, price_cents, n, first_at, last_at)
    SELECT s.offer_id, s.price_cents, COUNT(*)::int, MIN(s.collected_at), MAX(s.collected_at)
    FROM affiliate_price_snapshots s
    WHERE s.id > ${a}::bigint AND s.id <= ${b}::bigint AND s.price_cents > 0 AND ${snapshotNaoIscaSql('s')} AND ${target}
    GROUP BY s.offer_id, s.price_cents
    ON CONFLICT (offer_id, price_cents) DO UPDATE
      SET n = r.n + EXCLUDED.n, first_at = LEAST(r.first_at, EXCLUDED.first_at), last_at = GREATEST(r.last_at, EXCLUDED.last_at)`;
  // Sobra de carga interrompida (linhas sem estado): descarta e refaz, para nunca somar duas vezes.
  await db.execute(sql`DELETE FROM product_price_rollup r WHERE NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = r.offer_id)`);
  const b0 = await db.execute<Row>(sql`SELECT COALESCE(min(id), 0)::bigint AS lo, COALESCE(max(id), 0)::bigint AS hi FROM affiliate_price_snapshots`);
  const lo = BigInt(String(b0[0].lo));
  const hi = BigInt(String(b0[0].hi));
  let cur = lo - 1n;
  let ranges = 0;
  while (cur < hi) {
    const nxt = cur + BigInt(range) > hi ? hi : cur + BigInt(range);
    const t = Date.now();
    await db.execute(scan(String(cur), String(nxt)));
    ranges++;
    log(`faixa ${cur}..${nxt} (${Date.now() - t} ms)`);
    cur = nxt;
    if (cur < hi && pause > 0) await new Promise((r) => setTimeout(r, pause));
  }
  // Ajuste final sob o lock: cotações novas desde `cur` até a marca d'água atual, e só então nasce o estado.
  const offers = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    const h = await tx.execute<Row>(sql`SELECT GREATEST(COALESCE(max(id), 0) - ${rollupLagIds()}, 0)::bigint AS h FROM affiliate_price_snapshots`);
    const end = String(h[0].h);
    if (BigInt(end) > cur) await tx.execute(scan(String(cur), end));
    const ins = await tx.execute<Row>(sql`
      INSERT INTO product_price_rollup_state (offer_id, base_id, built_at)
      SELECT o.id, ${end}::bigint, now() FROM affiliate_offers o
      WHERE o.master_product_id IS NOT NULL AND ${verticalSql('o', GAMES)}
        AND NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = o.id)
      ON CONFLICT (offer_id) DO NOTHING
      RETURNING offer_id`);
    await tx.execute(sql`
      INSERT INTO product_price_rollup_meta (id, last_id, isca_on) VALUES (1, ${end}::bigint, ${gatilhoIscaLigado()})
      ON CONFLICT (id) DO NOTHING`);
    return ins.length;
  });
  return { offers, ranges };
}

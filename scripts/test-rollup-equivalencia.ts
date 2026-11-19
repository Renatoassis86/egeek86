/**
 * PROVA de equivalencia do resumo incremental (migration 0068) com o calculo completo (`statsAggCtes`), linha a linha.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-rollup-equivalencia.ts [--n=240] [--lote=15]
 * Amostra >= 200 produtos: os de mais cotacoes, com vendedor fraco, com isca, sem regua (poucas cotacoes), com oferta avg_excluded/quarentena e
 * aleatorios. Constroi o resumo das ofertas da amostra (le so essas), roda o calculo completo e o do resumo logo em seguida e exige igualdade:
 * inteiros e datas EXATOS; `avg_cents`/`raw_avg_cents` (numeric) iguais ate 1e-9 relativo (tolerancia documentada: a divisao numeric pode diferir
 * na ultima casa; o valor publicado e arredondado ao centavo). Leve de proposito: lotes pequenos, pausa entre lotes, statement_timeout curto.
 * Cotacao nova que entra ENTRE as duas leituras faz o produto ser relido (ate 3 vezes) antes de contar como diferenca.
 */
process.env.PRICE_ROLLUP_LAG_IDS = '0';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getMasterProductPriceStatsBatchRaw } from '@/server/queries/product-price-stats';
import { buildRollupOffers, ingestRollupWindow } from '@/server/pricing/price-rollup';
import { weakSellerSql } from '@/server/queries/public-offers';

type Row = Record<string, unknown>;
const arg = (k: string, d: number) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? d);
const N = arg('n', 240);
const LOTE = arg("lote", 2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idl = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

async function pick(): Promise<{ ids: string[]; groups: Record<string, number> }> {
  const set = new Map<string, string>();
  const add = (g: string, rows: Row[], lim: number) => {
    let c = 0;
    for (const r of rows) {
      const id = String(r.id);
      if (!set.has(id) && c < lim) { set.set(id, g); c++; }
    }
  };
  add('mais_cotacoes', await db.execute<Row>(sql`SELECT master_product_id AS id FROM product_price_stats ORDER BY quote_count DESC LIMIT 90`), 70);
  add('sem_regua', await db.execute<Row>(sql`SELECT master_product_id AS id FROM product_price_stats WHERE quote_count BETWEEN 1 AND 3 ORDER BY hashtext(master_product_id::text) LIMIT 60`), 30);
  add('isca', await db.execute<Row>(sql`SELECT DISTINCT master_product_id AS id FROM preco_isca_marcas LIMIT 60`), 30);
  add('vendedor_fraco', await db.execute<Row>(sql`
    SELECT DISTINCT o.master_product_id AS id FROM affiliate_sellers sel INNER JOIN affiliate_offers o ON o.seller_id = sel.id
    WHERE ${weakSellerSql('sel')} AND o.vertical = 'games' AND o.master_product_id IS NOT NULL LIMIT 80`), 40);
  add('avg_excluded_ou_quarentena', await db.execute<Row>(sql`
    SELECT DISTINCT master_product_id AS id FROM affiliate_offers WHERE (avg_excluded_at IS NOT NULL OR quarantined_at IS NOT NULL) AND vertical = 'games' AND master_product_id IS NOT NULL LIMIT 80`), 30);
  add('aleatorio', await db.execute<Row>(sql`SELECT master_product_id AS id FROM product_price_stats ORDER BY hashtext(master_product_id::text || 'x') LIMIT 400`), Math.max(40, N - set.size));
  const ids = [...set.keys()];
  const groups: Record<string, number> = {};
  for (const id of ids) groups[set.get(id)!] = (groups[set.get(id)!] ?? 0) + 1;
  return { ids, groups };
}

const TS = new Set(['history_since', 'history_until', 'all_at', 'y_at', 'm_at']);
const NUMERIC_TOL = new Set(['avg_cents', 'raw_avg_cents', 'dispersion_ratio']);
function same(col: string, a: unknown, b: unknown): { ok: boolean; why?: string } {
  if (a == null || b == null) return { ok: a == null && b == null, why: `${a} vs ${b}` };
  if (TS.has(col)) return { ok: new Date(a as string).getTime() === new Date(b as string).getTime(), why: `${a} vs ${b}` };
  if (NUMERIC_TOL.has(col)) {
    const x = Number(a), y = Number(b);
    return { ok: x === y || Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y), 1), why: `${a} vs ${b}` };
  }
  if (col === 'median_cents' || col === 'floor_cents' || col === 'pf_median') return { ok: Number(a) === Number(b), why: `${a} vs ${b}` };
  return { ok: String(a) === String(b), why: `${a} vs ${b}` };
}

(async () => {
  const t0 = Date.now();
  const { ids, groups } = await pick();
  console.log(`amostra: ${ids.length} produtos`, JSON.stringify(groups));
  // 1) o resumo ja deve estar construido pela carga inicial (scripts/backfill-price-rollup.ts); constroi so o que faltar das ofertas da amostra
  const missing: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await db.execute<Row>(sql`SELECT o.id FROM affiliate_offers o WHERE o.master_product_id IN (${idl(ids.slice(i, i + 100))}) AND o.vertical = 'games'
      AND NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = o.id)`);
    for (const r of rows) missing.push(String(r.id));
  }
  console.log(`ofertas da amostra sem resumo (construidas agora): ${missing.length}`);
  for (let i = 0; i < missing.length; i += 10) { await buildRollupOffers(missing.slice(i, i + 10)); await sleep(1000); }

  let msL = 0, msR = 0, fails = 0, skipped = 0;
  let compared = 0, colDiffs = 0, offerTieDiffs = 0, payloadDiffs = 0, retried = 0;
  const examples: string[] = [];
  const colCount: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    let pend = lote;
    for (let tentativa = 0; tentativa < 3 && pend.length; tentativa++) {
      await ingestRollupWindow();
      let legacyAgg: Row[] = [], rollAgg: Row[] = [];
      const t1 = Date.now();
      let legacy; let roll;
      try { legacy = await getMasterProductPriceStatsBatchRaw(pend, (r) => { legacyAgg = r; }); } catch (e) { console.log('  completo falhou:', String((e as any)?.message ?? e).slice(0, 80)); await sleep(4000); fails++; if (fails % 2 === 0) { skipped += pend.length; pend = []; } else tentativa--; continue; }
      const t2 = Date.now();
      await ingestRollupWindow();
      const t3 = Date.now();
      roll = await getMasterProductPriceStatsBatchRaw(pend, (r) => { rollAgg = r; }, { rollup: true });
      msL += t2 - t1; msR += Date.now() - t3;
      const la = new Map(legacyAgg.map((r) => [String(r.master_product_id), r]));
      const ra = new Map(rollAgg.map((r) => [String(r.master_product_id), r]));
      const again: string[] = [];
      for (const id of pend) {
        const L = la.get(id), R = ra.get(id);
        const diffs: string[] = [];
        if (!L !== !R) diffs.push(`linha ${L ? 'so no completo' : 'so no resumo'}`);
        else if (L && R) {
          const cols = new Set([...Object.keys(L), ...Object.keys(R)]);
          for (const c of cols) {
            if (c === 'all_offer_id' || c === 'y_offer_id' || c === 'm_offer_id') continue;
            const s = same(c, L[c], R[c]);
            if (!s.ok) { diffs.push(`${c}: ${s.why}`); colCount[c] = (colCount[c] ?? 0) + 1; }
          }
          for (const [oc, ac] of [['all_offer_id', 'all_at'], ['y_offer_id', 'y_at'], ['m_offer_id', 'm_at']] as const) if (String(L[oc]) !== String(R[oc]) && !diffs.some((d) => d.startsWith(ac))) offerTieDiffs++;
        }
        const ls = JSON.stringify(strip(legacy.get(id))), rs = JSON.stringify(strip(roll.get(id)));
        if (ls !== rs && diffs.length === 0) { payloadDiffs++; if (examples.length < 6) examples.push(`payload ${id}: ${ls.slice(0, 200)} | ${rs.slice(0, 200)}`); }
        if (diffs.length) {
          if (tentativa < 2) { again.push(id); retried++; } else { colDiffs++; if (examples.length < 12) examples.push(`${id}: ${diffs.slice(0, 4).join('; ')}`); }
        } else compared++;
      }
      pend = again;
    }
    await sleep(1200);
  }
  console.log(`\nRESULTADO: ${compared}/${ids.length} produtos IGUAIS | com diferenca: ${colDiffs} | releituras por cotacao nova: ${retried} | empate de oferta no minimo (mesmo preco/data, oferta diferente): ${offerTieDiffs} | payload diferente: ${payloadDiffs} | NAO VERIFICADOS (calculo completo estourou o tempo): ${skipped}`);
  console.log(`tempo total no banco (so a consulta de agregados+atual+vizinhas): completo ${Math.round(msL / 1000)} s | resumo ${Math.round(msR / 1000)} s`);
  console.log('colunas com diferenca:', JSON.stringify(colCount));
  for (const e of examples) console.log('  ', e);
  console.log(`duracao ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(colDiffs === 0 && payloadDiffs === 0 && skipped === 0 ? 0 : 1);
})().catch((e) => { console.error(String(e?.cause?.message ?? e?.message ?? e).slice(0, 600)); process.exit(2); });

/** Tira `at` de mínimos que valem "agora" (o `nowIso` de cada chamada difere em ms) e o que depende do relógio. */
function strip(s: unknown): unknown {
  if (!s) return s;
  const o = JSON.parse(JSON.stringify(s)) as Record<string, any>;
  for (const k of ['lowAll', 'low1y', 'low3m']) if (o[k] && o[k].offerActive && Math.abs(Date.now() - new Date(o[k].at).getTime()) < 120_000) o[k].at = 'agora';
  return o;
}

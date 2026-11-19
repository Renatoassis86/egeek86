/**
 * PROVA de equivalencia do resumo incremental (migration 0068) SEM o calculo completo ao vivo: a REFERENCIA e a linha ja persistida em
 * `product_price_stats` (calculada pelo calculo completo `statsAggCtes`) de produtos em que NAO entrou cotacao nova depois do `computed_at`.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-rollup-equivalencia-persistido.ts [--n=220] [--lote=5] [--horas=6]
 * Para esses produtos o resumo (`rollupStatsCtes`, poucas linhas por oferta) tem de reproduzir as MESMAS colunas: inteiros e datas exatos;
 * `avg_cents`/`raw_avg_cents`/`dispersion_ratio`/`median_cents` (numeric/float) ate 1e-9 relativo. Tambem confere, no payload, preco/data/oferta de
 * lowAll/low1y/low3m quando nao derivam da oferta atual (F-14, `at` = instante do calculo).
 * Janela: min_1y/min_3m dependem de now(); se divergirem e alguma cotacao do produto cruzou a janela entre computed_at e agora (last_at em
 * [computed_at-365d, now-365d)), a divergencia e EXPLICADA (nao conta como diferenca) e fica listada.
 * Leve de proposito: lotes de 5, pausa entre lotes, consultas curtas, sem varrer cotacoes brutas (so o resumo). Sai com codigo 1 se houver diferenca.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buildRollupOffers, ingestRollupWindow, rollupStatsCtes } from '@/server/pricing/price-rollup';
import { weakSellerSql } from '@/server/queries/public-offers';
import { GAMES } from '@/lib/catalog/verticais';

type Row = Record<string, unknown>;
const arg = (k: string, d: number) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? d);
const N = arg('n', 300);
const LOTE = arg('lote', 5);
const HORAS = arg('horas', 6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Execucao com repeticao: o banco de producao e pequeno e disputado; erro de socket/timeout nao e diferenca de calculo. */
async function ex(q: any, tries = 5): Promise<Row[]> {
  for (let t = 1; ; t++) {
    try { return (await db.execute<Row>(q)) as unknown as Row[]; } catch (e) {
      if (t >= tries) throw e;
      console.log(`  (repetindo consulta ${t}/${tries}: ${String((e as any)?.cause?.message ?? (e as any)?.message ?? e).slice(0, 100)})`); await sleep(3000 * t);
    }
  }
}
const idl = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

/** Dos candidatos: so os com calculo recente e SEM cotacao coletada depois do computed_at (EXISTS por indice, barato; UM produto por consulta: com varios o planejador varre o indice inteiro). */
async function filtraSemCotacaoNova(cands: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < cands.length; i += 1) {
    const rows = await ex(sql`
      SELECT ps.master_product_id AS id FROM product_price_stats ps
      WHERE ps.master_product_id IN (${idl(cands.slice(i, i + 1))})
        AND ps.computed_at > now() - (${HORAS} * interval '1 hour')
        AND NOT EXISTS (SELECT 1 FROM affiliate_offers o INNER JOIN affiliate_price_snapshots s ON s.offer_id = o.id
                        WHERE o.master_product_id = ps.master_product_id AND s.collected_at > ps.computed_at - interval '1 second')`);
    for (const r of rows) out.push(String(r.id));
    await sleep(60);
  }
  return out;
}

async function pick(): Promise<{ ids: string[]; groups: Record<string, number> }> {
  const set = new Map<string, string>();
  const add = async (g: string, rows: Row[], lim: number) => {
    const fresh = rows.map((r) => String(r.id)).filter((id) => !set.has(id));
    const t = Date.now(); const ok: string[] = [];
    // Filtra um a um e PARA ao completar o limite do grupo (cada verificacao e uma consulta por indice).
    for (const id of fresh) { if (ok.length >= lim) break; ok.push(...(await filtraSemCotacaoNova([id]))); }
    console.log(`  grupo ${g}: ${fresh.length} candidatos -> ${ok.length} sem cotacao nova (${Date.now() - t} ms)`);
    let c = 0;
    for (const id of ok) if (c < lim && !set.has(id)) { set.set(id, g); c++; }
  };
  const recent = sql`computed_at > now() - (${HORAS} * interval '1 hour') AND quote_count > 0`;
  await add('mais_cotacoes', await ex(sql`SELECT master_product_id AS id FROM product_price_stats WHERE ${recent} ORDER BY quote_count DESC LIMIT 400`), 60);
  await add('sem_regua', await ex(sql`SELECT master_product_id AS id FROM product_price_stats WHERE ${recent} AND quote_count BETWEEN 1 AND 3 ORDER BY hashtext(master_product_id::text) LIMIT 200`), 30);
  await add('isca', await ex(sql`SELECT DISTINCT m.master_product_id AS id FROM preco_isca_marcas m INNER JOIN product_price_stats ps ON ps.master_product_id = m.master_product_id WHERE ps.computed_at > now() - (${HORAS} * interval '1 hour') AND ps.quote_count > 0 LIMIT 200`), 30);
  await add('vendedor_fraco', await ex(sql`
    SELECT DISTINCT o.master_product_id AS id FROM affiliate_sellers sel INNER JOIN affiliate_offers o ON o.seller_id = sel.id
    INNER JOIN product_price_stats ps ON ps.master_product_id = o.master_product_id
    WHERE ${weakSellerSql('sel')} AND o.vertical = 'games' AND ps.computed_at > now() - (${HORAS} * interval '1 hour') AND ps.quote_count > 0 LIMIT 200`), 40);
  await add('avg_excluded_ou_quarentena', await ex(sql`
    SELECT DISTINCT o.master_product_id AS id FROM affiliate_offers o INNER JOIN product_price_stats ps ON ps.master_product_id = o.master_product_id
    WHERE (o.avg_excluded_at IS NOT NULL OR o.quarantined_at IS NOT NULL) AND o.vertical = 'games' AND ps.computed_at > now() - (${HORAS} * interval '1 hour') AND ps.quote_count > 0 LIMIT 200`), 30);
  await add('aleatorio', await ex(sql`SELECT master_product_id AS id FROM product_price_stats WHERE ${recent} ORDER BY hashtext(master_product_id::text || 'x') LIMIT 1500`), Math.max(40, N - set.size));
  const ids = [...set.keys()];
  const groups: Record<string, number> = {};
  for (const id of ids) groups[set.get(id)!] = (groups[set.get(id)!] ?? 0) + 1;
  return { ids, groups };
}

const TS = new Set(['history_since', 'history_until']);
const TOL = new Set(['avg_cents', 'raw_avg_cents', 'dispersion_ratio', 'median_cents', 'pf_median', 'floor_cents']);
const COLS = ['quote_count', 'avg_quote_count', 'avg_cents', 'raw_avg_cents', 'max_cents', 'max_raw_cents', 'history_since', 'history_until', 'history_days',
  'min_all', 'min_1y', 'min_3m', 'median_cents', 'dispersion_ratio', 'n_all', 'raw_min', 'floor_cents', 'pf_median'];
function same(col: string, a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (TS.has(col)) return new Date(a as string).getTime() === new Date(b as string).getTime();
  if (TOL.has(col)) { const x = Number(a), y = Number(b); return x === y || Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y), 1); }
  return String(a) === String(b);
}

/** Consulta de agregados pelo resumo, no mesmo formato de `getMasterProductPriceStatsBatchRaw` (so o que importa para a comparacao). */
async function rollupAgg(ids: string[]): Promise<Row[]> {
  return ex(sql`
    WITH ${rollupStatsCtes(sql`o.master_product_id IN (${idl(ids)})`, GAMES)}
    SELECT ps.*,
           la.offer_id AS all_offer_id, la.price_cents::bigint AS all_price, la.collected_at AS all_at,
           ly.offer_id AS y_offer_id, ly.price_cents::bigint AS y_price, ly.collected_at AS y_at,
           lm.offer_id AS m_offer_id, lm.price_cents::bigint AS m_price, lm.collected_at AS m_at
    FROM product_stats ps
    LEFT JOIN low_all la ON la.master_product_id = ps.master_product_id
    LEFT JOIN low_1y ly ON ly.master_product_id = ps.master_product_id
    LEFT JOIN low_3m lm ON lm.master_product_id = ps.master_product_id`);
}

(async () => {
  const t0 = Date.now();
  const { ids, groups } = await pick();
  console.log(`amostra: ${ids.length} produtos (computed_at < ${HORAS} h, sem cotacao nova depois do calculo)`, JSON.stringify(groups));
  // Resumo das ofertas da amostra: so constroi o que faltar.
  const missing: string[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const rows = await ex(sql`SELECT o.id FROM affiliate_offers o WHERE o.master_product_id IN (${idl(ids.slice(i, i + 50))}) AND o.vertical = 'games'
      AND NOT EXISTS (SELECT 1 FROM product_price_rollup_state st WHERE st.offer_id = o.id)`);
    for (const r of rows) missing.push(String(r.id));
  }
  console.log(`ofertas da amostra sem resumo (construidas agora): ${missing.length}`);
  for (let i = 0; i < missing.length; i += 10) { await buildRollupOffers(missing.slice(i, i + 10)); await sleep(800); }

  let novaDepois = 0, flags = 0, vazios = 0, janelaAt = 0, compared = 0, produtosIguais = 0, colsComparadas = 0, lowsComparadas = 0, lowsPuladas = 0, diffs = 0, explicadas = 0, semLinha = 0, puladosCauda = 0;
  const colDiff: Record<string, number> = {};
  const exemplos: string[] = [];
  const exp: string[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    // Soma ao resumo as cotacoes novas ate a marca d'agua (folga de 300 ids) e exclui os produtos com cotacao ainda na cauda (id > marca d'agua).
    await ingestRollupWindow();
    const lastId = String((await ex(sql`SELECT last_id::bigint AS v FROM product_price_rollup_meta WHERE id = 1`))[0].v);
    const tail = await ex(sql`SELECT DISTINCT offer_id FROM affiliate_price_snapshots WHERE id > ${lastId}::bigint`);
    const cauda = tail.length ? await ex(sql`SELECT id AS id FROM (SELECT DISTINCT master_product_id AS id FROM affiliate_offers WHERE id IN (${idl(tail.map((r) => String(r.offer_id)))})) x WHERE id IN (${idl(lote)})`) : [];
    const fora = new Set(cauda.map((r) => String(r.id)));
    puladosCauda += fora.size;
    const pend = lote.filter((x) => !fora.has(x));
    if (!pend.length) continue;
    const refRows = await ex(sql`SELECT *, now() AS agora FROM product_price_stats WHERE master_product_id IN (${idl(pend)})`);
    const ref = new Map(refRows.map((r) => [String(r.master_product_id), r]));
    const rollRows = await rollupAgg(pend);
    const roll = new Map(rollRows.map((r) => [String(r.master_product_id), r]));
    for (const id of pend) {
      const L = ref.get(id), R = roll.get(id);
      if (!L) { semLinha++; continue; }
      if (!R) {
        // Sem linha no resumo = sem cotacao plausivel (ex.: catalogGate rejeitado). O calculo completo tambem nao devolve linha; `persistStatsChunk` grava quote_count 0 e o resto null.
        const vazio = Number(L.quote_count) === 0 && COLS.filter((c) => c !== 'quote_count').every((c) => L[c] == null);
        if (vazio) { vazios++; produtosIguais++; compared++; continue; }
        diffs++; produtosDiffMsg(exemplos, id, ['linha so na referencia (resumo nao devolveu produto)']); continue;
      }
      // Cotacao entrou depois do calculo de referencia (a amostra e escolhida minutos antes da comparacao): a referencia nao e comparavel.
      if (R.history_until != null && new Date(R.history_until as string).getTime() > new Date(L.computed_at as string).getTime()) { novaDepois++; continue; }
      compared++;
      const d: string[] = [];
      const cols: string[] = [];
      for (const c of COLS) {
        colsComparadas++;
        if (!same(c, L[c], R[c])) { d.push(`${c}: ref=${L[c]} resumo=${R[c]}`); cols.push(c); }
      }
      // low*: payload (preco/data/oferta), exceto as derivadas da oferta atual (at ~ instante do calculo, F-14).
      const p = (typeof L.payload === 'string' ? JSON.parse(L.payload) : L.payload) as Record<string, any>;
      for (const [k, pc, ac, oc] of [['lowAll', 'all_price', 'all_at', 'all_offer_id'], ['low1y', 'y_price', 'y_at', 'y_offer_id'], ['low3m', 'm_price', 'm_at', 'm_offer_id']] as const) {
        const lo = p?.[k];
        if (!lo) { if (R[pc] != null) lowsPuladas++; continue; }
        // F-14: o minimo "inclui a oferta publica atual"; se a oferta atual do payload e mais barata que o minimo do historico, o payload traz ELA (at = instante do calculo).
        const cur = p?.currentLowestActive;
        const derivada = !!cur && String(lo.offerId) === String(cur.offerId) && Number(lo.priceCents) === Number(cur.priceCents) && (R[pc] == null || Number(cur.priceCents) < Number(R[pc]));
        if (derivada) { lowsPuladas++; continue; }
        lowsComparadas++;
        const ok = Number(lo.priceCents) === Number(R[pc]) && new Date(lo.at).getTime() === new Date(R[ac] as string).getTime();
        // Mesmo preco, `at` mais antigo que a janela de hoje: a cotacao saiu da janela (now() andou) e a primeira DENTRO da janela e outra; correto para "agora".
        const win = k === 'low1y' ? 365 : k === 'low3m' ? 90 : null;
        if (!ok && win && Number(lo.priceCents) === Number(R[pc]) && new Date(lo.at).getTime() < Date.now() - win * 86_400_000) { janelaAt++; continue; }
        if (!ok) { d.push(`${k}: ref=${lo.priceCents}@${lo.at} resumo=${R[pc]}@${R[ac] ? new Date(R[ac] as string).toISOString() : null}`); cols.push(k); }
        else if (String(lo.offerId) !== String(R[oc])) { /* empate de oferta no mesmo preco/data: nao e coluna da tabela; contado a parte */ lowsPuladas++; }
      }
      if (!d.length) { produtosIguais++; continue; }
      // Explicacao: min_1y/min_3m/low1y/low3m dependem de now(); cotacao que cruzou a janela entre computed_at e agora.
      const janela = cols.every((c) => ['min_1y', 'min_3m', 'low1y', 'low3m', 'y_at', 'm_at'].includes(c));
      let cruzou = false;
      if (janela) {
        const x = await ex(sql`
          SELECT 1 FROM product_price_rollup r INNER JOIN affiliate_offers o ON o.id = r.offer_id
          WHERE o.master_product_id = ${id}::uuid AND (
            (r.last_at >= ${L.computed_at as string}::timestamptz - interval '365 days' AND r.last_at < now() - interval '365 days')
            OR (r.last_at >= ${L.computed_at as string}::timestamptz - interval '90 days' AND r.last_at < now() - interval '90 days')
            OR (r.first_at >= ${L.computed_at as string}::timestamptz - interval '365 days' AND r.first_at < now() - interval '365 days')
            OR (r.first_at >= ${L.computed_at as string}::timestamptz - interval '90 days' AND r.first_at < now() - interval '90 days')) LIMIT 1`);
        cruzou = x.length > 0;
      }
      // Flag de oferta (avg_excluded/quarentena, sincronizada a cada recalculo) alterada DEPOIS do computed_at: a referencia esta velha em exatamente as cotacoes dessa oferta.
      let flagMudou = false;
      if (!cruzou && cols.every((c) => ['avg_quote_count', 'avg_cents', 'raw_avg_cents', 'n_all', 'quote_count', 'median_cents', 'dispersion_ratio', 'max_cents', 'floor_cents', 'pf_median'].includes(c)) && L.n_all != null && R.n_all != null) {
        const delta = Math.abs(Number(R.n_all) - Number(L.n_all));
        const x = await ex(sql`SELECT COALESCE(SUM(r.n), 0)::int AS soma, COUNT(DISTINCT o.id)::int AS ofertas FROM affiliate_offers o INNER JOIN product_price_rollup r ON r.offer_id = o.id
          WHERE o.master_product_id = ${id}::uuid AND o.updated_at > ${L.computed_at as string}::timestamptz AND (o.avg_excluded_at IS NULL OR o.avg_excluded_at > ${L.computed_at as string}::timestamptz)`);
        const y = await ex(sql`SELECT r.offer_id, SUM(r.n)::int AS n FROM affiliate_offers o INNER JOIN product_price_rollup r ON r.offer_id = o.id
          WHERE o.master_product_id = ${id}::uuid AND o.updated_at > ${L.computed_at as string}::timestamptz GROUP BY r.offer_id`);
        flagMudou = delta > 0 && (y.some((r) => Number(r.n) === delta) || Number(x[0]?.soma) === delta);
      }
      if (flagMudou) { flags++; exp.push(`${id}: referencia anterior a mudanca de flag de oferta (delta n_all = cotacoes de uma oferta alterada depois do calculo): ${d.join('; ')}`); produtosIguais++; }
      else if (cruzou) { explicadas++; exp.push(`${id}: ${d.join('; ')}`); produtosIguais++; }
      else { diffs++; for (const c of cols) colDiff[c] = (colDiff[c] ?? 0) + 1; produtosDiffMsg(exemplos, id, d); }
    }
    await sleep(1200);
  }
  console.log(`\nRESULTADO: produtos comparados ${compared} (amostra ${ids.length}; sem linha ${semLinha}; pulados por cotacao na cauda ${puladosCauda}; pulados por cotacao nova depois da referencia ${novaDepois}) | IGUAIS ${produtosIguais} | com DIFERENCA ${diffs} | divergencias explicadas pela janela now() ${explicadas} + ${janelaAt} so no at do minimo | sem linha dos dois lados (vazio) ${vazios} | referencia velha por flag de oferta mudada ${flags}`);
  console.log(`colunas comparadas (${COLS.length}/produto): ${colsComparadas} | lowAll/1y/3m do payload comparadas ${lowsComparadas} (puladas: derivadas da oferta atual/empate de oferta/sem ref: ${lowsPuladas})`);
  console.log('colunas com diferenca:', JSON.stringify(colDiff));
  for (const e of exp.slice(0, 10)) console.log('  [explicada]', e);
  for (const e of exemplos) console.log('  [DIFERENCA]', e);
  console.log(`duracao ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(diffs === 0 && compared >= 200 ? 0 : 1);
})().catch((e) => { console.error(String(e?.cause?.message ?? e?.message ?? e).slice(0, 600)); process.exit(2); });

function produtosDiffMsg(ex: string[], id: string, d: string[]) { if (ex.length < 20) ex.push(`${id}: ${d.slice(0, 5).join('; ')}`); }

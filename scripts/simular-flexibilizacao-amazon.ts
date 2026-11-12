/**
 * SIMULACAO (so SELECT, nada e gravado) da flexibilizacao da aprovacao de ofertas da Amazon (dono, 2026-11-12).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/simular-flexibilizacao-amazon.ts [--sample 600] [--out arquivo.json]
 *
 * A) Reavalia TODAS as ofertas Amazon ja gravadas (ativas, rascunho, pausadas) com a regra ANTIGA (flex=false) e a NOVA (flex=true).
 * B) Corpus real de titulos de outras lojas (ML/Shopee) do MESMO produto (positivos: deveriam casar) e de OUTROS produtos da mesma marca/plataforma
 *    (negativos: nunca podem virar "aceito"). Mede recall e falso-aceite antes/depois, por departamento.
 * Limite assumido: a busca da Amazon nao guarda os candidatos recusados, entao nao ha como reexecutar as rodadas passadas; o corpus B e um
 * substituto (titulos reais de outras lojas, de estilo diferente do da Amazon). A coleta nova passa a guardar uma amostra de recusados
 * (stats.amostra_recusados em collector_runs.meta) para uma simulacao fiel nas proximas rodadas.
 */
import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { FLEX, judgeGame, judgeGeneric, prepareGame, prepareGeneric, type AmzCand, type MasterIdentity, type Verdict } from '@/lib/affiliate/amazon-identity';
import { masterFromRow } from '@/server/collector/amazon-assisted';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const SAMPLE = Number(arg('sample') ?? 600);
const OUT = arg('out');
// Calibragem: --game M,C (fronteira de jogos), ex.: --game 0.7,0.4
const gameArg = arg('game');
if (gameArg) { const [m, c] = gameArg.split(',').map(Number); FLEX.gameBorderM = m; FLEX.gameBorderC = c; }

type Row = Record<string, any>;
const rowsOf = <T = Row>(r: unknown) => r as unknown as T[];
const cand = (a: string, t: string, cents: number): AmzCand => ({ a, t, p: 'R$ ' + (cents / 100).toFixed(2).replace('.', ','), l: null, s: 0 });

function judger(m: MasterIdentity, flex: boolean): ((c: AmzCand) => Verdict) | null {
  if (m.vertical === 'games') {
    const ctx = prepareGame({ name: m.name, gen: m.gen });
    return ctx ? (c) => judgeGame(ctx, c, { flex }) : null;
  }
  const ctx = prepareGeneric(m);
  return (c) => judgeGeneric(ctx, c, { flex });
}
const cls = (v: Verdict) => (v.outcome === 'accept' ? 'aceito' : v.border ? 'fronteira_fila' : v.outcome === 'draft' ? 'rascunho_duvida' : `recusa:${v.counter}:${v.reason.split(':')[0]}`);
const bordas: Record<string, Record<string, number>> = { pos: {}, neg: {} };
const bump = (o: Record<string, number>, k: string, n = 1) => { o[k] = (o[k] ?? 0) + n; };

const MASTER_COLS = sql`m.id::text mid, m.name, m.vertical, m.game_platform_gen gen, m.gtin, m.mpn, m.manufacturer, b.name brand_name, m.brand_id::text brand_id,
  m.attributes->'vertical'->>'segment' segment, m.attributes->'vertical'->'catalogAttributes' cat`;

async function main() {
  const report: Record<string, unknown> = {};

  // ---------- A) ofertas Amazon ja gravadas ----------
  const am = rowsOf(await db.execute(sql`
    SELECT o.id::text oid, o.status::text status, o.title, o.current_price_cents price, o.external_ref, ${MASTER_COLS}
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN brands b ON b.id = m.brand_id WHERE n.slug = 'amazon'`));
  const A: Record<string, Record<string, Record<string, number>>> = {};
  const mudancas: Array<{ oid: string; status: string; vertical: string; master: string; titulo: string; antes: string; depois: string; motivo: string }> = [];
  for (const r of am) {
    const m = masterFromRow(r as never);
    if (!m) continue;
    const c = cand(String(r.external_ref).replace('amazon-', ''), r.title, Number(r.price) || 100);
    const jo = judger(m, false), jn = judger(m, true);
    const vo = jo ? jo(c) : null, vn = jn ? jn(c) : null;
    const co = vo ? cls(vo) : 'master_sem_plataforma_ou_fora_de_linha', cn = vn ? cls(vn) : co;
    bump(((A[r.status] ??= {})[m.vertical] ??= {}), `${co} -> ${cn}`);
    if (co !== cn) mudancas.push({ oid: r.oid, status: r.status, vertical: m.vertical, master: r.name, titulo: r.title, antes: co, depois: cn, motivo: vn?.reason ?? '' });
  }
  report.A_ofertas_amazon = A;
  report.A_mudancas = mudancas;

  // ---------- B) corpus de outras lojas ----------
  const masters = rowsOf(await db.execute(sql`
    WITH amz AS (SELECT DISTINCT o.master_product_id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE n.slug = 'amazon'),
    elig AS (
      SELECT m.id FROM master_products m
      WHERE (m.attributes->>'mergedInto') IS NULL AND (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved')
        AND (SELECT count(*) FROM affiliate_offers x WHERE x.master_product_id = m.id AND x.status = 'active') >= 2
      ORDER BY md5(m.id::text) LIMIT ${SAMPLE})
    SELECT ${MASTER_COLS} FROM master_products m LEFT JOIN brands b ON b.id = m.brand_id
    WHERE m.id IN (SELECT id FROM elig UNION SELECT master_product_id FROM amz)`));
  const mids = masters.map((r) => r.mid);
  const offers = rowsOf(await db.execute(sql`
    SELECT o.master_product_id::text mid, o.title, o.current_price_cents price, o.external_ref FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.status = 'active' AND n.slug <> 'amazon' AND o.current_price_cents > 0 AND o.master_product_id IN (${sql.join(mids.map((i) => sql`${i}::uuid`), sql`, `)})`));
  const byMaster = new Map<string, Row[]>();
  for (const o of offers) (byMaster.get(o.mid) ?? byMaster.set(o.mid, []).get(o.mid)!).push(o);

  const pos: Record<string, Record<string, Record<string, number>>> = { antes: {}, depois: {} };
  const neg: Record<string, Record<string, Record<string, number>>> = { antes: {}, depois: {} };
  const falsosAceites: Array<{ master: string; titulo: string; antes: string; depois: string }> = [];
  const novosAceitosPositivos: Array<{ master: string; titulo: string; motivo: string }> = [];
  let nPos = 0, nNeg = 0;
  for (const r of masters) {
    const m = masterFromRow(r as never);
    if (!m) continue;
    const jo = judger(m, false), jn = judger(m, true);
    if (!jo || !jn) continue;
    const key = m.vertical;
    for (const o of (byMaster.get(r.mid) ?? []).slice(0, 4)) {
      const c = cand('B0POSITIVE', o.title, Number(o.price));
      const vo = jo(c), vn = jn(c);
      bump((pos.antes[key] ??= {}), cls(vo)); bump((pos.depois[key] ??= {}), cls(vn)); nPos++;
      if (vn.border) bump(bordas.pos, `${key}:${vn.reason.slice(0, 60)}`);
      if (vo.outcome !== 'accept' && vn.outcome === 'accept' && novosAceitosPositivos.length < 30) novosAceitosPositivos.push({ master: r.name, titulo: o.title, motivo: vn.reason });
    }
    // negativos: ofertas de OUTROS masters da mesma marca (ou, em games, da mesma plataforma com palavra em comum no nome)
    let negs: Row[] = [];
    if (m.vertical === 'games') {
      const w = String(r.name).replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter((x: string) => x.length >= 4)[0];
      if (w) {
        negs = rowsOf(await db.execute(sql`SELECT o.title, o.current_price_cents price, m2.name mname FROM master_products m2
          JOIN affiliate_offers o ON o.master_product_id = m2.id AND o.status = 'active' AND o.current_price_cents > 0
          WHERE m2.id <> ${r.mid}::uuid AND m2.vertical = 'games' AND m2.game_platform_gen IS NOT DISTINCT FROM ${r.gen} AND m2.name ILIKE ${'%' + w + '%'} LIMIT 6`));
      }
    } else if (r.brand_id) {
      negs = rowsOf(await db.execute(sql`SELECT o.title, o.current_price_cents price, m2.name mname FROM master_products m2
        JOIN affiliate_offers o ON o.master_product_id = m2.id AND o.status = 'active' AND o.current_price_cents > 0
        WHERE m2.id <> ${r.mid}::uuid AND m2.brand_id = ${r.brand_id}::uuid AND m2.vertical = ${m.vertical} AND (m2.attributes->>'mergedInto') IS NULL
        ORDER BY md5(o.id::text) LIMIT 6`));
    }
    for (const o of negs) {
      const c = cand('B0NEGATIVE', o.title, Number(o.price));
      const vo = jo(c), vn = jn(c);
      bump((neg.antes[key] ??= {}), cls(vo)); bump((neg.depois[key] ??= {}), cls(vn)); nNeg++;
      if (vn.border) bump(bordas.neg, `${key}:${vn.reason.slice(0, 60)}`);
      if (vn.outcome === 'accept' && falsosAceites.length < 60) falsosAceites.push({ master: r.name, titulo: `${o.title}  [produto real: ${o.mname}]`, antes: cls(vo), depois: cls(vn) });
    }
  }
  report.B_positivos = { n: nPos, ...pos };
  report.B_negativos = { n: nNeg, ...neg };
  report.B_falsos_aceites_depois = falsosAceites;
  report.B_bordas = bordas;
  report.B_novos_aceitos_positivos = novosAceitosPositivos;

  const sum = (o: Record<string, Record<string, number>>, f: (k: string) => boolean) => Object.values(o).reduce((a, d) => a + Object.entries(d).filter(([k]) => f(k)).reduce((x, [, n]) => x + n, 0), 0);
  const resume = (grp: typeof pos, n: number) => (['antes', 'depois'] as const).map((p) => ({
    fase: p, aceito: sum(grp[p], (k) => k === 'aceito'), fronteira_fila: sum(grp[p], (k) => k === 'fronteira_fila'), rascunho_duvida: sum(grp[p], (k) => k === 'rascunho_duvida'),
    recusa_cobertura: sum(grp[p], (k) => k.endsWith('cobertura_baixa')), recusa_outras: sum(grp[p], (k) => k.startsWith('recusa') && !k.endsWith('cobertura_baixa')), total: n,
  }));
  console.log('A) Ofertas Amazon ja gravadas, antes -> depois (status/departamento):');
  for (const [st, v] of Object.entries(A)) for (const [vt, d] of Object.entries(v)) console.log(`  ${st}/${vt}: ${JSON.stringify(d)}`);
  console.log('\nA) mudancas de veredito:', mudancas.length);
  for (const x of mudancas) console.log(`  [${x.status}/${x.vertical}] ${x.master.slice(0, 50)} | ${x.titulo.slice(0, 60)} | ${x.antes} -> ${x.depois} (${x.motivo})`);
  console.log(`\nB) positivos (titulos de outras lojas do MESMO produto), n=${nPos}:`); console.table(resume(pos, nPos));
  console.log('B) por departamento (positivos):');
  for (const p of ['antes', 'depois'] as const) for (const [v, d] of Object.entries(pos[p])) console.log(`  ${p} ${v}: ${JSON.stringify(d)}`);
  console.log(`\nB) negativos (OUTROS produtos da mesma marca/plataforma), n=${nNeg}:`); console.table(resume(neg, nNeg));
  console.log('B) motivos de fronteira (pos / neg):', JSON.stringify(bordas));
  console.log('B) aceitos entre negativos (iguais antes e depois quando o produto e duplicata de master ou a regra antiga ja errava):', falsosAceites.length);
  for (const f of falsosAceites) console.log('  ', JSON.stringify(f));
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

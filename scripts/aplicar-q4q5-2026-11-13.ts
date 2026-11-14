/**
 * Q4/Q5 (dono, 2026-11-13): promocao em lote de masters 'review' e porteiro nos games sem veredito. Reusa os criterios existentes
 * (carregarEAvaliar = aprovacao-nicho v3 / impressao3d; porteiro = src/lib/catalog/gate.ts). So grava master_products.attributes.catalogGate.
 *
 *   --fase nichos|games|games-review   (dry-run por padrao; --apply grava; --por "Nome" obrigatorio no apply)
 *   --rollback docs/backups/q4q5-<fase>-log-<ts>.json [--apply]
 * nichos: masters de departamento em 'review' -> 'approved' se aprovaveis ao vivo (marca+modelo+oferta clicavel, sem exigir GTIN, + regras
 *   inegociaveis ja embutidas: novo, nao miudo, sem duplicata, sem quarentena alta) E com marca cadastrada (BRAND/manufacturer/editora).
 * games: masters sem veredito -> porteiro (gate.ts + regra cross-gen de entrada). Grava o veredito (approved explicito, review ou rejected).
 * games-review: masters games em 'review' -> reavalia no porteiro; so promove os que hoje o porteiro aprova (preserva 'manual').
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { carregarEAvaliar } from './_aprovacao-plus-shared';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';
import { avaliarModelo } from '../src/lib/catalog/marca-linha';
import { evaluateCatalogGate, entryGateAttributes, toPersistedGate, type GateVerdict } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = argv.includes('--apply');
const fase = arg('--fase') ?? '';
const por = arg('--por');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const APPROVED_BY = 'bloco:q4q5:2026-11-13';
type Chg = { id: string; name: string; vertical: string; before: any; after: any; motivo?: string };
const pick = <T>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const sumBy = (c: Chg[], f: (x: Chg) => string) => c.reduce<Record<string, number>>((r, x) => { const k = f(x); r[k] = (r[k] ?? 0) + 1; return r; }, {});

async function planoNichos(sql: any) {
  const todos = (await carregarEAvaliar(sql)).filter((x) => x.verdictAntes === 'review');
  const marcas = await sql`SELECT id::text AS id, vertical, manufacturer, attributes->'vertical'->'catalogAttributes'->>'BRAND' AS brand, attributes->'vertical'->'catalogAttributes'->>'BOOK_PUBLISHER' AS pub, attributes->'vertical'->'catalogAttributes'->>'MODEL' AS model, attributes->'vertical'->'catalogAttributes'->>'LINE' AS line, mpn FROM master_products WHERE id = ANY(${todos.map((x) => x.id)}::uuid[])`;
  // Marca + modelo REAIS (dono: sem exigir GTIN). Marca >= 3 letras; modelo/part number nao pode ser 'desconhecido', so resolucao ('4K') nem nome de categoria.
  // Eletronicos/eletrodomesticos/tecnologia: o modelo (ou mpn) precisa de codigo com digito. Esporte aceita linha do fabricante. Livro: editora.
  const mk = new Map<string, string>(); // id -> '' (ok) | motivo
  const via = new Map<string, string>(); // id -> via do afrouxamento C5 (so os que antes ficavam como modelo_fraco)
  for (const r of marcas as any[]) {
    const marca = String(r.brand || r.manufacturer || r.pub || '').trim();
    const modelo = String(r.model || r.mpn || '').trim();
    const lin = String(r.line || '').trim();
    let motivo = '';
    if (marca.length < 3) motivo = 'sem_marca';
    else if (['eletroeletronicos', 'eletrodomesticos', 'tecnologia'].includes(r.vertical ?? '')) {
      // C5 (dono, 2026-11-14): modelo com digito OU marca reconhecida + linha OU codigo alfanumerico no titulo (src/lib/catalog/marca-linha.ts).
      const nome = String(todos.find((t) => t.id === r.id)?.name ?? '');
      const av = avaliarModelo({ marca, modelo: r.model, linha: r.line, mpn: r.mpn, nome });
      if (av.veredito !== 'ok') motivo = av.veredito === 'sem_marca' ? 'sem_marca' : 'modelo_fraco';
      else if (!(r.model || r.mpn) || !/\d/.test(modelo)) via.set(r.id, av.via);
    }
    mk.set(r.id, motivo);
  }
  const aprov: Chg[] = []; const fica: Chg[] = [];
  const now = new Date().toISOString();
  for (const x of todos) {
    const base = { id: x.id, name: x.name, vertical: x.vertical, before: x.gateAntes };
    if (x.destino === 'aprovar') {
      const mm = mk.get(x.id) ?? '';
      if (mm && x.vertical !== 'impressao3d' && !(mm === 'modelo_fraco' && x.vertical === 'livros')) { fica.push({ ...base, after: null, motivo: mm }); continue; }
      aprov.push({ ...base, after: { ...(x.gateAntes ?? {}), verdict: 'approved', approvedBy: APPROVED_BY, approvedAt: now, criteriaVersion: 3, previousVerdict: 'review', por: por ?? null }, motivo: via.get(x.id) ? `${x.origem}+c5:${via.get(x.id)}` : x.origem });
    } else fica.push({ ...base, after: null, motivo: (x.motivosV3.join('+') || x.destino) + (x.destino === 'fila' ? ' [fila]' : '') });
  }
  return { aprov, fica };
}

async function planoGames(sql: any, soReview: boolean) {
  const rows = await sql`
    WITH agg AS (SELECT o.master_product_id, array_agg(DISTINCT o.title) AS titles, count(*) AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY o.current_price_cents) FILTER (WHERE o.current_price_cents > 0) AS med,
        min(o.current_price_cents) FILTER (WHERE o.current_price_cents > 0) AS minp
      FROM affiliate_offers o WHERE o.status='active' GROUP BY 1)
    SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS product_type, m.game_format::text AS game_format, m.game_platform_gen::text AS gen,
           m.attributes->'catalogGate' AS gate, a.titles, a.med, a.minp, COALESCE(a.n,0)::int AS n
    FROM master_products m LEFT JOIN agg a ON a.master_product_id = m.id
    WHERE m.vertical='games' AND (m.attributes->>'mergedInto') IS NULL
      AND ${soReview ? sql`m.attributes->'catalogGate'->>'verdict' = 'review'` : sql`m.attributes->'catalogGate' IS NULL`}`;
  const now = new Date().toISOString();
  const aprov: Chg[] = []; const rej: Chg[] = []; const rev: Chg[] = [];
  for (const r of rows) {
    const manual: GateVerdict | null = r.gate?.manual === 'approved' || r.gate?.manual === 'rejected' ? r.gate.manual : null;
    const extra = { gameFormat: r.game_format, gamePlatformGen: r.gen, offerTitles: r.titles ?? [], medianPriceCents: r.med == null ? null : Number(r.med), manual };
    const g = entryGateAttributes(r.name, r.product_type, extra) as { catalogGate?: any };
    const res = evaluateCatalogGate({ name: r.name, productType: r.product_type, ...extra });
    let after = g.catalogGate ?? { ...toPersistedGate(res, now, manual), approvedBy: APPROVED_BY };
    // Guarda R-50 (item miudo: grip, cabo, capa, peca...): o porteiro sozinho nao pega todos; nunca promove miudo. 'sim' = rejeitado; 'ambiguo' = revisao.
    if (after.verdict === 'approved' && !manual) {
      const mi = avaliarItemMiudo(r.name, r.minp == null ? null : Number(r.minp), r.product_type, 'games');
      if (mi.veredito !== 'nao') after = { ...after, verdict: mi.veredito === 'sim' ? 'rejected' : 'review', category: 'out_of_scope', reason: `item_miudo:${mi.motivo}${mi.veredito === 'sim' ? '' : '_duvida'}`, matched: mi.termo, approvedBy: undefined };
    }
    const c: Chg = { id: r.id, name: r.name, vertical: 'games', before: r.gate, after, motivo: `${after.verdict}/${after.reason}` };
    // 'descoberta_duvida:*' (plataforma/tipo/formato desconhecido na descoberta): o porteiro reavalia so o titulo e NAO resolve a duvida; nunca promove.
    if (soReview && after.verdict === 'approved' && String(r.gate?.reason ?? '').startsWith('descoberta_duvida')) { rev.push({ ...c, motivo: `mantido/${r.gate.reason}` }); continue; }
    // Plataforma legada citada so por sigla curta (DS, 3DS, NDS, PSP...) que o porteiro nao le: vai a revisao, nunca a 'approved' automatico.
    if (after.verdict === 'approved' && !manual && /(n?ds|3ds|2ds|dsi|psp|psvita|gba|wii|ps ?[123]|xbox ?360|x360)/i.test(r.name) && !/(ps ?[45]|playstation ?[45]|xbox series|series [xs]|switch)/i.test(r.name)) {
      after = { ...after, verdict: 'review', category: 'unverified', reason: 'plataforma_legada_possivel_duvida', matched: 'sigla_legada', approvedBy: undefined };
      c.after = after; c.motivo = 'review/plataforma_legada_possivel_duvida'; rev.push(c); continue;
    }
    if (after.verdict === 'approved') aprov.push(c); else if (after.verdict === 'rejected') rej.push(c); else rev.push(c);
  }
  return { aprov, rej, rev, n: rows.length };
}

async function main() {
  const sql = connect();
  try {
    const rb = arg('--rollback');
    if (rb) return await rollback(sql, rb);
    if (APPLY && !por) throw new Error('--apply exige --por');
    let alvo: Chg[]; let fica: Chg[] = [];
    if (fase === 'nichos') { const p = await planoNichos(sql); alvo = p.aprov; fica = p.fica; }
    else if (fase === 'games' || fase === 'games-review') {
      const p = await planoGames(sql, fase === 'games-review');
      console.log(`masters avaliados: ${p.n}`);
      alvo = fase === 'games' ? [...p.aprov, ...p.rev, ...p.rej] : p.aprov; fica = fase === 'games-review' ? [...p.rev, ...p.rej] : [];
      console.log('Resultado do porteiro por veredito/motivo:', JSON.stringify(sumBy([...p.aprov, ...p.rev, ...p.rej], (x) => x.motivo ?? '')));
    } else throw new Error('--fase nichos|games|games-review');
    console.log(`\nFASE ${fase} | ${APPLY ? 'APPLY' : 'DRY-RUN'} | a gravar: ${alvo.length} | ficam como estao: ${fica.length}`);
    console.log('A gravar por vertical:veredito:', JSON.stringify(sumBy(alvo, (x) => x.vertical + ':' + x.after.verdict)));
    if (fica.length) console.log('Ficam por motivo:', JSON.stringify(sumBy(fica, (x) => x.vertical + ':' + x.motivo)));
    console.log('\nAMOSTRA 15 a gravar:'); for (const x of pick(alvo, 15)) console.log(`  [${x.vertical}] ${x.after.verdict} ${x.motivo ?? ''} | ${x.name.slice(0, 95)}`);
    console.log('AMOSTRA 15 ficam:'); for (const x of pick(fica, 15)) console.log(`  [${x.vertical}] ${x.motivo} | ${x.name.slice(0, 95)}`);
    if (!APPLY) return void console.log('\nDRY-RUN: nada escrito.');
    if (!alvo.length) return void console.log('nada');
    fs.mkdirSync(DIR, { recursive: true });
    const ids = alvo.map((x) => x.id);
    const completos: any[] = [];
    for (let i = 0; i < ids.length; i += 1000) completos.push(...(await sql`SELECT * FROM master_products WHERE id = ANY(${ids.slice(i, i + 1000)}::uuid[])`));
    const nd = path.join(DIR, `q4q5-${fase}-${stamp}.ndjson`);
    fs.writeFileSync(nd, completos.map((r) => JSON.stringify({ id: r.id, catalogGateBefore: r.attributes?.catalogGate ?? null, row: r })).join('\n') + '\n');
    const logFile = path.join(DIR, `q4q5-${fase}-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ status: 'pending', fase, stamp, por, approvedBy: APPROVED_BY, backup: path.relative(process.cwd(), nd), changes: alvo.map((x) => ({ id: x.id, name: x.name, vertical: x.vertical, before: x.before, after: x.after })) }, null, 1));
    let n = 0;
    // Lotes pequenos, cada um na sua transacao (a tabela tem gatilhos e escritores concorrentes; lote grande estoura o timeout). O log ja guarda tudo e o rollback e por linha.
    const guard = fase === 'games' ? sql`AND m.attributes->'catalogGate' IS NULL` : sql`AND m.attributes->'catalogGate'->>'verdict' = 'review'`;
    for (let i = 0; i < alvo.length; i += 40) {
      const lote = alvo.slice(i, i + 40).map((x) => ({ id: x.id, g: x.after }));
      await sql.begin(async (tx: any) => {
        await tx`SET LOCAL statement_timeout = '120s'`;
        const r = await tx`UPDATE master_products m SET attributes = jsonb_set(m.attributes, '{catalogGate}', v.g, true), updated_at = now()
          FROM jsonb_to_recordset(${tx.json(lote)}::jsonb) AS v(id uuid, g jsonb) WHERE m.id = v.id AND (m.attributes->>'mergedInto') IS NULL ${guard}`;
        n += r.count;
      });
      if ((i / 40) % 10 === 0) console.log(`  ...${i + lote.length}/${alvo.length} (gravados ${n})`);
    }
    const lg = JSON.parse(fs.readFileSync(logFile, 'utf8')); lg.status = 'applied'; lg.gravados = n; fs.writeFileSync(logFile, JSON.stringify(lg, null, 1));
    console.log(`APLICADO: ${n}. Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logFile)}`);
    console.log(`ROLLBACK: npx tsx --env-file=.env.local scripts/aplicar-q4q5-2026-11-13.ts --rollback ${path.relative(process.cwd(), logFile)} --apply`);
  } finally { await sql.end(); }
}

async function rollback(sql: any, file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as { fase: string; changes: Chg[] };
  // dry-run (--amostra N, padrao 40): aplica o rollback de N masters dentro de uma transacao e a DESFAZ (prova o comando sem segurar locks por minutos).
  const lim = APPLY ? log.changes.length : Number(arg('--amostra') ?? 40);
  console.log(`ROLLBACK ${APPLY ? '(APPLY)' : `(dry-run, amostra de ${lim})`} de ${log.changes.length} masters (${log.fase})`);
  let n = 0;
  for (let i = 0; i < Math.min(lim, log.changes.length); i += 40) {
    const lote = log.changes.slice(i, Math.min(i + 40, lim));
    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      for (const c of lote) {
        // so reverte quem ainda esta com o veredito que ESTE bloco gravou (nao pisa em decisao posterior)
        const cond = tx`AND attributes->'catalogGate'->>'approvedBy' IS NOT DISTINCT FROM ${c.after.approvedBy ?? null} AND attributes->'catalogGate'->>'verdict' = ${c.after.verdict} AND attributes->'catalogGate'->>'reason' IS NOT DISTINCT FROM ${c.after.reason ?? null}`;
        const r = c.before
          ? await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(c.before)}::jsonb, true), updated_at = now() WHERE id = ${c.id} ${cond}`
          : await tx`UPDATE master_products SET attributes = attributes - 'catalogGate', updated_at = now() WHERE id = ${c.id} ${cond}`;
        n += r.count;
      }
      if (!APPLY) throw new Error('__dry__');
    }).catch((e: Error) => { if (e.message !== '__dry__') throw e; });
  }
  console.log(`${APPLY ? 'revertidos' : 'reverteria (transacao desfeita)'}: ${n}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

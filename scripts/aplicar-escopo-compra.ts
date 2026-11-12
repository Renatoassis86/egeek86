/**
 * ESCOPO DE COMPRA REAL das lojas Plus (ata do Conselho 2026-11-12): DRY-RUN + APLICAR + REVERTER da marca de exibição
 * `master_products.attributes.vertical.foraDeEscopo`. Padrão de aplicar-aprovacao-plus.ts.
 *
 *   # 1) DRY-RUN (padrão): só SELECT. Imprime contagens por loja/tipo, exemplos e checagens, e grava o plano em docs/backups/.
 *   npx tsx --env-file=.env.local scripts/aplicar-escopo-compra.ts [--so esporte,livros] [--exemplos 5]
 *   # 2) APLICAR (só o dono; exige --por; plano com até 24 h)
 *   npx tsx --env-file=.env.local scripts/aplicar-escopo-compra.ts --plano docs/backups/escopo-compra-plano-<ts>.json --apply --por "Nome"
 *   # 3) REVERTER
 *   npx tsx --env-file=.env.local scripts/aplicar-escopo-compra.ts --rollback docs/backups/aplicar-escopo-compra-log-<ts>.json [--apply]
 *
 * O QUE GRAVA (e nada além disso): attributes.vertical.foraDeEscopo = { motivo, tipo, versaoRegra, em, precoMedianoCents, revisao } nos masters
 * do plano; e REMOVE a marca de quem passou a estar dentro do escopo. Nunca apaga master, nunca toca porteiro (catalogGate), ofertas, cotações,
 * histórico nem updated_at. O master continua aprovado, coletado, no dedup e pesquisável; só as vitrines/faixas/mensagens o ignoram
 * (flag PLUS_ESCOPO_VITRINE=0 desliga os leitores sem tocar no banco).
 * SEGURANÇA: backup NDJSON (valor anterior da marca de cada master) + log JSON ANTES; uma transação; erro = rollback automático.
 * REVERSÃO: restaura o valor anterior só dos masters cuja marca ainda é a gravada por este lote (mesmo `em`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql } from './_dup-shared';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
import { escopoCompra, mediana, VERSAO_REGRA_ESCOPO, pisoCents, EXCECAO_PISO_OFERTAS, EXCECAO_PISO_VENDEDORES, type MarcaForaEscopo, type MotivoForaEscopo } from '../src/lib/catalog/escopo-compra';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const DEPTS = ['eletroeletronicos', 'eletrodomesticos', 'tecnologia', 'esporte', 'impressao3d', 'livros'] as const;
const REDES = ['mercado-livre', 'shopee'];
/** Tipos que a ata manda NUNCA marcar (checagem negativa). */
const PROTEGIDOS: Array<[string, string]> = [
  ['eletroeletronicos', 'smart-tv'], ['eletrodomesticos', 'geladeira-freezer'], ['tecnologia', 'notebook'],
  ['impressao3d', 'impressoras'], ['impressao3d', 'filamentos'], ['impressao3d', 'resinas'], ['livros', 'rpg'], ['livros', 'hq-manga'],
];

interface Avaliado {
  id: string; name: string; vertical: string; tipo: string; precoCents: number | null; nOfertas: number; nVendedores: number; maxVendas: number;
  dentro: boolean; motivo: MotivoForaEscopo | null; revisao: boolean; reentradaR4: boolean; marcaAtual: MarcaForaEscopo | null;
}

async function avaliarTudo(sql: Sql, soDepts: Set<string> | null): Promise<Avaliado[]> {
  await sql`SET statement_timeout = '200s'`;
  const depts = DEPTS.filter((d) => !soDepts || soDepts.has(d));
  const masters = await sql<{ id: string; name: string; vertical: string; marca: MarcaForaEscopo | null }[]>`
    SELECT m.id::text AS id, m.name, m.vertical, m.attributes -> 'vertical' -> 'foraDeEscopo' AS marca
    FROM master_products m
    WHERE m.vertical IN ${sql([...depts])} AND (m.attributes ->> 'mergedInto') IS NULL
      AND (m.attributes -> 'catalogGate' ->> 'verdict' = 'approved' OR m.attributes -> 'catalogGate' ->> 'manual' = 'approved')
      AND COALESCE(m.attributes -> 'catalogGate' ->> 'manual', '') <> 'rejected'`;
  const ofertas = await sql<{ mid: string; price: string | number; seller: string; vendas: string | number | null }[]>`
    SELECT o.master_product_id::text AS mid, o.current_price_cents AS price, COALESCE(o.seller_id::text, o.id::text) AS seller, s.total_sales AS vendas
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND n.slug IN ${sql(REDES)}
      AND o.vertical IN ${sql([...depts])}`;
  const byM = new Map<string, Array<(typeof ofertas)[number]>>();
  for (const o of ofertas) (byM.get(o.mid) ?? byM.set(o.mid, []).get(o.mid)!).push(o);

  // 1a passada: preço mediano e tipo por master; mediana do tipo por loja.
  const base = masters.map((m) => {
    const of = byM.get(m.id) ?? [];
    const preco = mediana(of.map((o) => Number(o.price)));
    return {
      m, tipo: classificarTipo(m.vertical, m.name), preco, nOfertas: of.length, nVendedores: new Set(of.map((o) => o.seller)).size,
      maxVendas: of.reduce((a, o) => Math.max(a, Number(o.vendas ?? 0)), 0),
    };
  });
  const grupos = new Map<string, number[]>();
  for (const b of base) if (b.preco !== null) (grupos.get(`${b.m.vertical}|${b.tipo}`) ?? grupos.set(`${b.m.vertical}|${b.tipo}`, []).get(`${b.m.vertical}|${b.tipo}`)!).push(b.preco);
  const medTipo = new Map([...grupos].map(([k, v]) => [k, mediana(v)] as const));

  return base.map((b) => {
    const entrada = { departamento: b.m.vertical, tipo: b.tipo, precoMedianoCents: b.preco, nOfertas: b.nOfertas, nVendedores: b.nVendedores, maxVendasVendedor: b.maxVendas, medianaTipoCents: medTipo.get(`${b.m.vertical}|${b.tipo}`) ?? null };
    const r = escopoCompra(entrada);
    const piso = pisoCents(b.m.vertical, b.tipo);
    const reentradaR4 = r.dentro && piso !== null && b.preco !== null && b.preco < piso && b.nOfertas >= EXCECAO_PISO_OFERTAS && b.nVendedores >= EXCECAO_PISO_VENDEDORES;
    return { id: b.m.id, name: b.m.name, vertical: b.m.vertical, tipo: b.tipo, precoCents: b.preco, nOfertas: b.nOfertas, nVendedores: b.nVendedores, maxVendas: b.maxVendas,
      dentro: r.dentro, motivo: r.motivo, revisao: r.revisao, reentradaR4, marcaAtual: b.m.marca ?? null };
  });
}

const brl = (c: number | null) => (c === null ? '-' : `R$${(c / 100).toFixed(2).replace('.', ',')}`);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '0%');

async function main() {
  const rollback = arg('--rollback');
  if (rollback) return doRollback(rollback);
  const por = arg('--por');
  if (APPLY && !por) throw new Error('--apply exige --por "<quem aprovou>"');
  const planFile = arg('--plano');
  if (APPLY && !planFile) throw new Error('--apply exige --plano <arquivo gerado pelo dry-run>');
  const so = arg('--so') ? new Set(arg('--so')!.split(',')) : null;
  const nEx = Number(arg('--exemplos') ?? 4);
  const sql = connect();
  try {
    const plano = planFile ? (JSON.parse(fs.readFileSync(path.resolve(planFile), 'utf8')) as { geradoEm: string; versaoRegra: number; marcar: Array<{ id: string }>; desmarcar: Array<{ id: string }> }) : null;
    const idadeH = plano ? (Date.now() - Date.parse(plano.geradoEm)) / 3_600_000 : 0;
    if (APPLY && plano && idadeH > 24) throw new Error(`plano com ${idadeH.toFixed(1)} h (> 24 h): rode o dry-run de novo`);
    if (plano && plano.versaoRegra !== VERSAO_REGRA_ESCOPO) throw new Error(`plano da regra v${plano.versaoRegra}, código na v${VERSAO_REGRA_ESCOPO}`);

    const todos = await avaliarTudo(sql, so);
    // Marcar: fora do escopo e (sem marca, ou marca de outro motivo/versão). Desmarcar: tem marca e agora está dentro.
    const mudou = (a: Avaliado) => !a.marcaAtual || a.marcaAtual.motivo !== a.motivo || a.marcaAtual.versaoRegra !== VERSAO_REGRA_ESCOPO;
    let marcar = todos.filter((a) => !a.dentro && mudou(a));
    let desmarcar = todos.filter((a) => a.dentro && a.marcaAtual);
    if (plano) { // o plano é só a lista candidata; vale a reavaliação ao vivo
      const ids = new Set([...plano.marcar, ...plano.desmarcar].map((x) => x.id));
      marcar = marcar.filter((a) => ids.has(a.id)); desmarcar = desmarcar.filter((a) => ids.has(a.id));
    }
    const foraTodos = todos.filter((a) => !a.dentro);

    console.log(`\nModo: ${APPLY ? 'APPLY' : 'DRY-RUN (somente leitura)'} | regra v${VERSAO_REGRA_ESCOPO} | masters Plus aprovados avaliados: ${todos.length}`);
    console.log('\n== POR LOJA (marcados fora de escopo / aprovados; meta: <5% por loja, <10% total) ==');
    for (const d of DEPTS) {
      const t = todos.filter((a) => a.vertical === d); const f = t.filter((a) => !a.dentro);
      if (!t.length) continue;
      const motivos: Record<string, number> = {}; for (const a of f) motivos[a.motivo!] = (motivos[a.motivo!] ?? 0) + 1;
      const r4 = t.filter((a) => a.reentradaR4).length;
      console.log(`${d.padEnd(18)} ${String(f.length).padStart(4)} / ${String(t.length).padEnd(4)} = ${pct(f.length, t.length).padStart(6)}  motivos ${JSON.stringify(motivos)}  reentram por R4: ${r4}  anomalias(revisão): ${f.filter((a) => a.revisao).length}`);
    }
    console.log(`TOTAL              ${String(foraTodos.length).padStart(4)} / ${String(todos.length).padEnd(4)} = ${pct(foraTodos.length, todos.length).padStart(6)}`);

    console.log('\n== POR LOJA E TIPO (marcados / total do tipo) ==');
    const tipos = new Map<string, { n: number; f: number }>();
    for (const a of todos) { const k = `${a.vertical}/${a.tipo}`; const x = tipos.get(k) ?? { n: 0, f: 0 }; x.n++; if (!a.dentro) x.f++; tipos.set(k, x); }
    for (const [k, x] of [...tipos].filter(([, x]) => x.f > 0).sort((a, b) => b[1].f - a[1].f)) console.log(`${k.padEnd(40)} ${x.f} / ${x.n}`);

    console.log(`\n== EXEMPLOS MARCADOS (até ${nEx} por tipo) ==`);
    const porTipo = new Map<string, Avaliado[]>();
    for (const a of foraTodos) (porTipo.get(`${a.vertical}/${a.tipo}`) ?? porTipo.set(`${a.vertical}/${a.tipo}`, []).get(`${a.vertical}/${a.tipo}`)!).push(a);
    for (const [k, v] of [...porTipo].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`[${k}]`);
      for (const a of v.slice(0, nEx)) console.log(`   ${brl(a.precoCents).padStart(11)} | ${a.nOfertas} of ${a.nVendedores} vend | ${a.motivo} | ${a.name.slice(0, 70)}`);
    }

    console.log('\n== CHECAGEM NEGATIVA (tipos que NÃO podem ser marcados) ==');
    let violou = 0;
    for (const [d, t] of PROTEGIDOS) {
      const s = todos.filter((a) => a.vertical === d && a.tipo === t); const f = s.filter((a) => !a.dentro);
      if (f.length) violou += f.length;
      console.log(`${(d + '/' + t).padEnd(34)} total ${String(s.length).padStart(4)}  marcados ${f.length}${f.length ? '  <<< ATENÇÃO' : ''}`);
      for (const a of f.slice(0, 5)) console.log(`      ${brl(a.precoCents)} | ${a.motivo} | ${a.name.slice(0, 70)}`);
    }
    console.log(violou ? `ATENÇÃO: ${violou} master(s) em tipo protegido seriam marcados.` : 'OK: nenhum item de tipo protegido seria marcado.');
    const semPreco = todos.filter((a) => a.precoCents === null).length;
    console.log(`\nMasters aprovados sem oferta ativa (não decididos, ficam dentro): ${semPreco}`);
    console.log(`PLANO: marcar ${marcar.length} | desmarcar ${desmarcar.length} (marca anterior que não vale mais)`);

    fs.mkdirSync(DIR, { recursive: true });
    if (!APPLY) {
      const pf = path.join(DIR, `escopo-compra-plano-${stamp}.json`);
      const lin = (a: Avaliado) => ({ id: a.id, name: a.name, vertical: a.vertical, tipo: a.tipo, motivo: a.motivo, precoMedianoCents: a.precoCents, nOfertas: a.nOfertas, nVendedores: a.nVendedores });
      fs.writeFileSync(pf, JSON.stringify({ geradoEm: new Date().toISOString(), versaoRegra: VERSAO_REGRA_ESCOPO, marcar: marcar.map(lin), desmarcar: desmarcar.map(lin) }, null, 2));
      console.log(`\nDRY-RUN: nada foi escrito no banco. Plano: ${path.relative(process.cwd(), pf)}`);
      console.log(`Aplicar: npx tsx --env-file=.env.local scripts/aplicar-escopo-compra.ts --plano ${path.relative(process.cwd(), pf)} --apply --por "<nome>"`);
      return;
    }
    if (violou) throw new Error('há item de tipo protegido na lista; revise a regra antes de aplicar');
    if (!marcar.length && !desmarcar.length) return void console.log('Nada a aplicar.');

    const em = new Date().toISOString();
    const nd = path.join(DIR, `aplicar-escopo-compra-${stamp}.ndjson`);
    const alvo = [...marcar, ...desmarcar];
    fs.writeFileSync(nd, alvo.map((a) => JSON.stringify({ id: a.id, name: a.name, vertical: a.vertical, marcaAnterior: a.marcaAtual })).join('\n') + '\n');
    const logFile = path.join(DIR, `aplicar-escopo-compra-log-${stamp}.json`);
    const log: Record<string, unknown> = { status: 'pending', stamp, por, em, versaoRegra: VERSAO_REGRA_ESCOPO, planFile: path.relative(process.cwd(), path.resolve(planFile!)), backup: path.relative(process.cwd(), nd),
      marcados: marcar.map((a) => ({ id: a.id, marcaAnterior: a.marcaAtual })), desmarcados: desmarcar.map((a) => ({ id: a.id, marcaAnterior: a.marcaAtual })) };
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

    let nM = 0; let nD = 0;
    await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      for (const a of marcar) {
        const marca: MarcaForaEscopo = { motivo: a.motivo!, tipo: a.tipo, versaoRegra: VERSAO_REGRA_ESCOPO, em, precoMedianoCents: a.precoCents, revisao: a.revisao };
        const r = await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{vertical}', COALESCE(attributes -> 'vertical', '{}'::jsonb) || jsonb_build_object('foraDeEscopo', ${tx.json(marca as never)}::jsonb), true)
                           WHERE id = ${a.id}::uuid AND (attributes ->> 'mergedInto') IS NULL`;
        nM += r.count;
      }
      for (const a of desmarcar) {
        const r = await tx`UPDATE master_products SET attributes = attributes #- '{vertical,foraDeEscopo}' WHERE id = ${a.id}::uuid`;
        nD += r.count;
      }
    });
    log.status = 'applied'; log.nMarcados = nM; log.nDesmarcados = nD;
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    console.log(`\nAPLICADO: ${nM} marcado(s), ${nD} desmarcado(s). Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logFile)}`);
    console.log(`Reverter: npx tsx --env-file=.env.local scripts/aplicar-escopo-compra.ts --rollback ${path.relative(process.cwd(), logFile)} --apply`);
  } finally {
    await sql.end();
  }
}

async function doRollback(file: string) {
  const l = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as { stamp: string; em: string; marcados: Array<{ id: string; marcaAnterior: unknown }>; desmarcados: Array<{ id: string; marcaAnterior: unknown }> };
  const sql = connect();
  try {
    const todos = [...l.marcados, ...l.desmarcados];
    console.log(`\nROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} do log ${l.stamp}: ${l.marcados.length} marcado(s), ${l.desmarcados.length} desmarcado(s)`);
    const atuais = todos.length ? await sql<{ id: string; em: string | null }[]>`SELECT id::text AS id, attributes -> 'vertical' -> 'foraDeEscopo' ->> 'em' AS em FROM master_products WHERE id IN ${sql(todos.map((c) => c.id))}` : [];
    const mapa = new Map(atuais.map((a) => [a.id, a.em]));
    // Marcados: só restaura quem ainda tem a marca deste lote. Desmarcados: só quem continua sem marca (não houve remarcação depois).
    const alvo = [...l.marcados.filter((c) => mapa.get(c.id) === l.em), ...l.desmarcados.filter((c) => (mapa.get(c.id) ?? null) === null)];
    console.log(`Restaurar ${alvo.length} master(s) ao valor anterior (os demais foram alterados depois e ficam como estão).`);
    if (!APPLY) return void console.log('Dry-run: nada escrito.');
    await sql.begin(async (tx) => {
      for (const c of alvo) {
        if (c.marcaAnterior) await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{vertical}', COALESCE(attributes -> 'vertical', '{}'::jsonb) || jsonb_build_object('foraDeEscopo', ${tx.json(c.marcaAnterior as never)}::jsonb), true) WHERE id = ${c.id}::uuid`;
        else await tx`UPDATE master_products SET attributes = attributes #- '{vertical,foraDeEscopo}' WHERE id = ${c.id}::uuid`;
      }
    });
    console.log('RESTAURADO.');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('FALHA:', e instanceof Error ? e.message : e);
  process.exit(1);
});

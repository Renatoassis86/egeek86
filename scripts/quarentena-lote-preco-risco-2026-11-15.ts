export {};
/**
 * QUARENTENA EM LOTE de preço implausível e título de risco (dono, 2026-11-15, decisão 3). SEM barreira de extração: o preço continua lido e
 * guardado em price_snapshots; a quarentena (affiliate_offers.quarantined_at) só tira a oferta da vitrine, das médias, das mensagens e da comissão.
 *
 *   # 1) DRY-RUN (padrão): só SELECT; lista por motivo; grava docs/backups/quarentena-lote-plano-<ts>.json
 *   npx tsx --env-file=.env.local scripts/quarentena-lote-preco-risco-2026-11-15.ts
 *   # 2) APLICAR (reavalia ao vivo; lotes de 100, transação curta com lock 3 s / statement 15 s; backup NDJSON + log JSON antes de gravar)
 *   npx tsx --env-file=.env.local scripts/quarentena-lote-preco-risco-2026-11-15.ts --apply --por "Nome"
 *   # 3) REVERTER (só quem ainda tem a marca gravada por este lote)
 *   npx tsx --env-file=.env.local scripts/quarentena-lote-preco-risco-2026-11-15.ts --rollback docs/backups/quarentena-lote-log-<ts>.json [--apply]
 *   # Extra: totais da comissão prevista do admin (mesma conta de admin-comissao.ts)
 *   npx tsx --env-file=.env.local scripts/quarentena-lote-preco-risco-2026-11-15.ts --comissao
 *
 * Regras: src/lib/pricing/plausibilidade-tipo.ts (preço por tipo + faixa 35%-300% da mediana com 3+ ofertas no master) e
 * src/lib/catalog/titulo-risco.ts (porteiro: destravado/modificado/réplica/paralelo...). Master com decisão humana (catalogGate.manual) NUNCA é
 * quarentenado por título (só listado); preço absurdo é erro de leitura e vale mesmo assim. Guarda otimista: só grava se a oferta segue ativa,
 * fora de quarentena e com o MESMO preço lido. Motivo em affiliate_offers.quarantine_reason (migration 0052) + log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarPrecoAbsoluto, avaliarPrecoRelativo } from '../src/lib/pricing/plausibilidade-tipo';
import { avaliarTituloRisco } from '../src/lib/catalog/titulo-risco';
import { acumular, comissaoOferta, resumir, type GrupoAgregado } from '../src/lib/admin-gestao/taxas-comissao';
import type { ProductType } from '../src/db/schema';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const MARCA = ' [lote 2026-11-15]';
const TAM_LOTE = 100;
const rs = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

type Sql = ReturnType<typeof connect>;
interface Oferta {
  id: string; master: string; titulo: string; masterNome: string; rede: string; loja: string | null; vertical: string; tipo: string; formato: string | null;
  preco: number; updatedAt: string; gate: { verdict?: string; manual?: string } | null;
}
interface Decisao { o: Oferta; motivo: string; termo?: string | null; classe: 'preco_absoluto' | 'preco_relativo' | 'titulo_risco' }

async function carregar(sql: Sql): Promise<Oferta[]> {
  await sql`SET statement_timeout = '90s'`;
  const rows = await sql<Record<string, unknown>[]>`
    SELECT o.id::text AS id, o.master_product_id::text AS master, o.title AS titulo, m.name AS master_nome, n.slug AS rede, o.store_name AS loja,
           o.vertical, m.product_type::text AS tipo, m.game_format::text AS formato, o.current_price_cents::bigint AS preco, o.updated_at::text AS updated_at,
           m.attributes -> 'catalogGate' AS gate
    FROM affiliate_offers o
    JOIN master_products m ON m.id = o.master_product_id
    JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND NOT (m.attributes ? 'mergedInto')`;
  return rows.map((r) => ({
    id: String(r.id), master: String(r.master), titulo: String(r.titulo), masterNome: String(r.master_nome), rede: String(r.rede), loja: (r.loja as string | null) ?? null,
    vertical: String(r.vertical), tipo: String(r.tipo), formato: (r.formato as string | null) ?? null, preco: Number(r.preco), updatedAt: String(r.updated_at),
    gate: (r.gate as Oferta['gate']) ?? null,
  }));
}

function decidir(ofertas: Oferta[]): { decisoes: Decisao[]; titulosProtegidos: Decisao[]; titulosJaFora: number } {
  const decisoes = new Map<string, Decisao>();
  // 1) absoluto
  for (const o of ofertas) {
    const m = avaliarPrecoAbsoluto({ priceCents: o.preco, vertical: o.vertical, productType: o.tipo, titulo: o.titulo });
    if (m) decisoes.set(o.id, { o, motivo: m, classe: 'preco_absoluto' });
  }
  // 2) relativo: referências = outras ofertas do master que NÃO foram marcadas no passo absoluto (3+ ofertas no master)
  const porMaster = new Map<string, Oferta[]>();
  for (const o of ofertas) {
    const l = porMaster.get(o.master) ?? [];
    l.push(o);
    porMaster.set(o.master, l);
  }
  for (const lista of porMaster.values()) {
    if (lista.length < 3) continue;
    for (const o of lista) {
      if (decisoes.has(o.id)) continue;
      const refs = lista.filter((x) => x.id !== o.id && !decisoes.has(x.id)).map((x) => x.preco);
      const m = avaliarPrecoRelativo(o.preco, refs);
      if (m) decisoes.set(o.id, { o, motivo: m, classe: 'preco_relativo' });
    }
  }
  // 3) título de risco (oferta ou master). Rejeitado pelo porteiro = já fora da vitrine (não conta); decisão humana = só listado.
  const titulosProtegidos: Decisao[] = [];
  let titulosJaFora = 0;
  const riscoMaster = new Map<string, ReturnType<typeof avaliarTituloRisco>>();
  for (const o of ofertas) {
    const ctx = { vertical: o.vertical, productType: o.tipo as ProductType, gameFormat: o.formato };
    if (!riscoMaster.has(o.master)) riscoMaster.set(o.master, avaliarTituloRisco(o.masterNome, ctx));
    const r = avaliarTituloRisco(o.titulo, ctx) ?? riscoMaster.get(o.master) ?? null;
    if (!r) continue;
    const d: Decisao = { o, motivo: r.motivo, termo: r.termo, classe: 'titulo_risco' };
    if (o.gate?.manual) { titulosProtegidos.push(d); continue; }
    // Master já rejeitado pelo porteiro: a oferta já está fora da vitrine, mas continua somando na comissão do admin e como referência; a quarentena a tira de vez (conta à parte).
    if (o.gate?.verdict === 'rejected') titulosJaFora++;
    if (!decisoes.has(o.id)) decisoes.set(o.id, d);
  }
  return { decisoes: [...decisoes.values()], titulosProtegidos, titulosJaFora };
}

async function medirComissao(sql: Sql) {
  const rows = await sql<Record<string, unknown>[]>`
    SELECT n.slug AS rede, m.vertical, (CASE WHEN m.vertical = 'games' THEN m.product_type::text END) AS tipo, COUNT(*)::int AS ofertas, SUM(o.current_price_cents)::bigint AS preco
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id JOIN master_products m ON m.id = o.master_product_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND NOT (m.attributes ? 'mergedInto')
    GROUP BY 1, 2, 3`;
  const total = new Map<string, GrupoAgregado>();
  for (const r of rows) {
    const c = comissaoOferta(String(r.rede), r.vertical as string, r.tipo as string | null, Number(r.preco));
    acumular(total, 'total', Number(r.preco), c.cents, c.confianca === 'estimada', Number(r.ofertas));
  }
  const t = resumir(total)[0];
  return { ofertas: t.ofertas, precoCents: t.precoCents, comissaoCents: t.comissaoCents, taxaMedia: t.taxaMedia };
}

async function main() {
  const sql = connect();
  try {
    if (flag('--comissao')) { console.log(JSON.stringify(await medirComissao(sql))); return; }
    if (arg('--rollback')) return await reverter(sql);
    const ofertas = await carregar(sql);
    const res = decidir(ofertas);
    const por: Record<string, number> = {};
    const porVert: Record<string, number> = {};
    for (const d of res.decisoes) {
      por[d.motivo] = (por[d.motivo] ?? 0) + 1;
      const k = `${d.o.vertical}/${d.o.tipo}`;
      porVert[k] = (porVert[k] ?? 0) + 1;
    }
    console.log(`Ofertas ativas fora de quarentena avaliadas: ${ofertas.length}`);
    console.log('A quarentenar por motivo:', JSON.stringify(por, null, 1));
    console.log('Por vertical/tipo:', JSON.stringify(porVert));
    console.log(`Total a quarentenar: ${res.decisoes.length}; título de risco com decisão humana (NÃO aplicado): ${res.titulosProtegidos.length}; dos quais já escondidos pelo porteiro (master rejeitado): ${res.titulosJaFora}`);
    const quar = new Set(res.decisoes.map((d) => d.o.id));
    const restantes = new Set<string>();
    for (const o of ofertas) if (!quar.has(o.id)) restantes.add(o.master);
    const mastersAfetados = new Set(res.decisoes.map((d) => d.o.master));
    const mastersSemOferta = [...mastersAfetados].filter((m) => !restantes.has(m));
    const gateMaster = new Map(ofertas.map((o) => [o.master, o.gate?.verdict] as const));
    const visiveisSem = mastersSemOferta.filter((m) => gateMaster.get(m) !== 'rejected').length;
    console.log(`Masters afetados: ${mastersAfetados.size}; masters que ficam SEM nenhuma oferta ativa: ${mastersSemOferta.length} (já escondidos pelo porteiro: ${mastersSemOferta.length - visiveisSem}; VISÍVEIS hoje que somem da vitrine: ${visiveisSem})`);
    const cat = (c: Decisao['classe']) => res.decisoes.filter((d) => d.classe === c).sort((a, b) => b.o.preco - a.o.preco);
    const linha = (d: Decisao) => `${rs(d.o.preco).padStart(16)} | ${d.o.rede.padEnd(8)} | ${d.o.vertical}/${d.o.tipo} | ${(d.o.loja ?? '-').slice(0, 22).padEnd(22)} | ${d.motivo}${d.termo ? ':' + d.termo : ''} | ${d.o.titulo.slice(0, 70)}`;
    console.log('\n== ABSOLUTO (todas) ==');
    for (const d of cat('preco_absoluto')) console.log(linha(d));
    console.log('\n== RELATIVO (45 maiores) ==');
    for (const d of cat('preco_relativo').slice(0, 45)) console.log(linha(d));
    console.log('\n== TÍTULO DE RISCO (40 primeiros) ==');
    for (const d of cat('titulo_risco').slice(0, 40)) console.log(linha(d));
    console.log('\n== TÍTULO DE RISCO com decisão humana (não aplicado) ==');
    for (const d of res.titulosProtegidos.slice(0, 20)) console.log(linha(d));
    fs.mkdirSync(DIR, { recursive: true });
    const plano = path.join(DIR, `quarentena-lote-plano-${stamp}.json`);
    fs.writeFileSync(plano, JSON.stringify({
      geradoEm: new Date().toISOString(), total: ofertas.length, por, porVert, mastersAfetados: mastersAfetados.size, mastersSemOferta: mastersSemOferta.length,
      decisoes: res.decisoes.map((d) => ({ id: d.o.id, preco: d.o.preco, motivo: d.motivo, termo: d.termo ?? null, classe: d.classe, titulo: d.o.titulo, rede: d.o.rede, loja: d.o.loja, vertical: d.o.vertical, tipo: d.o.tipo })),
      protegidos: res.titulosProtegidos.map((d) => ({ id: d.o.id, motivo: d.motivo, titulo: d.o.titulo })),
    }, null, 1));
    console.log(`\nPlano: ${path.relative(process.cwd(), plano)}`);
    const com = await medirComissao(sql);
    console.log('Comissão prevista ANTES:', JSON.stringify(com));
    if (!APPLY) { console.log('(DRY-RUN: nada foi gravado)'); return; }
    await aplicar(sql, res.decisoes, com);
  } finally {
    await sql.end();
  }
}

async function aplicar(sql: Sql, decisoes: Decisao[], comAntes: unknown) {
  const por = arg('--por');
  if (!por) throw new Error('--apply exige --por "Nome"');
  const col = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'affiliate_offers' AND column_name = 'quarantine_reason'`;
  if (col[0].n !== 1) throw new Error('coluna quarantine_reason ausente: aplique a migration 0052 (scripts/aplicar-migration-0052.ts --apply) antes');
  const em = new Date().toISOString();
  const ndjson = path.join(DIR, `quarentena-lote-backup-${stamp}.ndjson`);
  fs.writeFileSync(ndjson, decisoes.map((d) => JSON.stringify({ id: d.o.id, titulo: d.o.titulo, precoCents: d.o.preco, quarantined_at_antes: null, quarantine_reason_antes: null, updated_at_antes: d.o.updatedAt, motivo: d.motivo })).join('\n') + '\n');
  const logPath = path.join(DIR, `quarentena-lote-log-${stamp}.json`);
  const log = { em, por, marca: MARCA, backup: path.relative(process.cwd(), ndjson), comissaoAntes: comAntes, gravados: [] as Array<{ id: string; preco: number; motivo: string; updatedAtAntes: string }>, pulados: 0, concluido: false };
  const salvar = () => fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
  salvar();
  for (let i = 0; i < decisoes.length; i += TAM_LOTE) {
    const lote = decisoes.slice(i, i + TAM_LOTE);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '3s'`;
      await tx`SET LOCAL statement_timeout = '15s'`;
      for (const d of lote) {
        const motivo = d.motivo + MARCA;
        const r = await tx`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = ${motivo}, updated_at = now()
          WHERE id = ${d.o.id}::uuid AND status = 'active' AND quarantined_at IS NULL AND current_price_cents = ${d.o.preco}`;
        if (r.count === 1) log.gravados.push({ id: d.o.id, preco: d.o.preco, motivo, updatedAtAntes: d.o.updatedAt });
        else log.pulados++;
      }
    });
    salvar();
    await new Promise((r) => setTimeout(r, 500));
  }
  log.concluido = true;
  salvar();
  console.log(`APLICADO: ${log.gravados.length} quarentenadas, ${log.pulados} puladas (mudaram desde a leitura). Log: ${path.relative(process.cwd(), logPath)}`);
  console.log('Comissão prevista DEPOIS:', JSON.stringify(await medirComissao(sql)));
}

async function reverter(sql: Sql) {
  const logPath = path.resolve(arg('--rollback')!);
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8')) as { gravados: Array<{ id: string; motivo: string; updatedAtAntes: string }> };
  console.log(`${APPLY ? 'ROLLBACK' : 'DRY-RUN do rollback'}: ${log.gravados.length} ofertas no log`);
  if (!APPLY) { console.log('(nada gravado; use --apply)'); return; }
  let ok = 0, pulados = 0;
  for (let i = 0; i < log.gravados.length; i += TAM_LOTE) {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '3s'`;
      await tx`SET LOCAL statement_timeout = '15s'`;
      for (const g of log.gravados.slice(i, i + TAM_LOTE)) {
        const r = await tx`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = ${g.updatedAtAntes}::timestamptz
          WHERE id = ${g.id}::uuid AND quarantined_at IS NOT NULL AND quarantine_reason = ${g.motivo}`;
        if (r.count === 1) ok++; else pulados++;
      }
    });
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`Revertidas: ${ok}; puladas (marca já mudou): ${pulados}`);
}

main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });

/**
 * Decisão 3 do dono (2026-11-15): consolida o master duplicado "Impressora 3D Bambu Lab A1, Bivolt" (c928f7c3...) no master A1 correto
 * ("Impressora 3d Bambu Lab A1", 244ff7b2...). Tensão (110/220 V/bivolt) NÃO separa identidade: vira nota de variante em
 * `attributes.variantesTensao` do master canônico (sem barreira, sem mudar grupo, preço ou indicador).
 *
 *   DRY-RUN (padrão):  npx tsx --env-file=.env.local scripts/consolidar-a1-bivolt-2026-11-15.ts
 *   APLICAR:           ... --apply --por "Nome"   (uma transação curta; backup NDJSON + log JSON em docs/backups/)
 *   REVERTER:          ... --rollback docs/backups/consolidar-a1-log-<ts>.json [--apply]
 * Só move linhas das FKs de master_products do duplicado para o canônico (hoje: 1 oferta), arquiva o duplicado (`mergedInto`, sem DELETE)
 * e grava a nota de tensão. Guarda otimista: aborta se o duplicado já foi arquivado ou se o conjunto de linhas mudou desde a leitura.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, listMasterFks, type Tx } from './_dup-shared';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const POR = arg('--por') ?? '';
const ROLLBACK = arg('--rollback');
const DUP = 'c928f7c3-5444-4010-a704-01b691e6726e';
const CANON = '244ff7b2-ed6d-49c6-8a85-247c8dfc5515';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

/** Tensão pelo que o ANÚNCIO declara (título); nada inventado. 'nao_informada' = o título não diz 110 V, 220 V nem bivolt. */
function tensaoDoTitulo(t: string): 'bivolt' | '110v' | '220v' | 'nao_informada' {
  if (/bivolt|127\s*v\s*\/\s*220|110\s*v\s*(ou|\/)\s*220/i.test(t)) return 'bivolt';
  if (/\b(110|127)\s*v\b/i.test(t)) return '110v';
  if (/\b220\s*v\b/i.test(t)) return '220v';
  return 'nao_informada';
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (ROLLBACK) return await rollback(sql);
    const fks = await listMasterFks(sql);
    const ms = await sql<{ id: string; name: string; merged: string | null; vertical: string; tipo: string }[]>`
      SELECT id::text, name, attributes ->> 'mergedInto' AS merged, vertical, product_type::text AS tipo FROM master_products WHERE id IN (${DUP}::uuid, ${CANON}::uuid)`;
    const dup = ms.find((m) => m.id === DUP), canon = ms.find((m) => m.id === CANON);
    if (!dup || !canon) throw new Error('master não encontrado');
    if (dup.merged) throw new Error('duplicado já arquivado');
    if (canon.merged) throw new Error('canônico arquivado');
    if (dup.vertical !== canon.vertical || dup.tipo !== canon.tipo) throw new Error('vertical/tipo diferentes: não é duplicata');
    console.log(`duplicado: ${dup.name} | canônico: ${canon.name}`);
    const linhas: Record<string, string[]> = {};
    for (const fk of fks) {
      const k = `${fk.table}.${fk.column}`;
      const hasId = (await sql`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${fk.table} AND column_name='id'`).length > 0;
      if (!hasId) {
        const [{ n }] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM ${sql(fk.table)} WHERE ${sql(fk.column)} = ${DUP}`;
        if (Number(n)) throw new Error(`${k} sem coluna id com ${n} linhas: tratar à mão`);
        continue;
      }
      const r = await sql<{ id: string }[]>`SELECT id::text AS id FROM ${sql(fk.table)} WHERE ${sql(fk.column)} = ${DUP}`;
      if (r.length) linhas[k] = r.map((x) => x.id);
    }
    console.log('linhas a mover:', JSON.stringify(Object.fromEntries(Object.entries(linhas).map(([k, v]) => [k, v.length]))));
    const ofertas = await sql<{ id: string; store: string | null; title: string; ext: string | null }[]>`
      SELECT id::text, store_name AS store, title, external_ref AS ext FROM affiliate_offers WHERE master_product_id = ${DUP} OR (master_product_id = ${CANON} AND external_ref NOT LIKE 'MLB%')`;
    const nota = ofertas.map((o) => ({ offerId: o.id, ref: o.ext, loja: o.store ?? 'Amazon', titulo: o.title, tensao: tensaoDoTitulo(o.title), fonte: 'titulo_do_anuncio', em: new Date().toISOString() }));
    for (const n of nota) console.log(`  ${n.ref} | ${n.tensao} | ${n.titulo}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado.');
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');

    const bk = path.join(DIR, `consolidar-a1-${stamp}.ndjson`);
    const full = await sql`SELECT * FROM master_products WHERE id IN (${DUP}::uuid, ${CANON}::uuid)`;
    const offFull = await sql`SELECT * FROM affiliate_offers WHERE master_product_id = ${DUP}`;
    fs.writeFileSync(bk, [...full.map((r) => ({ tabela: 'master_products', row: r })), ...offFull.map((r) => ({ tabela: 'affiliate_offers', row: r }))].map((x) => JSON.stringify(x)).join('\n') + '\n');
    const antes = (await sql`SELECT count(*)::int n FROM affiliate_offers WHERE master_product_id = ${CANON}`)[0]!.n as number;

    await sql.begin(async (tx: Tx) => {
      await tx`SET LOCAL statement_timeout = '60s'`;
      await tx`SET LOCAL lock_timeout = '5s'`;
      await tx`SELECT id FROM master_products WHERE id IN (${DUP}::uuid, ${CANON}::uuid) FOR UPDATE`;
      const [chk] = await tx`SELECT attributes ->> 'mergedInto' AS m FROM master_products WHERE id = ${DUP}`;
      if (chk!.m) throw new Error('duplicado arquivado por outro processo');
      for (const [k, ids] of Object.entries(linhas)) {
        const [table, column] = k.split('.') as [string, string];
        const u = await tx`UPDATE ${tx(table)} SET ${tx(column)} = ${CANON} WHERE id = ANY(${ids}::uuid[]) AND ${tx(column)} = ${DUP}`;
        if (u.count !== ids.length) throw new Error(`guarda otimista: ${k} moveu ${u.count} de ${ids.length}`);
      }
      const [{ n }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM affiliate_offers WHERE master_product_id = ${DUP}`;
      if (Number(n) !== 0) throw new Error('restaram ofertas no duplicado');
      await tx`UPDATE master_products SET attributes = attributes || ${tx.json({ mergedInto: CANON, archived: true, mergedAt: new Date().toISOString(), mergedOfferIds: linhas['affiliate_offers.master_product_id'] ?? [], mergedBy: POR, motivo: 'duplicata do A1 (decisao 3 do dono, 2026-11-15)' })}, updated_at = now() WHERE id = ${DUP} AND (attributes ->> 'mergedInto') IS NULL`;
      await tx`UPDATE master_products SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{variantesTensao}', COALESCE(attributes -> 'variantesTensao', '[]'::jsonb) || ${tx.json(nota)}::jsonb, true), updated_at = now() WHERE id = ${CANON}`;
    });
    const depois = (await sql`SELECT count(*)::int n FROM affiliate_offers WHERE master_product_id = ${CANON}`)[0]!.n as number;
    const logFile = path.join(DIR, `consolidar-a1-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), por: POR, backup: path.basename(bk), dup: DUP, canon: CANON, movidas: linhas, nota, ofertasCanonAntes: antes, ofertasCanonDepois: depois, rollback: `npx tsx --env-file=.env.local scripts/consolidar-a1-bivolt-2026-11-15.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`GRAVADO. ofertas no canônico ${antes} -> ${depois} | backup ${path.relative(process.cwd(), bk)} | log ${path.relative(process.cwd(), logFile)}`);
  } finally { await sql.end(); }
}

async function rollback(sql: ReturnType<typeof connect>) {
  const log = JSON.parse(fs.readFileSync(path.resolve(ROLLBACK!), 'utf8')) as { dup: string; canon: string; movidas: Record<string, string[]>; nota: Array<{ offerId: string }> };
  console.log('a restaurar:', JSON.stringify(Object.fromEntries(Object.entries(log.movidas).map(([k, v]) => [k, v.length]))));
  if (!APPLY) return void console.log('DRY-RUN: use --apply');
  await sql.begin(async (tx: Tx) => {
    for (const [k, ids] of Object.entries(log.movidas)) {
      const [table, column] = k.split('.') as [string, string];
      await tx`UPDATE ${tx(table)} SET ${tx(column)} = ${log.dup} WHERE id = ANY(${ids}::uuid[]) AND ${tx(column)} = ${log.canon}`;
    }
    await tx`UPDATE master_products SET attributes = attributes - 'mergedInto' - 'archived' - 'mergedAt' - 'mergedOfferIds' - 'mergedBy' - 'motivo', updated_at = now() WHERE id = ${log.dup}`;
    const offerIds = log.nota.map((n) => n.offerId);
    await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{variantesTensao}', COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(attributes -> 'variantesTensao') e WHERE NOT ((e ->> 'offerId') = ANY(${offerIds}::text[]))), '[]'::jsonb), true) WHERE id = ${log.canon} AND attributes ? 'variantesTensao'`;
  });
  console.log('ROLLBACK aplicado.');
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
export {};

/**
 * RECLASSIFICAÇÃO DE MASTERS PARA A VERTICAL 'impressao3d' (2026-11-11). Move master_products E as ofertas deles (todas, ativas ou não)
 * de 'tecnologia' para 'impressao3d' NA MESMA TRANSAÇÃO, mantendo a regra o.vertical = m.vertical. Reversível. Não apaga nada.
 *
 *   npx tsx --env-file=.env.local scripts/reclassificar-impressao3d.ts                 # dry-run (padrão): só leitura
 *   npx tsx --env-file=.env.local scripts/reclassificar-impressao3d.ts --apply         # backup NDJSON + log + grava
 *   npx tsx --env-file=.env.local scripts/reclassificar-impressao3d.ts --rollback backup/logs/reclassificar-impressao3d-<ts>.json [--apply]
 *
 * Alvo: lista FIXA de masters revisada pelo dono (impressoras Bambu Lab). Impressora de papel (Epson/HP) nunca entra: a lista é nominal
 * e o script confere que o nome diz "3d" e a vertical atual é 'tecnologia' antes de mover.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const ALVO = [
  '04804f96-ed95-4fa3-90be-bb818706c0a9', // Impressora 3d - Bambu Lab A1 Combo
  '23bfa05b-053e-46cc-8308-7d4332fadf18', // Impressora 3d Bambu Lab P1s Combo
  '244ff7b2-ed6d-49c6-8a85-247c8dfc5515', // Impressora 3d Bambu Lab A1
];
const DE = 'tecnologia';
const PARA = 'impressao3d';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const rbIdx = argv.indexOf('--rollback');
const rollbackPath = rbIdx >= 0 ? argv[rbIdx + 1] : undefined;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DADOS = path.resolve(process.cwd(), 'backup', 'dados');
const LOGS = path.resolve(process.cwd(), 'backup', 'logs');
const logTxt = path.join(LOGS, `reclassificar-impressao3d-${stamp}.log`);
function log(msg: string) {
  console.log(msg);
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(logTxt, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

type Sql = ReturnType<typeof connect>;

async function main() {
  const sql = connect();
  try {
    if (rollbackPath) return await rollback(sql);
    const masters = await sql<Array<{ id: string; name: string; vertical: string }>>`SELECT id, name, vertical FROM master_products WHERE id IN ${sql(ALVO)}`;
    const ofertas = await sql<Array<{ id: string; master_product_id: string; vertical: string; status: string }>>`SELECT id, master_product_id, vertical, status FROM affiliate_offers WHERE master_product_id IN ${sql(ALVO)}`;
    log(`reclassificar-impressao3d: modo=${APPLY ? 'APPLY' : 'DRY-RUN'} ${DE} -> ${PARA}; masters achados=${masters.length}/${ALVO.length}; ofertas=${ofertas.length} (ativas=${ofertas.filter((o) => o.status === 'active').length})`);
    for (const m of masters) log(`  master ${m.id} | ${m.vertical} | ${m.name}`);
    const erros: string[] = [];
    if (masters.length !== ALVO.length) erros.push('algum master da lista não existe');
    for (const m of masters) {
      if (m.vertical !== DE) erros.push(`${m.id} já está em ${m.vertical} (esperado ${DE})`);
      if (!/\b3d\b/i.test(m.name)) erros.push(`${m.id} não diz 3d no nome: ${m.name}`);
    }
    for (const o of ofertas) if (o.vertical !== DE) erros.push(`oferta ${o.id} está em ${o.vertical} (esperado ${DE})`);
    if (erros.length) throw new Error(`pré-condição falhou: ${erros.join('; ')}`);
    if (!APPLY) return void log('DRY-RUN: nada foi escrito no banco.');

    fs.mkdirSync(DADOS, { recursive: true });
    const nd = path.join(DADOS, `reclassificar-impressao3d-${stamp}.ndjson`);
    const mAll = await sql`SELECT * FROM master_products WHERE id IN ${sql(ALVO)}`;
    const oAll = await sql`SELECT * FROM affiliate_offers WHERE master_product_id IN ${sql(ALVO)}`;
    fs.writeFileSync(nd, [...mAll.map((r) => JSON.stringify({ table: 'master_products', row: r })), ...oAll.map((r) => JSON.stringify({ table: 'affiliate_offers', row: r }))].join('\n') + '\n');
    const logJson = path.join(LOGS, `reclassificar-impressao3d-${stamp}.json`);
    fs.writeFileSync(logJson, JSON.stringify({ stamp, de: DE, para: PARA, backup: path.relative(process.cwd(), nd), masters: ALVO, ofertas: ofertas.map((o) => o.id) }, null, 2));
    const res = await sql.begin(async (tx) => {
      const m = await tx`UPDATE master_products SET vertical = ${PARA}, updated_at = now() WHERE id IN ${tx(ALVO)} AND vertical = ${DE}`;
      const o = await tx`UPDATE affiliate_offers SET vertical = ${PARA}, updated_at = now() WHERE master_product_id IN ${tx(ALVO)} AND vertical = ${DE}`;
      if (m.count !== ALVO.length || o.count !== ofertas.length) throw new Error(`contagem inesperada (masters ${m.count}/${ALVO.length}, ofertas ${o.count}/${ofertas.length}); transação desfeita`);
      const bad = await tx`SELECT count(*)::int n FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id WHERE o.vertical <> m.vertical AND m.id IN ${tx(ALVO)}`;
      if (bad[0].n !== 0) throw new Error('inconsistência o.vertical <> m.vertical; transação desfeita');
      return { masters: m.count, ofertas: o.count };
    });
    log(`APLICADO: masters=${res.masters} ofertas=${res.ofertas}. Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logJson)}`);
    log(`Reverter: npx tsx --env-file=.env.local scripts/reclassificar-impressao3d.ts --rollback ${path.relative(process.cwd(), logJson)} --apply`);
  } finally {
    await sql.end();
  }
}

async function rollback(sql: Sql) {
  const l = JSON.parse(fs.readFileSync(path.resolve(rollbackPath as string), 'utf8')) as { stamp: string; de: string; para: string; masters: string[]; ofertas: string[] };
  log(`ROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} ${l.para} -> ${l.de} do log ${l.stamp}: masters=${l.masters.length} ofertas=${l.ofertas.length}`);
  if (!APPLY) return;
  const res = await sql.begin(async (tx) => {
    const m = await tx`UPDATE master_products SET vertical = ${l.de}, updated_at = now() WHERE id IN ${tx(l.masters)} AND vertical = ${l.para}`;
    const o = await tx`UPDATE affiliate_offers SET vertical = ${l.de}, updated_at = now() WHERE master_product_id IN ${tx(l.masters)} AND vertical = ${l.para}`;
    return { masters: m.count, ofertas: o.count };
  });
  log(`RESTAURADO: masters=${res.masters} ofertas=${res.ofertas}.`);
}

main().catch((e) => {
  log(`FALHA: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

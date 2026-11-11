/**
 * RE-CHAVEIA masters de impressora 3D que ja existem para a chave por FAMILIA (cor junta), 2026-11-11.
 * Muda SO attributes -> vertical -> identityKey (guarda a anterior em identityKeyAnterior). Reversivel. Nao toca em ofertas.
 *
 *   npx tsx --env-file=.env.local scripts/rechavear-impressao3d.ts                  # dry-run (padrao)
 *   npx tsx --env-file=.env.local scripts/rechavear-impressao3d.ts --apply          # backup NDJSON + log + grava
 *   npx tsx --env-file=.env.local scripts/rechavear-impressao3d.ts --rollback backup/logs/rechavear-impressao3d-<ts>.json [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { chaveImpressora3d } from '../src/lib/catalog/vertical/i3d-fields';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const rbIdx = argv.indexOf('--rollback');
const rollbackPath = rbIdx >= 0 ? argv[rbIdx + 1] : undefined;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DADOS = path.resolve(process.cwd(), 'backup', 'dados');
const LOGS = path.resolve(process.cwd(), 'backup', 'logs');
const logTxt = path.join(LOGS, `rechavear-impressao3d-${stamp}.log`);
function log(msg: string) {
  console.log(msg);
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(logTxt, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

async function main() {
  const sql = connect();
  try {
    if (rollbackPath) {
      const l = JSON.parse(fs.readFileSync(path.resolve(rollbackPath), 'utf8')) as { stamp: string; changes: Array<{ id: string; antes: string | null; depois: string }> };
      log(`ROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} do log ${l.stamp}: ${l.changes.length} master(s)`);
      if (!APPLY) return;
      await sql.begin(async (tx) => {
        for (const c of l.changes) {
          await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{vertical,identityKey}', to_jsonb(${c.antes}::text), true), updated_at = now() WHERE id = ${c.id} AND attributes -> 'vertical' ->> 'identityKey' = ${c.depois}`;
        }
      });
      return void log('RESTAURADO.');
    }
    const rows = await sql<Array<{ id: string; name: string; brand: string | null; model: string | null; ikey: string | null }>>`
      SELECT id, name, attributes -> 'vertical' -> 'catalogAttributes' ->> 'BRAND' AS brand, attributes -> 'vertical' -> 'catalogAttributes' ->> 'MODEL' AS model,
             attributes -> 'vertical' ->> 'identityKey' AS ikey
      FROM master_products WHERE vertical = 'impressao3d' AND attributes -> 'vertical' ->> 'segment' = 'impressora-3d' AND (attributes ->> 'mergedInto') IS NULL`;
    const changes = rows
      .map((r) => ({ id: r.id, name: r.name, antes: r.ikey, depois: chaveImpressora3d(r.brand, r.name, r.model) }))
      .filter((c): c is { id: string; name: string; antes: string | null; depois: string } => c.depois != null && c.depois !== c.antes);
    log(`rechavear-impressao3d: modo=${APPLY ? 'APPLY' : 'DRY-RUN'} masters=${rows.length} a_rechavear=${changes.length}`);
    for (const c of changes) log(`  ${c.name} | ${c.antes} -> ${c.depois}`);
    const porChave = new Map<string, string[]>();
    for (const c of changes) porChave.set(c.depois, [...(porChave.get(c.depois) ?? []), c.id]);
    for (const [k, ids] of porChave) if (ids.length > 1) throw new Error(`dois masters existentes cairiam na mesma chave (${k}): ${ids.join(', ')}; resolver antes (fusao e decisao do dono)`);
    if (!APPLY || changes.length === 0) return void log(APPLY ? 'Nada a mudar.' : 'DRY-RUN: nada foi escrito.');
    fs.mkdirSync(DADOS, { recursive: true });
    const nd = path.join(DADOS, `rechavear-impressao3d-${stamp}.ndjson`);
    const full = await sql`SELECT * FROM master_products WHERE id IN ${sql(changes.map((c) => c.id))}`;
    fs.writeFileSync(nd, full.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const logJson = path.join(LOGS, `rechavear-impressao3d-${stamp}.json`);
    fs.writeFileSync(logJson, JSON.stringify({ stamp, backup: path.relative(process.cwd(), nd), changes }, null, 2));
    await sql.begin(async (tx) => {
      for (const c of changes) {
        await tx`UPDATE master_products
                 SET attributes = jsonb_set(jsonb_set(attributes, '{vertical,identityKeyAnterior}', to_jsonb(${c.antes}::text), true), '{vertical,identityKey}', to_jsonb(${c.depois}::text), true),
                     updated_at = now()
                 WHERE id = ${c.id}`;
      }
    });
    log(`APLICADO: ${changes.length} master(s). Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logJson)}`);
    log(`Reverter: npx tsx --env-file=.env.local scripts/rechavear-impressao3d.ts --rollback ${path.relative(process.cwd(), logJson)} --apply`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  log(`FALHA: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

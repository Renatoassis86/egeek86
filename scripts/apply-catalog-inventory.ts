/**
 * Migration 0040 (catalog_inventory_snapshots) - aditiva, com rollback.
 *   npx tsx --env-file=.env.local scripts/apply-catalog-inventory.ts            # dry-run (so informa se a tabela existe)
 *   npx tsx --env-file=.env.local scripts/apply-catalog-inventory.ts --apply    # cria a tabela (idempotente)
 *   npx tsx --env-file=.env.local scripts/apply-catalog-inventory.ts --rollback # remove a tabela de historico
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function main() {
  const sql = connect();
  try {
    const t = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='catalog_inventory_snapshots'`;
    console.log('Tabela catalog_inventory_snapshots existe:', t[0].n === 1);
    if (!APPLY && !ROLLBACK) return void console.log('DRY-RUN: use --apply ou --rollback.');
    const file = ROLLBACK ? '0040_catalog_inventory_snapshots.rollback.sql' : '0040_catalog_inventory_snapshots.sql';
    await sql.begin(async (tx) => { await tx.unsafe(fs.readFileSync(path.join(dir, file), 'utf8')); });
    console.log(ROLLBACK ? 'rollback feito' : 'tabela criada');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

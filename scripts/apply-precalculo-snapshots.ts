/**
 * Aplica a migration 0022 (tabelas derivadas product_price_stats e showcase_snapshot).
 *   npx tsx --env-file=.env.local scripts/apply-precalculo-snapshots.ts            # dry-run (só confere)
 *   npx tsx --env-file=.env.local scripts/apply-precalculo-snapshots.ts --apply    # cria as tabelas
 *   npx tsx --env-file=.env.local scripts/apply-precalculo-snapshots.ts --rollback # derruba as duas tabelas (derivadas)
 * Aditiva e reversível: só CREATE TABLE/INDEX IF NOT EXISTS; nenhuma tabela existente é alterada.
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
    const have = await sql<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('product_price_stats', 'showcase_snapshot')`;
    console.log('Tabelas já existentes:', have.map((r) => r.t).join(', ') || '(nenhuma)');
    const file = ROLLBACK ? '0022_snapshots_precalculados.rollback.sql' : '0022_snapshots_precalculados.sql';
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!APPLY && !ROLLBACK) {
      console.log(`DRY-RUN: executaria ${file}. Use --apply.`);
      return;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
    });
    const after = await sql<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('product_price_stats', 'showcase_snapshot')`;
    console.log(`${file} executado. Tabelas agora:`, after.map((r) => r.t).join(', ') || '(nenhuma)');
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Aplica a migration 0024 (tabelas derivadas price_daily_offer, price_daily_state e price_min_events).
 *   npx tsx --env-file=.env.local scripts/apply-price-daily.ts            # dry-run (só confere)
 *   npx tsx --env-file=.env.local scripts/apply-price-daily.ts --apply    # cria as tabelas
 *   npx tsx --env-file=.env.local scripts/apply-price-daily.ts --rollback # derruba as tres tabelas (derivadas)
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
      WHERE table_schema = 'public' AND table_name IN ('price_daily_offer', 'price_daily_state', 'price_min_events')`;
    console.log('Tabelas já existentes:', have.map((r) => r.t).join(', ') || '(nenhuma)');
    const file = ROLLBACK ? '0024_price_daily_state.rollback.sql' : '0024_price_daily_state.sql';
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
      WHERE table_schema = 'public' AND table_name IN ('price_daily_offer', 'price_daily_state', 'price_min_events')`;
    console.log(`${file} executado. Tabelas agora:`, after.map((r) => r.t).join(', ') || '(nenhuma)');
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Aplica a migration 0075 (R-118: tabela oferta_verificacao_viva). ADITIVA e reversivel; tabela vazia nasce sem reescrever nada.
 *   npx tsx --env-file=.env.local scripts/apply-verificacao-viva.ts                    # dry-run
 *   npx tsx --env-file=.env.local scripts/apply-verificacao-viva.ts --apply
 *   npx tsx --env-file=.env.local scripts/apply-verificacao-viva.ts --rollback --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sql = connect();
  try {
    const t = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'oferta_verificacao_viva'`;
    console.log('Estado:', JSON.stringify({ tabela: t[0].n === 1 }));
    if (!APPLY) return void console.log('DRY-RUN: use --apply ou --rollback --apply.');
    const arq = ROLLBACK ? '0075_oferta_verificacao_viva.rollback.sql' : '0075_oferta_verificacao_viva.sql';
    const ddl = fs.readFileSync(path.resolve(process.cwd(), 'drizzle/migrations', arq), 'utf8');
    if (ROLLBACK && t[0].n === 1) {
      const out = path.resolve(process.cwd(), 'backup/dados', `verificacao-viva-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, (await sql`SELECT * FROM oferta_verificacao_viva`).map((r) => JSON.stringify(r)).join('\n'));
      console.log('backup em', out);
    }
    for (let i = 1; i <= 6; i++) {
      try { await sql.begin(async (tx) => { await tx.unsafe(ddl); }); console.log(`${arq} aplicada (tentativa ${i}).`); return; }
      catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (!/lock timeout|canceling statement|deadlock/i.test(msg) || i === 6) throw e;
        await esperar(1500 * i);
      }
    }
  } finally { await sql.end({ timeout: 5 }); }
}
main().catch((e) => { console.error(String((e as Error)?.message ?? e).slice(0, 300)); process.exit(1); });

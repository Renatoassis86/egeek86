/**
 * Aplica a migration 0042 (fila de classificacao: identity_decisions + identity_review_items).
 *   npx tsx --env-file=.env.local scripts/apply-fila-classificacao.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-fila-classificacao.ts --apply    # aplica (transacao unica)
 *   npx tsx --env-file=.env.local scripts/apply-fila-classificacao.ts --rollback # desfaz (remove as duas tabelas)
 * Aditiva e reversivel. NAO rodar sem aprovacao do dono. Sem --apply/--rollback nada e escrito.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function estado(sql: ReturnType<typeof connect>) {
  const t = await sql<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('identity_decisions', 'identity_review_items')`;
  return { tabelas: t.map((x) => x.t).sort() };
}

async function main() {
  const sql = connect();
  try {
    console.log('Estado atual:', JSON.stringify(await estado(sql)));
    const file = ROLLBACK ? '0042_fila_classificacao.rollback.sql' : '0042_fila_classificacao.sql';
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!APPLY && !ROLLBACK) {
      console.log(`DRY-RUN: executaria ${file}. Use --apply (ou --rollback).`);
      return;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
    });
    console.log(`${file} executado. Estado agora:`, JSON.stringify(await estado(sql)));
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

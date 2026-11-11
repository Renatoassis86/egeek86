/**
 * Aplica a migration 0043 (evidencia da API oficial na fila: api_evidence, api_checked_at, decided_via).
 *   npx tsx --env-file=.env.local scripts/apply-fila-evidencia-api.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-fila-evidencia-api.ts --apply    # aplica (transacao unica)
 *   npx tsx --env-file=.env.local scripts/apply-fila-evidencia-api.ts --rollback # desfaz (remove as colunas)
 * Aditiva e reversivel. Depende da 0042. NAO rodar sem aprovacao do dono. Sem --apply/--rollback nada e escrito.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function estado(sql: ReturnType<typeof connect>) {
  const t = await sql<{ t: string; c: string }[]>`
    SELECT table_name AS t, column_name AS c FROM information_schema.columns
    WHERE table_schema = 'public' AND ((table_name = 'identity_review_items' AND column_name IN ('api_evidence', 'api_checked_at')) OR (table_name = 'identity_decisions' AND column_name = 'decided_via'))`;
  return { colunas: t.map((x) => `${x.t}.${x.c}`).sort() };
}

async function main() {
  const sql = connect();
  try {
    console.log('Estado atual:', JSON.stringify(await estado(sql)));
    const file = ROLLBACK ? '0043_fila_evidencia_api.rollback.sql' : '0043_fila_evidencia_api.sql';
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

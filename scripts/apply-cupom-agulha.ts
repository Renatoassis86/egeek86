/**
 * Aplica a migration 0041 (coupon_consults.miss_reason + indice).
 *   npx tsx --env-file=.env.local scripts/apply-cupom-agulha.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-cupom-agulha.ts --apply    # aplica (transacao unica)
 *   npx tsx --env-file=.env.local scripts/apply-cupom-agulha.ts --rollback # desfaz
 * Aditiva e reversivel. NAO rodar sem aprovacao do dono. Sem --apply/--rollback nada e escrito.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function estado(sql: ReturnType<typeof connect>) {
  const cols = await sql<{ c: string }[]>`
    SELECT column_name AS c FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupon_consults' AND column_name = 'miss_reason'`;
  const base = await sql<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupon_consults'`;
  return { coupon_consults_existe: base.length > 0, miss_reason_existe: cols.length > 0 };
}

async function main() {
  const sql = connect();
  try {
    console.log('Estado atual:', JSON.stringify(await estado(sql)));
    const file = ROLLBACK ? '0041_cupom_agulha.rollback.sql' : '0041_cupom_agulha.sql';
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

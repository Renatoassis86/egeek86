/**
 * Aplica a migration 0049 (offer_coupon_reads.coupon_name e coupon_code).
 *   npx tsx --env-file=.env.local scripts/apply-cupom-nome.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-cupom-nome.ts --apply    # aplica (transacao unica)
 *   npx tsx --env-file=.env.local scripts/apply-cupom-nome.ts --rollback # desfaz
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
    WHERE table_schema = 'public' AND table_name = 'offer_coupon_reads' AND column_name IN ('coupon_name', 'coupon_code')`;
  const base = await sql<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'offer_coupon_reads'`;
  return { offer_coupon_reads_existe: base.length > 0, colunas_nome_codigo: cols.length };
}

async function main() {
  const sql = connect();
  try {
    console.log('Estado atual:', JSON.stringify(await estado(sql)));
    const file = ROLLBACK ? '0049_cupom_nome.rollback.sql' : '0049_cupom_nome.sql';
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

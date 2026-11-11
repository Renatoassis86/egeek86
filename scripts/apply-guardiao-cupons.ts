/**
 * Aplica a migration 0037 (coupon_announcements, coupon_consults).
 *   npx tsx --env-file=.env.local scripts/apply-guardiao-cupons.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-guardiao-cupons.ts --apply    # aplica (transacao unica)
 *   npx tsx --env-file=.env.local scripts/apply-guardiao-cupons.ts --rollback # desfaz
 * Aditiva e reversivel. NAO rodar sem aprovacao do dono. Sem --apply/--rollback nada e escrito.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function estado(sql: ReturnType<typeof connect>) {
  const tabs = await sql<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('coupon_announcements','coupon_consults')`;
  return { tabelas: tabs.map((r) => r.t) };
}

async function main() {
  const sql = connect();
  try {
    console.log('Estado atual:', JSON.stringify(await estado(sql)));
    const file = ROLLBACK ? '0037_guardiao_cupons.rollback.sql' : '0037_guardiao_cupons.sql';
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

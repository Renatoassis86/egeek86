/**
 * Aplica a migration 0026 (affiliate_offers.external_item_id + indice unico parcial).
 *   npx tsx --env-file=.env.local scripts/apply-offer-external-item-id.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-offer-external-item-id.ts --apply    # aplica (transacao unica)
 *   npx tsx --env-file=.env.local scripts/apply-offer-external-item-id.ts --rollback # desfaz
 * Aditiva e reversivel. NAO rodar sem aprovacao do dono e sem backup. Sem --apply/--rollback nada e escrito.
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
    WHERE table_schema = 'public' AND table_name = 'affiliate_offers' AND column_name = 'external_item_id'`;
  const idx = await sql<{ i: string }[]>`
    SELECT indexname AS i FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'affiliate_offers' AND indexname = 'affiliate_offers_network_item_uq'`;
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM affiliate_offers`;
  return { colunas: cols.map((r) => r.c), indices: idx.map((r) => r.i), ofertas: n };
}

async function main() {
  const sql = connect();
  try {
    console.log('Estado atual:', JSON.stringify(await estado(sql)));
    const file = ROLLBACK ? '0026_offer_external_item_id.rollback.sql' : '0026_offer_external_item_id.sql';
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

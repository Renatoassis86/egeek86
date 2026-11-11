/**
 * Aplica as migrations 0034 (shopee_campaigns) e 0035 (coupon_items aceita source_kind 'manual_dono'; exige a 0029 aplicada).
 *   npx tsx --env-file=.env.local scripts/apply-campanhas.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-campanhas.ts --apply    # aplica (uma transacao por migration)
 *   npx tsx --env-file=.env.local scripts/apply-campanhas.ts --rollback # desfaz (0035 apaga os codigos do dono; 0034 apaga a tabela)
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
    WHERE table_schema = 'public' AND table_name IN ('coupon_items','coupon_reads','shopee_campaigns')`;
  const chk = await sql<{ def: string }[]>`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'coupon_items_srckind_chk'`;
  return { tabelas: tabs.map((r) => r.t), source_kind_aceita_manual_dono: chk.some((r) => r.def.includes('manual_dono')) };
}

async function main() {
  const sql = connect();
  try {
    const e0 = await estado(sql);
    console.log('Estado atual:', JSON.stringify(e0));
    if (APPLY && !ROLLBACK && !e0.tabelas.includes('coupon_items')) throw new Error('coupon_items ausente: aplique antes a 0029 (scripts/apply-coupons.ts).');
    // Rollback na ordem inversa.
    const files = ROLLBACK ? ['0036_coupon_manual_dono.rollback.sql', '0034_shopee_campaigns.rollback.sql'] : ['0034_shopee_campaigns.sql', '0036_coupon_manual_dono.sql'];
    if (!APPLY && !ROLLBACK) {
      console.log(`DRY-RUN: executaria ${files.join(' e ')}. Use --apply (ou --rollback).`);
      return;
    }
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
      });
      console.log(`${file} executado.`);
    }
    console.log('Estado agora:', JSON.stringify(await estado(sql)));
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

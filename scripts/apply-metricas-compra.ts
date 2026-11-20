/** Aplica a migracao 0071 (metricas de compra: 6 colunas aditivas em affiliate_offers) numa transacao, com antes/depois e retry de lock. npx tsx --env-file=.env.local scripts/apply-metricas-compra.ts [--apply] */
import fs from 'node:fs';
import postgres from 'postgres';
const APPLY = process.argv.includes('--apply');
(async () => {
  const sqlText = fs.readFileSync('drizzle/migrations/0071_metricas_compra.sql', 'utf8');
  const q = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1, prepare: false });
  const existe = async () => (await q`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='affiliate_offers' AND column_name IN ('installments_qty','installment_cents','installments_no_interest','installments_seen_at','free_shipping','shipping_seen_at')`)[0].n;
  console.log('ANTES', await existe());
  if (!APPLY) { console.log('dry-run: nada aplicado (use --apply)'); await q.end(); return; }
  for (let t = 1; ; t++) {
    try { await q.begin(async (tx) => { await tx.unsafe("SET LOCAL lock_timeout = '8s'"); await tx.unsafe(sqlText); }); break; } catch (e) {
      if (t >= 10 || !/lock timeout|deadlock/i.test(String((e as Error).message))) throw e;
      console.log(`tentativa ${t}: lock/deadlock, repetindo em 15 s`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  console.log('DEPOIS', await existe(), '(colunas de 6)');
  await q.end();
})().catch((e) => { console.error(String(e.message ?? e).slice(0, 400)); process.exit(1); });

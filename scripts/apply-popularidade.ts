/** Aplica a migracao 0067 (offer_popularity) numa transacao, com antes/depois e retry de lock. npx tsx --env-file=.env.local scripts/apply-popularidade.ts [--apply] */
import fs from 'node:fs';
import postgres from 'postgres';
const APPLY = process.argv.includes('--apply');
(async () => {
  const sqlText = fs.readFileSync('drizzle/migrations/0067_offer_popularity.sql', 'utf8');
  const q = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1, prepare: false });
  const existe = async () => (await q`SELECT to_regclass('public.offer_popularity')::text AS t`)[0].t;
  console.log('ANTES', await existe());
  if (!APPLY) { console.log('dry-run: nada aplicado (use --apply)'); await q.end(); return; }
  for (let t = 1; ; t++) {
    try { await q.begin(async (tx) => { await tx.unsafe(sqlText); }); break; } catch (e) {
      if (t >= 10 || !/lock timeout|deadlock/i.test(String((e as Error).message))) throw e;
      console.log(`tentativa ${t}: lock/deadlock, repetindo em 15 s`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  console.log('DEPOIS', await existe(), JSON.stringify(await q`SELECT relrowsecurity FROM pg_class WHERE relname='offer_popularity'`));
  await q.end();
})().catch((e) => { console.error(String(e.message ?? e).slice(0, 400)); process.exit(1); });

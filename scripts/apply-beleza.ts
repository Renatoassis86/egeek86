/** Aplica a migracao 0066 (vertical beleza) numa transacao, com antes/depois. npx tsx --conditions=react-server --env-file=.env.local scripts/apply-beleza.ts [--apply] */
import fs from 'node:fs';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
(async () => {
  const sqlText = fs.readFileSync('drizzle/migrations/0066_vertical_beleza.sql', 'utf8');
  const q = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1, prepare: false });
  const cons = async () => (await q`SELECT conrelid::regclass::text t, conname, left(pg_get_constraintdef(oid), 150) d FROM pg_constraint WHERE conname IN ('master_products_vertical_chk','affiliate_offers_vertical_chk','store_section_verticals_vertical_check') OR (conrelid = 'store_section_verticals'::regclass AND contype = 'c')`);
  console.log('ANTES', JSON.stringify(await cons()));
  if (!APPLY) { console.log('dry-run: nada aplicado (use --apply)'); await q.end(); return; }
  // ALTER TABLE espera lock: com o ciclo de mensagens e a coleta rodando, 5 s as vezes nao basta. Tenta de novo (a transacao inteira volta a cada falha).
  for (let t = 1; ; t++) {
    try { await q.begin(async (tx) => { await tx.unsafe(sqlText); }); break; } catch (e) {
      if (t >= 10 || !/lock timeout|deadlock/i.test(String((e as Error).message))) throw e;
      console.log(`tentativa ${t}: lock/deadlock, repetindo em 15 s`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  console.log('DEPOIS', JSON.stringify(await cons()));
  console.log('loja', JSON.stringify(await q`SELECT s.slug, s.stage, s.telegram_chat_title, v.vertical FROM store_sections s LEFT JOIN store_section_verticals v ON v.store_id = s.id WHERE s.slug = 'beleza'`));
  await q.end();
})().catch((e) => { console.error(String(e.message ?? e).slice(0, 400)); process.exit(1); });

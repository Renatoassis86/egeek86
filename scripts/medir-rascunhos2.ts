/** Leitura: rascunhos dentro das medias diarias e master misto Mario Kart. */
import { connect } from './_dup-shared';
async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      console.table(await tx`SELECT s.day::text AS day, count(*)::int AS produtos_afetados, count(DISTINCT o.id)::int AS rascunhos_nos_members
        FROM price_daily_state s CROSS JOIN LATERAL jsonb_object_keys(COALESCE(s.members,'{}'::jsonb)) k(id)
        JOIN affiliate_offers o ON o.id = k.id::uuid AND o.status='draft' WHERE s.day >= '2026-11-01' GROUP BY 1 ORDER BY 1`);
      console.table(await tx`SELECT o.id::text AS offer, o.status::text, (o.seller_id IS NULL) ph, left(o.title,60) titulo, m.game_format::text fmt, left(m.name,40) master, o.master_product_id::text mid
        FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id WHERE o.status='draft' AND (m.name ILIKE '%mario kart%' OR o.title ILIKE '%mario kart%')`);
      console.table(await tx`SELECT o.status::text, (o.seller_id IS NULL) ph, left(o.title,60) titulo FROM affiliate_offers o WHERE o.master_product_id='7ac4d8d5' OR o.master_product_id::text LIKE '7ac4d8d5%' ORDER BY 1`);
      console.table(await tx`SELECT g.status::text gate, count(*)::int FROM master_products g WHERE g.id::text LIKE '7ac4d8d5%' GROUP BY 1`);
    });
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

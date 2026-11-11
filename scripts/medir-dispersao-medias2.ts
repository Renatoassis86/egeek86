import { connect } from './_dup-shared';
(async () => {
  const sql = connect();
  console.table(await sql`SELECT m.vertical, count(*)::int n, count(DISTINCT m.id)::int masters, min(o.current_price_cents/100) mn, max(o.current_price_cents/100) mx
    FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id WHERE o.status='active' AND o.current_price_cents>=100000000 GROUP BY 1`);
  console.table(await sql`WITH a AS (SELECT o.master_product_id id, o.current_price_cents::float8 p FROM affiliate_offers o WHERE o.status='active' AND o.current_price_cents>0),
   med AS (SELECT id, count(*) n, percentile_cont(0.5) WITHIN GROUP (ORDER BY p) md FROM a GROUP BY id HAVING count(*)>=3)
   SELECT count(*)::int ofertas_gt5x_mediana, count(DISTINCT a.id)::int masters FROM a JOIN med USING(id) WHERE a.p>5*md`);
  await sql.end();
})();

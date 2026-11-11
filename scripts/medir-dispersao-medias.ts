// SOMENTE SELECT. Dispersão das ofertas ativas por master (qualquer vertical). Sem escrita.
import { connect } from './_dup-shared';
(async () => {
  const sql = connect();
  const rows = await sql`
    WITH a AS (
      SELECT m.vertical, m.product_type::text AS pt, m.id, o.current_price_cents::float8/100 AS p
      FROM master_products m JOIN affiliate_offers o ON o.master_product_id=m.id
      WHERE o.status='active' AND o.current_price_cents>0),
    s AS (
      SELECT vertical, pt, id, count(*) n, min(p) mn, max(p) mx,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY p) q1,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY p) med,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY p) q3, avg(p) av
      FROM a GROUP BY 1,2,3 HAVING count(*)>=3),
    t AS (
      SELECT s.*, mx/mn AS ratio, (q3-q1)/NULLIF(med,0) AS iqr_rel,
        (SELECT count(*) FROM a WHERE a.id=s.id AND a.p > q3+1.5*(q3-q1)) AS hi_out,
        abs(av/med-1) AS mean_med
      FROM s)
    SELECT vertical, pt, count(*)::int masters, sum(n)::int ofertas,
      count(*) FILTER (WHERE ratio>2)::int r_gt2, count(*) FILTER (WHERE ratio>3)::int r_gt3,
      count(*) FILTER (WHERE iqr_rel>0.5)::int iqr_gt50, count(*) FILTER (WHERE hi_out>0)::int c_outlier,
      sum(hi_out)::int ofertas_fora_cerca, count(*) FILTER (WHERE mean_med>0.1)::int media_vs_mediana_gt10,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio)::numeric,2) ratio_med
    FROM t GROUP BY 1,2 ORDER BY ofertas DESC`;
  console.table(rows);
  const top = await sql`
    WITH a AS (SELECT m.id, left(m.name,60) nm, m.vertical, o.current_price_cents::float8/100 p FROM master_products m JOIN affiliate_offers o ON o.master_product_id=m.id WHERE o.status='active' AND o.current_price_cents>0)
    SELECT vertical, nm, count(*)::int n, min(p) mn, max(p) mx, round((max(p)/min(p))::numeric,1) ratio FROM a GROUP BY id,nm,vertical HAVING count(*)>=10 ORDER BY max(p)/min(p) DESC LIMIT 12`;
  console.table(top);
  await sql.end();
})();

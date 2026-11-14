import { connect } from './_dup-shared';
(async () => {
  const sql = connect();
  try {
    const r = await sql`SELECT m.vertical, COALESCE(m.attributes->'catalogGate'->>'verdict','(sem)') v, (m.attributes->'catalogGate'->>'reason' = 'semeadura_vertical_aguardando_conferencia') semeadura, count(*)::int n,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id=m.id AND o.status='active'))::int com_oferta
      FROM master_products m WHERE (m.attributes->>'mergedInto') IS NULL GROUP BY 1,2,3 ORDER BY 1,2,3`;
    console.table(r);
    const vis = await sql`SELECT m.vertical, count(*)::int ofertas_ativas_visiveis FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id
      WHERE o.status='active' AND (m.attributes->>'mergedInto') IS NULL AND COALESCE(m.attributes->'catalogGate'->>'verdict','approved')='approved' GROUP BY 1 ORDER BY 1`;
    console.table(vis);
  } finally { await sql.end(); }
})();

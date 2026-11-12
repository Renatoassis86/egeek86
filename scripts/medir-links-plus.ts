/** Cobertura de link oficial (meli.la / Shopee) das ofertas frescas das lojas Plus (somente leitura). */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
async function main() {
  const rows = await db.execute(sql`
    SELECT m.vertical AS loja, n.slug AS rede, count(*) AS ofertas,
      count(*) FILTER (WHERE o.affiliate_link_pending OR (n.slug='mercado-livre' AND COALESCE(o.affiliate_url,'') NOT LIKE 'https://meli.la/%')) AS sem_link,
      count(DISTINCT o.master_product_id) AS masters,
      count(DISTINCT o.master_product_id) FILTER (WHERE NOT (o.affiliate_link_pending OR (n.slug='mercado-livre' AND COALESCE(o.affiliate_url,'') NOT LIKE 'https://meli.la/%'))) AS masters_com_link
    FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id JOIN affiliate_networks n ON n.id=o.network_id
    WHERE o.status='active' AND o.quarantined_at IS NULL AND o.current_price_cents>0 AND o.last_price_confirmed_at >= now() - interval '3 hours'
      AND m.vertical IN ('livros','eletrodomesticos','eletroeletronicos','esporte','tecnologia','impressao3d')
    GROUP BY 1,2 ORDER BY 1,2`);
  console.table(rows.map((r) => ({ ...r })));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Medicao SOMENTE LEITURA dos rascunhos (status 'draft'). npx tsx --conditions=react-server --env-file=.env.local scripts/medir-rascunhos.ts */
import { connect } from './_dup-shared';
async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      console.log('== por status/rede/placeholder');
      console.table(await tx`SELECT o.status::text AS status, n.slug AS rede, (o.seller_id IS NULL) AS placeholder, count(*)::int AS ofertas,
        count(*) FILTER (WHERE o.last_checked_at > now() - interval '24 hours')::int AS checadas_24h,
        count(*) FILTER (WHERE o.quarantined_at IS NOT NULL)::int AS quarentena
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id WHERE o.status IN ('draft','active') GROUP BY 1,2,3 ORDER BY 2,1,3`);
      console.log('== rascunhos: motivo (titulo suspeito) e idade');
      console.table(await tx`SELECT count(*)::int AS rascunhos,
        count(*) FILTER (WHERE o.master_product_id IN (SELECT master_product_id FROM affiliate_offers WHERE status='active'))::int AS em_master_com_ativa,
        count(*) FILTER (WHERE o.created_at > now() - interval '7 days')::int AS criados_7d,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM affiliate_price_snapshots s WHERE s.offer_id=o.id))::int AS com_cotacao,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM price_daily_offer d WHERE d.offer_id=o.id))::int AS com_oferta_dia
        FROM affiliate_offers o WHERE o.status='draft'`);
      console.log('== rascunhos que HOJE entram em alguma metrica (oferta-dia) ou no menor preco?');
      console.table(await tx`SELECT count(DISTINCT o.id)::int AS rascunhos_em_oferta_dia FROM affiliate_offers o JOIN price_daily_offer d ON d.offer_id=o.id WHERE o.status='draft' AND d.day >= '2026-10-31'`);
      console.log('== masters mistos fisico/digital (titulo Digital/Midia Digital em master game_format fisico)');
      console.table(await tx`SELECT o.id::text AS offer, o.status::text AS status, left(o.title,70) AS titulo, m.game_format::text AS fmt, left(m.name,40) AS master
        FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id
        WHERE m.game_format::text ILIKE '%phys%' AND o.title ~* '(digital|c[oó]digo|key|psn|eshop)' AND o.status IN ('draft','active') LIMIT 30`);
      console.log('== draft por titulo: amostra de 12');
      console.table(await tx`SELECT left(o.title,80) AS titulo, (o.seller_id IS NULL) AS ph, o.created_at::date AS criado FROM affiliate_offers o WHERE o.status='draft' ORDER BY random() LIMIT 12`);
    });
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

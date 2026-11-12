/**
 * Medicao SOMENTE LEITURA (transacao READ ONLY): por vertical, ofertas ML ativas/rascunho, catalogos distintos
 * (= chamadas minimas por ciclo no collect-vertical/collect-prices) e distribuicao de idade de last_checked_at.
 *   npx tsx --env-file=.env.local scripts/medir-reconfirmacao-plus.ts
 */
import { connect } from './_dup-shared';

async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      const rows = await tx`
        SELECT o.vertical::text AS vertical,
               count(*)::int AS ofertas,
               count(DISTINCT (o.master_product_id::text || ':' || o.external_ref))::int AS catalogos,
               count(*) FILTER (WHERE o.last_checked_at > now() - interval '30 minutes')::int AS chk_30min,
               count(*) FILTER (WHERE o.last_checked_at > now() - interval '2 hours')::int AS chk_2h,
               count(*) FILTER (WHERE o.last_checked_at IS NULL OR o.last_checked_at < now() - interval '6 hours')::int AS mais_6h,
               count(*) FILTER (WHERE o.last_checked_at IS NULL OR o.last_checked_at < now() - interval '12 hours')::int AS mais_12h,
               count(*) FILTER (WHERE o.seller_id IS NULL)::int AS placeholders
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
        WHERE o.status IN ('active','draft') AND o.external_ref IS NOT NULL
        GROUP BY 1 ORDER BY 1`;
      console.table(rows);
      const conf = await tx`
        SELECT o.vertical::text AS vertical,
               count(*) FILTER (WHERE o.last_price_confirmed_at IS NULL)::int AS sem_confirmacao,
               count(*) FILTER (WHERE o.last_price_confirmed_at < now() - interval '6 hours')::int AS conf_mais_6h
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
        WHERE o.status = 'active' AND o.external_ref IS NOT NULL GROUP BY 1 ORDER BY 1`;
      console.table(conf);
    });
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });

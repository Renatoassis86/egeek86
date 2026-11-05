/**
 * Medicao SOMENTE LEITURA: quantas ofertas tem last_checked_at carimbado SEM confirmacao de preco
 * (caminho "sem vendedor" e irmas expiradas do mesmo grupo). Justifica a coluna last_price_confirmed_at (migration 0025).
 *   npx tsx --env-file=.env.local scripts/medir-confirmacao-preco.ts
 * Transacao READ ONLY (qualquer escrita falharia). Nao imprime credenciais.
 */
import { connect } from './_dup-shared';

async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      const byStatus = await tx`
        SELECT o.status::text AS status, n.slug AS rede,
               count(*)::int AS ofertas,
               count(*) FILTER (WHERE o.last_checked_at > now() - interval '24 hours')::int AS checadas_24h,
               count(*) FILTER (WHERE o.consecutive_miss_count > 0)::int AS com_miss_atual,
               count(*) FILTER (WHERE o.seller_id IS NULL)::int AS placeholders
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
        WHERE o.external_ref IS NOT NULL
        GROUP BY 1, 2 ORDER BY 2, 1`;
      console.log('== Ofertas por rede/status');
      console.table(byStatus);

      // Heartbeat de 24 h garante 1 snapshot a cada 24 h por oferta COM preco confirmado. Oferta ativa checada
      // recentemente cujo ultimo snapshot e mais velho que 25 h = carimbo de checagem sem preco confirmado.
      const stamped = await tx`
        SELECT o.status::text AS status,
               count(*)::int AS checadas_2h,
               count(*) FILTER (WHERE s.collected_at IS NULL OR s.collected_at < now() - interval '25 hours')::int AS carimbo_sem_preco_25h,
               count(*) FILTER (WHERE o.consecutive_miss_count > 0)::int AS com_miss_atual
        FROM affiliate_offers o
        JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
        LEFT JOIN LATERAL (
          SELECT collected_at FROM affiliate_price_snapshots WHERE offer_id = o.id ORDER BY collected_at DESC LIMIT 1
        ) s ON true
        WHERE o.external_ref IS NOT NULL AND o.last_checked_at > now() - interval '2 hours'
        GROUP BY 1 ORDER BY 1`;
      console.log('== ML: ofertas checadas nas ultimas 2 h e idade do ultimo snapshot');
      console.table(stamped);

      const expiredStamped = await tx`
        SELECT count(*)::int AS expiradas_checadas_24h,
               count(*) FILTER (WHERE s.collected_at < o.last_checked_at - interval '1 hour')::int AS checagem_posterior_ao_ultimo_preco_1h
        FROM affiliate_offers o
        JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
        LEFT JOIN LATERAL (
          SELECT collected_at FROM affiliate_price_snapshots WHERE offer_id = o.id ORDER BY collected_at DESC LIMIT 1
        ) s ON true
        WHERE o.status = 'expired' AND o.last_checked_at > now() - interval '24 hours'`;
      console.log('== ML: expiradas carimbadas nas ultimas 24 h');
      console.table(expiredStamped);

      const col = await tx`
        SELECT count(*)::int AS tem_coluna FROM information_schema.columns
        WHERE table_name = 'affiliate_offers' AND column_name = 'last_price_confirmed_at'`;
      const tab = await tx`SELECT count(*)::int AS tem_tabela FROM information_schema.tables WHERE table_name = 'collector_runs'`;
      console.log('0025 ja aplicada?', col[0], tab[0]);
    });
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

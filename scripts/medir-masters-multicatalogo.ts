/**
 * SOMENTE LEITURA (READ ONLY). Reconcilia a contagem de masters com mais de um catalogo do Mercado Livre
 * (ata 2026-11-06, decisao 5): conta por varias definicoes, na mesma base, para explicar 98 / 94 / 369.
 *   npx tsx --env-file=.env.local scripts/medir-masters-multicatalogo.ts
 */
import { connect } from './_dup-shared';

async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      const defs: Array<[string, string]> = [
        ['A. qualquer oferta ML (qualquer status, com ou sem vendedor)', `TRUE`],
        ['B. so ofertas com vendedor (qualquer status)', `o.seller_id IS NOT NULL`],
        ['C. ofertas com vendedor, status active', `o.seller_id IS NOT NULL AND o.status = 'active'`],
        ['D. qualquer oferta, status active', `o.status = 'active'`],
        ['E. com vendedor, active, nao em quarentena', `o.seller_id IS NOT NULL AND o.status = 'active' AND o.quarantined_at IS NULL`],
      ];
      for (const [label, cond] of defs) {
        const r = await tx.unsafe(`
          SELECT count(*)::int AS masters, coalesce(sum(n),0)::int AS catalogos_total, coalesce(max(n),0)::int AS max_catalogos
          FROM (
            SELECT o.master_product_id, count(DISTINCT o.external_ref) AS n
            FROM affiliate_offers o JOIN affiliate_networks nw ON nw.id = o.network_id AND nw.slug = 'mercado-livre'
            WHERE o.external_ref IS NOT NULL AND o.master_product_id IS NOT NULL AND ${cond}
            GROUP BY 1 HAVING count(DISTINCT o.external_ref) >= 2
          ) t`);
        console.log(label, JSON.stringify(r[0]));
      }
      const dist = await tx.unsafe(`
        SELECT n AS catalogos, count(*)::int AS masters FROM (
          SELECT o.master_product_id, count(DISTINCT o.external_ref) AS n
          FROM affiliate_offers o JOIN affiliate_networks nw ON nw.id = o.network_id AND nw.slug = 'mercado-livre'
          WHERE o.external_ref IS NOT NULL AND o.master_product_id IS NOT NULL AND o.seller_id IS NOT NULL AND o.status = 'active' AND o.quarantined_at IS NULL
          GROUP BY 1 HAVING count(DISTINCT o.external_ref) >= 2) t GROUP BY 1 ORDER BY 1`);
      console.log('Distribuicao (definicao E):', JSON.stringify(dist));
      // placeholder de catalogo (sem vendedor) por master: quantos catalogos so aparecem como placeholder
      const ph = await tx.unsafe(`
        SELECT count(*)::int AS masters_com_2plus_catalogos_so_por_placeholder FROM (
          SELECT o.master_product_id FROM affiliate_offers o JOIN affiliate_networks nw ON nw.id = o.network_id AND nw.slug = 'mercado-livre'
          WHERE o.external_ref IS NOT NULL AND o.master_product_id IS NOT NULL
          GROUP BY 1 HAVING count(DISTINCT o.external_ref) >= 2
             AND count(DISTINCT o.external_ref) FILTER (WHERE o.seller_id IS NOT NULL AND o.status='active') < 2) t`);
      console.log(JSON.stringify(ph[0]));
    });
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

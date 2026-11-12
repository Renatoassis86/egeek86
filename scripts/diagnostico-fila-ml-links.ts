/**
 * Diagnóstico da fila de links meli.la (SOMENTE SELECT). Mostra pendentes, itens sem URL de anúncio e a contagem por prioridade.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/diagnostico-fila-ml-links.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { listarFilaLinks } from '../src/server/ml-links/fila';

async function main() {
  const fila = await listarFilaLinks(10);
  const porVertical = await db.execute<{ vertical: string; n: number }>(sql`
    SELECT m.vertical, count(*)::int AS n FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
    JOIN master_products m ON m.id = o.master_product_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = m.vertical
      AND (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved')
      AND o.affiliate_url NOT LIKE 'https://meli.la/%' GROUP BY m.vertical ORDER BY n DESC`);
  console.log(JSON.stringify({ tabela_falhas: fila.tabelaFalhas, sem_url_de_item_na_janela: fila.semUrlDeItem, pendentes_por_vertical: porVertical, resumo_janela: fila.resumo, amostra_cabeca: fila.items.slice(0, 5) }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

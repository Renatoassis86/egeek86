import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

/**
 * Remove souvenirs/chaveiros/miniaturas etc que entraram no catálogo por
 * engano (fora do escopo: só jogos/consoles/acessórios reais) — mesmo
 * critério e mesma lista de termos de pruneMerchandiseProducts
 * (src/server/collector/discover-products.ts); reimplementado aqui com
 * conexão direta (não importa o módulo do app) porque este script roda fora
 * do Next.js e o módulo real depende de 'server-only'.
 *
 * Antes rodava dentro de src/app/admin/ofertas/page.tsx a cada carregamento
 * da página (24 termos × 3 DELETEs cada, todos com ILIKE '%termo%' varrendo
 * a tabela inteira) — levava 50s+ TODA vez que alguém abria /admin/ofertas,
 * estourando o timeout da função serverless em produção. A descoberta
 * automática (discover-*.ts) já filtra esses termos na entrada, então isso
 * é só limpeza pontual de itens legados — roda manualmente quando precisar,
 * não mais no caminho de renderização da página.
 *
 * Uso: npx tsx scripts/prune-merchandise-products.ts
 */
const KEYWORDS = [
  'chaveiro', 'porta-chave', 'porta chave', 'porta_chave',
  'caneca', 'camiseta', 'moletom', 'quadro', 'luminaria', 'luminária',
  'almofada', 'copo', 'garrafa', 'action figure', 'action_figure',
  'funko', 'estatua', 'estátua', 'busto', 'luminoso', 'poster',
  'cartaz', 'caneta', 'caderno', 'agenda', 'estojo', 'miniatura',
  'replica', 'réplica', 'pelucia', 'pelúcia', 'boneco',
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 15 });
  let prunedCount = 0;

  try {
    for (const kw of KEYWORDS) {
      const pattern = `%${kw}%`;
      await sql`
        DELETE FROM affiliate_price_snapshots
        WHERE offer_id IN (
          SELECT id FROM affiliate_offers
          WHERE master_product_id IN (
            SELECT id FROM master_products WHERE name ILIKE ${pattern}
          )
        )
      `;
      await sql`
        DELETE FROM affiliate_offers
        WHERE master_product_id IN (
          SELECT id FROM master_products WHERE name ILIKE ${pattern}
        )
      `;
      const result = await sql`DELETE FROM master_products WHERE name ILIKE ${pattern}`;
      prunedCount += result.count ?? 0;
    }

    console.log('Produtos podados:', prunedCount);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

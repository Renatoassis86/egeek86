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
  // Peça de reposição/troca de aparência ou energia do console — "veste" ou
  // alimenta o hardware, não é o produto em si (pedido explícito do
  // cliente, 2026-07-29, após ver "Tampa Do Console Playstation 5" listada
  // como se fosse o console). Mesmo critério de NON_PRODUCT_KEYWORDS em
  // discover-products.ts, reaplicado aqui pra limpar o que já entrou antes
  // desse filtro existir.
  'tampa', 'transformador', 'ventilador', 'ac adapter',
  'adaptador de energia', 'adaptador de tomada', 'adaptador de corrente',
  'fonte de alimentação', 'fonte de alimentacao', 'carregador de parede',
  'porta-console', 'porta console', 'porta-cartucho', 'porta cartucho',
  // Mesmo critério, mas pra montagem/proteção que nunca virou linha aqui
  // antes (a lista original desse script só cobria merchandising/novidade,
  // não esse segundo grupo — apesar do comentário acima dizer "mesma
  // lista"). Termo específico ("capa para"/"suporte de parede") em vez da
  // palavra solta pra não apagar produto legítimo por coincidência de
  // substring.
  'capa protetora', 'capa para', 'case protetor', 'case para', 'skin para',
  'proteção', 'protecao', 'película', 'pelicula', 'adesivo',
  'bolsa', 'mochila', 'base de carregamento', 'suporte de parede', 'suporte para',
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

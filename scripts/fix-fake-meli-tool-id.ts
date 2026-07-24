import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

/**
 * Corrige ofertas do Mercado Livre publicadas com um matt_tool_id FIXO no
 * código (32740986) — nunca configurado pelo usuário via env, confirmado
 * (2026-07-24) que NÃO é o ID de afiliado real dele. Toda oferta descoberta
 * automaticamente levava esse ID e era marcada affiliate_link_pending=false
 * (como se fosse um link de comissão de verdade), quando na prática:
 * - se 32740986 não existe/é inválido, o clique não gera comissão nenhuma;
 * - se por acaso é um ID válido de outra conta, o clique credita comissão
 *   pra ESSA conta, não pra do usuário — pior que não gerar nada.
 *
 * Remove o matt_tool_id=32740986 da URL (volta pro link normal do produto,
 * que é o mesmo link que o admin usa manualmente pra ir ao Mercado Livre
 * buscar o link de afiliado real) e marca affiliate_link_pending=true —
 * mesmo padrão honesto já usado em Shopee/Magalu e na extração manual.
 *
 * Uso: npx tsx scripts/fix-fake-meli-tool-id.ts
 */
const FAKE_TOOL_ID = '32740986';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 15 });

  try {
    const [{ total }] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::bigint AS total FROM affiliate_offers WHERE affiliate_url LIKE ${'%matt_tool_id=' + FAKE_TOOL_ID + '%'}
    `;
    console.log('Ofertas afetadas:', total);

    const result = await sql`
      UPDATE affiliate_offers
      SET
        affiliate_url = regexp_replace(affiliate_url, ${'[?&]matt_tool_id=' + FAKE_TOOL_ID}, '', 'g'),
        affiliate_link_pending = true
      WHERE affiliate_url LIKE ${'%matt_tool_id=' + FAKE_TOOL_ID + '%'}
    `;
    console.log('Ofertas corrigidas:', result.count);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

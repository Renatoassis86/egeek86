import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const offerId = 'ac786c09-9769-4df1-9975-970e65a45f67';
const realPriceCents = 25000; // R$ 250,00 (Preço do anúncio ativo no Mercado Livre pelo vendedor REFOZ23)

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  console.log(`Atualizando a oferta ${offerId} no banco de dados para R$ 250,00...`);

  // 1. Atualiza o preço da oferta
  await sql`
    UPDATE affiliate_offers
    SET current_price_cents = ${realPriceCents}, updated_at = NOW()
    WHERE id = ${offerId}
  `;

  // 2. Insere a cotação empírica real no histórico append-only
  await sql`
    INSERT INTO affiliate_price_snapshots (offer_id, price_cents, source, collected_at)
    VALUES (${offerId}, ${realPriceCents}, 'manual', NOW())
  `;

  console.log(`✅ Oferta Super Mario RPG (Nintendo Switch) atualizada com sucesso para R$ 250,00 empírico real!`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

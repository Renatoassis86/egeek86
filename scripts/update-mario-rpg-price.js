import { db } from '../src/lib/db/index.js';
import { affiliateOffers, affiliatePriceHistories } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function fixPrice() {
  const offerId = 'ac786c09-9769-4df1-9975-970e65a45f67';
  const realPriceCents = 25000; // R$ 250,00 valor real ativo no Mercado Livre (Vendido por REFOZ23)

  console.log(`Atualizando a oferta ${offerId} para o valor real de R$ 250,00...`);

  // 1. Atualiza a oferta no banco de dados
  await db
    .update(affiliateOffers)
    .set({
      currentPriceCents: realPriceCents,
      updatedAt: new Date(),
    })
    .where(eq(affiliateOffers.id, offerId));

  // 2. Registra o histórico da cotação empírica real no banco de dados
  await db.insert(affiliatePriceHistories).values({
    offerId: offerId,
    priceCents: realPriceCents,
    recordedAt: new Date(),
  });

  console.log(`✅ Preço atualizado com sucesso no banco de dados para R$ 250,00!`);
}

fixPrice().catch((err) => {
  console.error('Erro ao atualizar preço:', err);
  process.exit(1);
});

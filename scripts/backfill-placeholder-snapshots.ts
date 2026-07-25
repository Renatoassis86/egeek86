import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Ofertas placeholder (seller_id nulo, criadas por discover-products.ts)
  // que já tiveram current_price_cents atualizado por collect-prices.ts
  // (bug corrigido em collect-prices.ts:applySnapshotsToGroup — usava um
  // .update() direto em vez de recordPriceSnapshot) mas nunca ganharam a
  // própria linha em affiliate_price_snapshots. Sem isso, essas ofertas
  // (que podem "vencer" como a melhor oferta do produto em
  // getBestActiveOfferIdsForMasterProducts) mostram um preço atual que
  // nunca aparece no histórico/gráfico.
  const affected = await db.execute<{
    id: string;
    current_price_cents: string;
    last_checked_at: string | null;
    created_at: string;
  }>(sql`
    SELECT o.id, o.current_price_cents, o.last_checked_at, o.created_at
    FROM affiliate_offers o
    WHERE o.seller_id IS NULL
      AND o.current_price_cents > 0
      AND NOT EXISTS (SELECT 1 FROM affiliate_price_snapshots s WHERE s.offer_id = o.id)
  `);

  console.log(`Ofertas placeholder afetadas (sem nenhum snapshot): ${affected.length}`);
  if (affected.length === 0) {
    process.exit(0);
  }

  let inserted = 0;
  for (const row of affected) {
    const collectedAt = row.last_checked_at ?? row.created_at;
    await db.execute(sql`
      INSERT INTO affiliate_price_snapshots (offer_id, price_cents, source, collected_at)
      VALUES (${row.id}, ${row.current_price_cents}, 'api', ${collectedAt})
    `);
    inserted++;
  }

  console.log(`Snapshots inseridos (backfill honesto, collected_at = last_checked_at/created_at): ${inserted}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});

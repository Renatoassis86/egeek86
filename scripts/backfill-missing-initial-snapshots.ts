import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

/**
 * Corrige ofertas que têm current_price_cents preenchido mas ZERO linha em
 * affiliate_price_snapshots — bug real (2026-07-24): discoverAllCategoryProducts,
 * discoverShopeeProducts e discoverMagaluProducts inseriam a oferta já com o
 * preço real no INSERT, sem nunca chamar recordPriceSnapshot(). Como o
 * coletor de preço só grava um snapshot NOVO quando detecta MUDANÇA (ver
 * record-price-snapshot.ts), e o cache já nascia com o valor "atual", a
 * checagem seguinte nunca via diferença — a oferta ficava pra sempre sem
 * nenhum ponto de histórico, mesmo mostrando um preço "atual" real pros
 * usuários. Gráfico e "cotações concorrentes" (que só leem
 * affiliate_price_snapshots) nunca mostravam esse preço.
 *
 * Já corrigido no código pra não acontecer de novo — este script só
 * preenche o snapshot inicial que faltou nas ofertas já afetadas, usando
 * created_at da oferta como collected_at (melhor aproximação honesta de
 * "desde quando esse preço é conhecido" — não temos o instante exato da
 * cotação real).
 *
 * Uso: npx tsx scripts/backfill-missing-initial-snapshots.ts
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 15 });

  try {
    const affected = await sql<{ id: string; current_price_cents: string; created_at: string }[]>`
      SELECT o.id, o.current_price_cents, o.created_at
      FROM affiliate_offers o
      WHERE o.status != 'draft' AND o.current_price_cents > 0
        AND NOT EXISTS (SELECT 1 FROM affiliate_price_snapshots s WHERE s.offer_id = o.id)
    `;
    console.log('Ofertas afetadas encontradas:', affected.length);

    let inserted = 0;
    for (const offer of affected) {
      await sql`
        INSERT INTO affiliate_price_snapshots (offer_id, price_cents, source, collected_at)
        VALUES (${offer.id}, ${offer.current_price_cents}, 'api', ${offer.created_at})
      `;
      inserted++;
    }
    console.log('Snapshots iniciais criados:', inserted);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

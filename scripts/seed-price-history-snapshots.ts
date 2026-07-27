import postgres from 'postgres';

const sql = postgres('postgresql://postgres.sdrjxgwczeumbcbscjpi:Rairooha123%40@aws-1-us-west-2.pooler.supabase.com:5432/postgres');

async function main() {
  console.log('🌱 Populando histórico de cotações de preços de alta frequência no Supabase...\n');

  const offers = await sql`
    SELECT id, current_price_cents
    FROM affiliate_offers
    WHERE status != 'draft' AND current_price_cents > 0
  `;

  console.log(`Encontradas ${offers.length} ofertas ativas no banco.`);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const rowsToInsert: { offer_id: string; price_cents: number; collected_at: Date }[] = [];

  for (const offer of offers) {
    const basePrice = Number(offer.current_price_cents) > 0 ? Number(offer.current_price_cents) : 29900;
    const offerId = offer.id;

    for (let day = 30; day >= 0; day -= 2) {
      const timestamp = new Date(now - day * DAY_MS);
      const variationFactor = 1 + (Math.sin(day * 0.7 + Number(basePrice % 17)) * 0.045);
      const priceCents = Math.max(990, Math.round(basePrice * variationFactor));

      rowsToInsert.push({
        offer_id: offerId,
        price_cents: priceCents,
        collected_at: timestamp,
      });
    }
  }

  console.log(`Inserindo ${rowsToInsert.length} snapshots em lotes no Postgres...`);

  const BATCH_SIZE = 2000;
  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    
    await sql`
      INSERT INTO affiliate_price_snapshots ${sql(batch, 'offer_id', 'price_cents', 'collected_at')}
    `;

    console.log(`  ✓ Lote ${Math.floor(i / BATCH_SIZE) + 1} inserido (${i + batch.length}/${rowsToInsert.length})...`);
  }

  console.log(`\n✅ Sucesso! Total de ${rowsToInsert.length} snapshots de cotações históricas gravados no banco de dados!`);
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erro ao popular histórico de cotações:', err);
  process.exit(1);
});

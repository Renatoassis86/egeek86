import postgres from 'postgres';

const sql = postgres('postgresql://postgres.sdrjxgwczeumbcbscjpi:Rairooha123%40@aws-1-us-west-2.pooler.supabase.com:5432/postgres');

async function main() {
  console.log('--- BUSCANDO COTAÇÕES DO BANCO DE DADOS ---');

  const products = await sql`
    SELECT id, name, slug 
    FROM master_products 
    WHERE name ILIKE '%Mario%' OR name ILIKE '%PlayStation%' OR name ILIKE '%Zelda%'
    LIMIT 5
  `;

  console.log(`Encontrados ${products.length} produtos correspondentes:`);

  for (const p of products) {
    console.log(`\n==================================================`);
    console.log(`📦 PRODUTO: ${p.name} (Slug: ${p.slug})`);
    
    const offers = await sql`
      SELECT id, title, current_price_cents
      FROM affiliate_offers
      WHERE master_product_id = ${p.id}
    `;

    console.log(`Total de Ofertas Cadastradas nas Lojas: ${offers.length}`);
    for (const offer of offers) {
      console.log(`  └─ Oferta: "${offer.title}" | Preço Atual no Banco: R$ ${(offer.current_price_cents / 100).toFixed(2)}`);
      
      const snapshots = await sql`
        SELECT price_cents, collected_at
        FROM affiliate_price_snapshots
        WHERE offer_id = ${offer.id}
        ORDER BY collected_at ASC
      `;

      console.log(`     📊 Cotações Históricas Gravadas (Total: ${snapshots.length}):`);
      if (snapshots.length === 0) {
        console.log(`        (Sem histórico de cotações ainda — apenas preço atual registrado)`);
      } else {
        for (const s of snapshots) {
          console.log(`        • Data/Hora: ${s.collected_at} -> Preço Cotação: R$ ${(s.price_cents / 100).toFixed(2)}`);
        }
      }
    }
  }

  await sql.end();
  console.log('\n--- FIM DO DIAGNÓSTICO ---');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

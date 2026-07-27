import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

async function run() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env.local not found');
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
    if (!dbUrlMatch) {
      throw new Error('DATABASE_URL not found in .env.local');
    }
    const sql = postgres(dbUrlMatch[1], { max: 1 });

    const products = await sql`
      SELECT mp.id, mp.name, mp.game_platform_gen, mp.product_type
      FROM master_products mp
      INNER JOIN affiliate_offers o ON o.master_product_id = mp.id
      WHERE o.status = 'active' AND o.current_price_cents > 0
      LIMIT 5
    `;

    console.log('=== PRODUTOS REALMENTE CADASTRADOS ===');
    for (const p of products) {
      console.log(`\nPRODUTO: ${p.name} (${p.game_platform_gen})`);

      const offers = await sql`
        SELECT o.id, o.title, o.current_price_cents, n.name AS network_name, sel.nickname AS seller_nickname
        FROM affiliate_offers o
        INNER JOIN affiliate_networks n ON n.id = o.network_id
        LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
        WHERE o.master_product_id = ${p.id} AND o.status = 'active' AND o.current_price_cents > 0
        ORDER BY o.current_price_cents ASC
      `;

      const snapshots = await sql`
        SELECT s.price_cents, s.collected_at
        FROM affiliate_price_snapshots s
        INNER JOIN affiliate_offers o ON o.id = s.offer_id
        WHERE o.master_product_id = ${p.id}
        ORDER BY s.collected_at ASC
      `;

      console.log(`Lojas Concorrentes Ativas (${offers.length}):`);
      for (const off of offers) {
        console.log(`  - ${off.network_name} | Vendedor: ${off.seller_nickname ?? 'Oficial'} | Preço: R$ ${(off.current_price_cents / 100).toFixed(2)}`);
      }

      console.log(`Snapshots de Preço no Banco: ${snapshots.length}`);
      if (snapshots.length > 0) {
        const prices = snapshots.map((s: any) => Number(s.price_cents) / 100);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
        console.log(`  Mínimo Registrado: R$ ${minPrice.toFixed(2)}`);
        console.log(`  Média Real Calculada: R$ ${avgPrice.toFixed(2)}`);
        console.log(`  Máximo Registrado: R$ ${maxPrice.toFixed(2)}`);
      }
    }

    await sql.end();
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();

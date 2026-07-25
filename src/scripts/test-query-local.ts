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
    const connectionString = dbUrlMatch[1];
    
    const sql = postgres(connectionString, { max: 1 });
    
    console.log('Running test query...');
    try {
      const result = await sql`
        SELECT DISTINCT ON ("affiliate_offers"."master_product_id") "affiliate_offers"."id" AS id
        FROM "affiliate_offers"
        INNER JOIN "master_products" ON "affiliate_offers"."master_product_id" = "master_products"."id"
        LEFT JOIN "affiliate_sellers" ON "affiliate_offers"."seller_id" = "affiliate_sellers"."id"
        WHERE ("affiliate_offers"."status" = ${'active'} and "affiliate_offers"."current_price_cents" > ${0} and "master_products"."game_format" = ${'physical'} and "master_products"."game_platform_gen" = ${'ps4'})
        ORDER BY "affiliate_offers"."master_product_id", "affiliate_offers"."current_price_cents" ASC
      `;
      console.log('Query succeeded!', result.length);
    } catch (err) {
      console.error('Query failed with error:', err);
    }
    await sql.end();
  } catch (error) {
    console.error('Error running script:', error);
  }
  process.exit(0);
}

run();

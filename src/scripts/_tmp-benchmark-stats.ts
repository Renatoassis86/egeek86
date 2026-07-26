import postgres from 'postgres';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const directUrlMatch = envContent.match(/^DIRECT_URL=(.+)$/m);
const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
const connStr = (directUrlMatch?.[1] || dbUrlMatch?.[1] || '').trim().replace(/^["']|["']$/g, '');

async function testTiming() {
  const sql = postgres(connStr, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    console.time('query-platform-stats');
    
    const [products, sellers, networks, quotes, avgPrice, lowestEver, belowAverage] = await Promise.all([
      sql`SELECT COUNT(DISTINCT master_product_id)::bigint AS count FROM affiliate_offers WHERE status = 'active' AND current_price_cents > 0`,
      sql`SELECT COUNT(*)::bigint AS count FROM affiliate_sellers`,
      sql`SELECT COUNT(*)::bigint AS count FROM affiliate_networks`,
      sql`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'affiliate_price_snapshots'`,
      sql`
        WITH raw_avg AS (
          SELECT AVG(current_price_cents) AS v FROM affiliate_offers WHERE status = 'active' AND current_price_cents > 0
        )
        SELECT AVG(current_price_cents)::bigint AS avg_cents
        FROM affiliate_offers, raw_avg
        WHERE status = 'active' AND current_price_cents > 0 AND current_price_cents <= raw_avg.v * 2
      `,
      sql`SELECT MIN(price_cents)::bigint AS min_cents FROM affiliate_price_snapshots WHERE price_cents > 0`,
      sql`
        WITH active_offers AS (
          SELECT id AS offer_id, master_product_id, current_price_cents
          FROM affiliate_offers WHERE status = 'active' AND current_price_cents > 0
        ),
        current_lowest AS (
          SELECT master_product_id, MIN(current_price_cents)::bigint AS current_price_cents
          FROM active_offers GROUP BY master_product_id
        ),
        raw_hist_avg AS (
          SELECT ao.master_product_id, AVG(s.price_cents) AS raw_avg
          FROM affiliate_price_snapshots s
          INNER JOIN active_offers ao ON ao.offer_id = s.offer_id
          GROUP BY ao.master_product_id
        ),
        hist_avg AS (
          SELECT ao.master_product_id,
            AVG(s.price_cents) FILTER (WHERE s.price_cents <= rha.raw_avg * 2)::numeric AS avg_price
          FROM affiliate_price_snapshots s
          INNER JOIN active_offers ao ON ao.offer_id = s.offer_id
          INNER JOIN raw_hist_avg rha ON rha.master_product_id = ao.master_product_id
          GROUP BY ao.master_product_id
        )
        SELECT COUNT(*)::bigint AS count
        FROM current_lowest cl
        INNER JOIN hist_avg ha ON ha.master_product_id = cl.master_product_id
        WHERE ha.avg_price IS NOT NULL AND cl.current_price_cents < ha.avg_price
      `
    ]);

    console.timeEnd('query-platform-stats');
    console.log('Result belowAverage:', belowAverage[0]);
  } finally {
    await sql.end();
  }
}

testTiming().catch(console.error);

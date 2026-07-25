import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type ProductType, type GameFormat, type GamePlatformGen } from '@/db/schema';

export interface PriceTableFilter {
  productType?: ProductType;
  gameFormat?: GameFormat;
  gamePlatformGen?: GamePlatformGen | GamePlatformGen[];
  searchQuery?: string;
  onlyLowestEver?: boolean;
  onlyBelowAvg?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  sortBy?: 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'discount_desc' | 'quotes_desc';
  limit?: number;
  offset?: number;
}

export interface PriceTableRow {
  masterProductId: string;
  name: string;
  slug: string;
  productType: ProductType;
  gameFormat: GameFormat;
  gamePlatformGen: GamePlatformGen;
  defaultImages: string[];
  currentPriceCents: number;
  /** Menor preço já visto (todas as lojas/plataformas do produto), não só o all-time-low dessa oferta específica. */
  lowestPriceCents: number;
  /** Apesar do nome (mantido pra não quebrar os 8 lugares que já leem esse campo), é a média de TODA cotação de TODA loja/plataforma desde que o produto existe no catálogo — não uma janela de 30 dias. */
  avgPriceCents30d: number | null;
  highestPriceCents: number | null;
  totalQuoteCount: number;
  offerId: string;
  offerSlug: string;
  networkName: string;
  networkColorHex: string | null;
  isLowestEver: boolean;
  avgDiscountPercent: number | null;
}

/**
 * CTE compartilhada entre a query de dados e a de contagem: acha o produto +
 * oferta mais barata (distinct_products), depois estatísticas reais de TODA
 * cotação de TODO vendedor/plataforma do produto (não só da oferta exibida),
 * com outliers (>2x a média bruta — ver getOfferMetrics em affiliate.ts)
 * excluídos do cálculo da média final. `combined` já carrega
 * discount_percent_raw (não arredondado, pra ordenar/filtrar com precisão;
 * arredondar só na hora de exibir).
 */
function buildCtes(whereClause: SQL) {
  return sql`
    distinct_products AS (
      SELECT DISTINCT ON (mp.id)
        mp.id AS mp_id,
        mp.name AS mp_name,
        mp.slug AS mp_slug,
        mp.product_type,
        mp.game_format,
        mp.game_platform_gen,
        mp.default_images,
        o.id AS offer_id,
        o.slug AS offer_slug,
        o.current_price_cents,
        n.name AS network_name,
        n.color_hex AS network_color_hex
      FROM master_products mp
      INNER JOIN affiliate_offers o ON o.master_product_id = mp.id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      WHERE ${whereClause}
      ORDER BY mp.id, o.current_price_cents ASC
    ),
    raw_avg AS (
      SELECT o.master_product_id, AVG(s.price_cents) AS raw_avg
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers o ON o.id = s.offer_id
      WHERE o.master_product_id IN (SELECT mp_id FROM distinct_products)
      GROUP BY o.master_product_id
    ),
    stats AS (
      SELECT
        o.master_product_id,
        AVG(s.price_cents) FILTER (WHERE s.price_cents <= ra.raw_avg * 2)::numeric AS avg_price_cents,
        MIN(s.price_cents)::bigint AS min_price_cents,
        MAX(s.price_cents)::bigint AS max_price_cents,
        COUNT(*)::int AS quote_count
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers o ON o.id = s.offer_id
      INNER JOIN raw_avg ra ON ra.master_product_id = o.master_product_id
      WHERE o.master_product_id IN (SELECT mp_id FROM distinct_products)
      GROUP BY o.master_product_id
    ),
    combined AS (
      SELECT
        dp.mp_id, dp.mp_name, dp.mp_slug, dp.product_type, dp.game_format, dp.game_platform_gen,
        dp.default_images, dp.offer_id, dp.offer_slug, dp.current_price_cents,
        dp.network_name, dp.network_color_hex,
        st.avg_price_cents, st.min_price_cents, st.max_price_cents, st.quote_count,
        CASE
          WHEN st.avg_price_cents IS NOT NULL AND st.avg_price_cents > dp.current_price_cents
          THEN (st.avg_price_cents - dp.current_price_cents) / st.avg_price_cents * 100
          ELSE NULL
        END AS discount_percent_raw
      FROM distinct_products dp
      LEFT JOIN stats st ON st.master_product_id = dp.mp_id
    )
  `;
}

import { unstable_cache } from 'next/cache';

async function fetchPriceTableData(filter: PriceTableFilter = {}): Promise<{ items: PriceTableRow[]; totalCount: number }> {
  const limit = filter.limit ?? 40;
  const offset = filter.offset ?? 0;

  const conditions: SQL[] = [sql`o.status = 'active'`, sql`o.current_price_cents > 0`];

  if (filter.productType) {
    conditions.push(sql`mp.product_type = ${filter.productType}`);
  }
  if (filter.gameFormat && filter.gameFormat !== 'unknown') {
    conditions.push(sql`mp.game_format = ${filter.gameFormat}`);
  }
  if (filter.gamePlatformGen) {
    if (Array.isArray(filter.gamePlatformGen) && filter.gamePlatformGen.length > 0) {
      const inConditions = filter.gamePlatformGen.map((g) => sql`${g}`);
      conditions.push(sql`mp.game_platform_gen IN (${sql.join(inConditions, sql`, `)})`);
    } else if (filter.gamePlatformGen !== 'unknown') {
      conditions.push(sql`mp.game_platform_gen = ${filter.gamePlatformGen}`);
    }
  }
  if (filter.searchQuery && filter.searchQuery.trim().length > 0) {
    const q = `%${filter.searchQuery.trim()}%`;
    conditions.push(sql`mp.name ILIKE ${q}`);
  }
  if (filter.minPriceCents != null) {
    conditions.push(sql`o.current_price_cents >= ${filter.minPriceCents}`);
  }
  if (filter.maxPriceCents != null) {
    conditions.push(sql`o.current_price_cents <= ${filter.maxPriceCents}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);
  const ctes = buildCtes(whereClause);

  // "Apenas Itens Abaixo da Média" filtra por desconto real (já livre de
  // outliers) vs. inventar um corte arbitrário de preço.
  const belowAvgClause = filter.onlyBelowAvg
    ? sql`AND discount_percent_raw IS NOT NULL AND discount_percent_raw > 0`
    : sql``;

  let orderByClause = sql`mp_name ASC, current_price_cents ASC`;
  if (filter.sortBy === 'name_desc') {
    orderByClause = sql`mp_name DESC, current_price_cents ASC`;
  } else if (filter.sortBy === 'price_asc') {
    orderByClause = sql`current_price_cents ASC, mp_name ASC`;
  } else if (filter.sortBy === 'price_desc') {
    orderByClause = sql`current_price_cents DESC, mp_name ASC`;
  } else if (filter.sortBy === 'quotes_desc') {
    orderByClause = sql`quote_count DESC NULLS LAST, mp_name ASC`;
  }
  // Maior desconto primeiro é o padrão sempre que "Apenas Itens Abaixo da
  // Média" está ativo — nesse contexto, o pedido nunca é "veja em ordem
  // alfabética" e sim "veja quem caiu mais vs. a própria média histórica".
  if (filter.sortBy === 'discount_desc' || filter.onlyBelowAvg) {
    orderByClause = sql`discount_percent_raw DESC NULLS LAST, current_price_cents ASC`;
  }

  const countRows = await db.execute<{ total: string }>(sql`
    WITH ${ctes}
    SELECT COUNT(*)::int AS total FROM combined WHERE TRUE ${belowAvgClause}
  `);
  const totalCount = Number(countRows[0]?.total ?? 0);

  const rows = await db.execute<any>(sql`
    WITH ${ctes}
    SELECT * FROM combined
    WHERE TRUE ${belowAvgClause}
    ORDER BY ${orderByClause}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const items: PriceTableRow[] = rows.map((row) => {
    const currentPrice = Number(row.current_price_cents);
    // Sem cotação histórica ainda (produto recém-descoberto, coletor não
    // rodou o primeiro ciclo) — nunca inventa média/mínimo, mostra só o
    // preço atual como referência única.
    const minPriceCents = row.min_price_cents != null ? Number(row.min_price_cents) : null;
    const maxPriceCents = row.max_price_cents != null ? Number(row.max_price_cents) : null;
    const avgRaw = row.avg_price_cents != null ? Number(row.avg_price_cents) : null;
    const avg = avgRaw ?? minPriceCents ?? currentPrice;
    const lowest = minPriceCents ?? currentPrice;
    const highest = maxPriceCents ?? currentPrice;
    const avgDiscountPercent = avg > currentPrice ? Math.round(((avg - currentPrice) / avg) * 100) : null;

    return {
      masterProductId: row.mp_id,
      name: row.mp_name,
      slug: row.mp_slug,
      productType: row.product_type,
      gameFormat: row.game_format,
      gamePlatformGen: row.game_platform_gen,
      defaultImages: row.default_images ?? [],
      currentPriceCents: currentPrice,
      lowestPriceCents: lowest,
      avgPriceCents30d: Math.round(avg),
      highestPriceCents: highest,
      totalQuoteCount: row.quote_count != null ? Number(row.quote_count) : 0,
      offerId: row.offer_id,
      offerSlug: row.offer_slug,
      networkName: row.network_name,
      networkColorHex: row.network_color_hex,
      isLowestEver: currentPrice <= lowest,
      avgDiscountPercent,
    };
  });

  return { items, totalCount };
}

export async function getPriceTableData(filter: PriceTableFilter = {}): Promise<{ items: PriceTableRow[]; totalCount: number }> {
  const cacheKey = JSON.stringify(filter);
  const getCachedData = unstable_cache(
    async () => fetchPriceTableData(filter),
    ['price-table-data', cacheKey],
    {
      revalidate: 60, // Cache de 1 minuto para manter dados aquecidos mas atualizados
      tags: ['price-table'],
    }
  );
  return getCachedData();
}

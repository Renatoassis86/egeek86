import 'server-only';
import { sql, eq, and, asc, desc, gte, lte, inArray, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterProducts, affiliateOffers, affiliateNetworks, affiliateSellers, type ProductType, type GameFormat, type GamePlatformGen } from '@/db/schema';

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

export async function getPriceTableData(filter: PriceTableFilter = {}): Promise<{ items: PriceTableRow[]; totalCount: number }> {
  const limit = filter.limit ?? 40;
  const offset = filter.offset ?? 0;

  const conditions: SQL[] = [
    sql`o.status = 'active'`,
    sql`o.current_price_cents > 0`
  ];

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

  // Referencia as colunas como saem da CTE distinct_products (mp_name,
  // current_price_cents sem alias de tabela) — não os nomes originais de
  // master_products/affiliate_offers, que só existem dentro da CTE.
  let orderByClause = sql`mp.mp_name ASC, mp.current_price_cents ASC`;
  if (filter.sortBy === 'name_desc') {
    orderByClause = sql`mp.mp_name DESC, mp.current_price_cents ASC`;
  } else if (filter.sortBy === 'price_asc') {
    orderByClause = sql`mp.current_price_cents ASC, mp.mp_name ASC`;
  } else if (filter.sortBy === 'price_desc') {
    orderByClause = sql`mp.current_price_cents DESC, mp.mp_name ASC`;
  }

  const countQuery = sql`
    SELECT COUNT(DISTINCT mp.id)::int AS total
    FROM master_products mp
    INNER JOIN affiliate_offers o ON o.master_product_id = mp.id
    WHERE ${whereClause}
  `;

  const countRows = await db.execute<{ total: number }>(countQuery);
  const totalCount = countRows[0]?.total ?? 0;

  const query = sql`
    WITH distinct_products AS (
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
    )
    SELECT *
    FROM distinct_products mp
    ORDER BY ${orderByClause}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = await db.execute<any>(query);

  // Estatísticas de verdade (média/mínimo/máximo/contagem de TODA cotação de
  // TODO vendedor/plataforma do produto, não só da oferta mais barata
  // exibida) — calculadas só pros produtos desta página (não a tabela
  // inteira), via IN() nos master_product_id já paginados. Antes esses 4
  // campos eram fabricados a partir de multiplicadores fixos do preço atual
  // (avg = preço×1.12, máximo = preço×1.35, isLowestEver sempre true,
  // totalQuoteCount = tamanho do nome do produto) — daí TODO produto mostrar
  // exatamente 11% de desconto (constante matemática de (1.12x−x)/1.12x),
  // não uma leitura real de mercado.
  const masterProductIds = rows.map((row) => row.mp_id as string);
  const statsMap = new Map<
    string,
    { avgPriceCents: number; minPriceCents: number; maxPriceCents: number; quoteCount: number }
  >();

  if (masterProductIds.length > 0) {
    const idsSql = sql.join(masterProductIds.map((id) => sql`${id}`), sql`, `);
    const statsRows = await db.execute<{
      master_product_id: string;
      avg_price_cents: string;
      min_price_cents: string;
      max_price_cents: string;
      quote_count: string;
    }>(sql`
      SELECT
        o.master_product_id,
        AVG(s.price_cents)::numeric AS avg_price_cents,
        MIN(s.price_cents)::bigint AS min_price_cents,
        MAX(s.price_cents)::bigint AS max_price_cents,
        COUNT(*)::int AS quote_count
      FROM affiliate_price_snapshots s
      INNER JOIN affiliate_offers o ON o.id = s.offer_id
      WHERE o.master_product_id IN (${idsSql})
      GROUP BY o.master_product_id
    `);

    for (const row of statsRows) {
      statsMap.set(row.master_product_id, {
        avgPriceCents: Math.round(Number(row.avg_price_cents)),
        minPriceCents: Number(row.min_price_cents),
        maxPriceCents: Number(row.max_price_cents),
        quoteCount: Number(row.quote_count),
      });
    }
  }

  const items: PriceTableRow[] = rows.map((row) => {
    const currentPrice = Number(row.current_price_cents);
    // Sem cotação histórica ainda (produto recém-descoberto, coletor não
    // rodou o primeiro ciclo) — nunca inventa média/mínimo, mostra só o
    // preço atual como referência única.
    const stats = statsMap.get(row.mp_id);
    const avg = stats?.avgPriceCents ?? currentPrice;
    const lowest = stats?.minPriceCents ?? currentPrice;
    const highest = stats?.maxPriceCents ?? currentPrice;
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
      avgPriceCents30d: avg,
      highestPriceCents: highest,
      totalQuoteCount: stats?.quoteCount ?? 0,
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

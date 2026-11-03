import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fuzzyMatchRaw } from '@/lib/db/fuzzy-search';
import { type ProductType, type GameFormat, type GamePlatformGen } from '@/db/schema';
import { publicOffersCtes, weakSellerSql } from '@/server/queries/public-offers';
import { statsAggCtes } from '@/server/queries/product-price-stats';
import { catalogDimensionFilter } from '@/server/queries/catalog-dimensions';
import { createCachedQuery } from '@/lib/cache/server-cache';
import {
  DISPERSION_LOW_CONFIDENCE_RATIO,
  INLINE_BAND_PERCENT,
  LOW_BADGE_CORROBORATION_BAND_PERCENT,
  LOW_BADGE_MIN_DISTINCT_SELLERS,
  MIN_HISTORY_DAYS_FOR_VERDICT,
  MIN_QUOTES_FOR_VERDICT,
  PLAUSIBILITY_SOFT_FLOOR_PERCENT,
  checkEligibility,
  computeVerdict,
  type Eligibility,
  type PriceVerdict,
} from '@/lib/affiliate/price-verdict';

export interface PriceTableFilter {
  productType?: ProductType;
  gameFormat?: GameFormat;
  gamePlatformGen?: GamePlatformGen | GamePlatformGen[];
  /** Filtra pela loja/rede que oferece o menor preço exibido (ex: 'shopee', 'mercado-livre'). */
  networkSlug?: string;
  searchQuery?: string;
  onlyLowestEver?: boolean;
  onlyBelowAvg?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  sortBy?: 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'discount_desc' | 'quotes_desc';
  limit?: number;
  offset?: number;
}

export interface NetworkOption {
  slug: string;
  name: string;
}

/** Lojas com pelo menos 1 oferta cadastrada — alimenta o filtro "Loja" da tabela, sem hardcode que desatualiza sozinho. */
export async function getNetworksWithOffers(): Promise<NetworkOption[]> {
  const rows = await db.execute<{ slug: string; name: string }>(sql`
    SELECT DISTINCT n.slug, n.name
    FROM affiliate_networks n
    INNER JOIN affiliate_offers o ON o.network_id = n.id
    ORDER BY n.name ASC
  `);
  return rows.map((r) => ({ slug: r.slug, name: r.name }));
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
  /** Menor preço já visto (todas as lojas/plataformas do produto). Sem `eligibility.eligible` a UI NÃO deve exibir (com 1 cotação é o próprio preço atual). */
  lowestPriceCents: number;
  /** MÉDIA ÚNICA do produto (todas as lojas, todo o histórico, filtro 2x). null se !eligibility.eligible. */
  avgPriceCents: number | null;
  /** @deprecated Alias de `avgPriceCents` (nome legado; nunca foi 30 dias). Agora null sem histórico elegível, sem fallback inventado. */
  avgPriceCents30d: number | null;
  /** Credibilidade do histórico (>= 5 cotações e >= 14 dias). */
  eligibility: Eligibility;
  /** Veredito contra a média única (insufficient se histórico curto). */
  verdict: PriceVerdict;
  highestPriceCents: number | null;
  totalQuoteCount: number;
  offerId: string;
  offerSlug: string;
  networkName: string;
  networkColorHex: string | null;
  /** Selo "menor registrado"; exige elegibilidade, veredito calculável e nenhum bloqueio (isca, vendedor fraco, dispersão). */
  isLowestEver: boolean;
  /** % abaixo da média única, DERIVADO do veredito: só quando verdict.kind === 'below'; null nos demais. */
  avgDiscountPercent: number | null;
  /** Produto muito disperso (máx limpo / mín limpo > 3): sem selo e sem "abaixo do normal". */
  lowConfidence: boolean;
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
  const minQ = sql.raw(String(MIN_QUOTES_FOR_VERDICT));
  const minD = sql.raw(String(MIN_HISTORY_DAYS_FOR_VERDICT));
  const band = sql.raw(String(INLINE_BAND_PERCENT));
  const disp = sql.raw(String(DISPERSION_LOW_CONFIDENCE_RATIO));
  const soft = sql.raw(String(PLAUSIBILITY_SOFT_FLOOR_PERCENT / 100));
  const nearLo = sql.raw(String((100 - LOW_BADGE_CORROBORATION_BAND_PERCENT) / 100));
  const nearHi = sql.raw(String((100 + LOW_BADGE_CORROBORATION_BAND_PERCENT) / 100));
  const minSellers = sql.raw(String(LOW_BADGE_MIN_DISTINCT_SELLERS));
  // publicOffersCtes (ADR 0002): só ofertas com coleta real <= 7 dias e preço
  // plausível entram como "oferta mais barata" do produto.
  return sql`
    ${publicOffersCtes()},
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
        n.color_hex AS network_color_hex,
        ${weakSellerSql('sel')} AS seller_weak
      FROM master_products mp
      INNER JOIN affiliate_offers o ON o.master_product_id = mp.id
      INNER JOIN public_offers po ON po.id = o.id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
      WHERE ${whereClause}
      ORDER BY mp.id, o.current_price_cents ASC
    ),
    -- Agregados da fonte única (product-price-stats.ts, statsAggCtes): piso estrito,
    -- teto só nos agregados, mínimo sem vendedor fraco. Mesma definição da página do produto.
    ${statsAggCtes(sql`o.master_product_id IN (SELECT mp_id FROM distinct_products)`)},
    base AS (
      SELECT
        dp.mp_id, dp.mp_name, dp.mp_slug, dp.product_type, dp.game_format, dp.game_platform_gen,
        dp.default_images, dp.offer_id, dp.offer_slug, dp.current_price_cents,
        dp.network_name, dp.network_color_hex, dp.seller_weak,
        st.avg_cents AS avg_price_cents, st.min_all AS min_price_cents, st.max_cents AS max_price_cents,
        st.quote_count, st.history_days, st.pf_median,
        COALESCE(st.dispersion_ratio > ${disp}, false) AS low_confidence,
        (COALESCE(st.quote_count, 0) >= ${minQ} AND COALESCE(st.history_days, 0) >= ${minD}) AS eligible
      FROM distinct_products dp
      LEFT JOIN product_stats st ON st.master_product_id = dp.mp_id
    ),
    combined AS (
      SELECT b.*,
        -- % abaixo da média única: SÓ com histórico elegível, fora da faixa "em linha"
        -- e sem baixa confiança. Mesma regra de computeVerdict (kind 'below').
        CASE
          WHEN b.eligible AND b.avg_price_cents IS NOT NULL AND NOT b.low_confidence
            AND (b.avg_price_cents - b.current_price_cents) / b.avg_price_cents * 100 > ${band}
          THEN (b.avg_price_cents - b.current_price_cents) / b.avg_price_cents * 100
          ELSE NULL
        END AS discount_percent_raw,
        -- Selo "menor registrado" (espelha lowBadgeBlockReason em price-verdict.ts): elegível,
        -- no mínimo, sem dispersão alta, sem vendedor fraco e sem preço na zona de suspeita
        -- sem corroboração de vendedores distintos dentro da banda.
        (
          b.eligible AND b.avg_price_cents IS NOT NULL AND b.min_price_cents IS NOT NULL
          AND b.current_price_cents <= b.min_price_cents
          AND NOT b.low_confidence AND NOT b.seller_weak
          AND NOT (
            b.pf_median IS NOT NULL AND b.current_price_cents < b.pf_median * ${soft}
            AND (
              SELECT COUNT(DISTINCT COALESCE(o2.seller_id::text, 'rede:' || o2.network_id::text))
              FROM public_offers p2
              INNER JOIN affiliate_offers o2 ON o2.id = p2.id
              WHERE p2.master_product_id = b.mp_id
                AND p2.current_price_cents BETWEEN b.current_price_cents * ${nearLo} AND b.current_price_cents * ${nearHi}
            ) < ${minSellers}
          )
        ) AS low_badge_ok
      FROM base b
    )
  `;
}


async function fetchPriceTableData(filter: PriceTableFilter = {}): Promise<{ items: PriceTableRow[]; totalCount: number }> {
  const limit = filter.limit ?? 40;
  const offset = filter.offset ?? 0;

  const conditions: SQL[] = [sql`o.status = 'active'`, sql`o.current_price_cents > 0`, sql`NOT (mp.attributes ? 'mergedInto')`];

  // Dimensão (cartela pública): aba pedida = só o tipo EFETIVO daquela aba;
  // sem aba, esconde o que está fora da cartela (merchandise, peças, outras verticais).
  conditions.push(
    await catalogDimensionFilter({ idCol: sql`mp.id`, typeCol: sql`mp.product_type`, type: filter.productType })
  );
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
  if (filter.networkSlug) {
    conditions.push(sql`n.slug = ${filter.networkSlug}`);
  }
  if (filter.searchQuery && filter.searchQuery.trim().length > 0) {
    const fuzzy = fuzzyMatchRaw(['mp.name'], filter.searchQuery);
    if (fuzzy) conditions.push(fuzzy);
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
  // outliers) e só com histórico elegível; "abaixo" = fora da faixa "em linha"
  // (mesma regra do veredito). "Menor já visto" idem: exige elegibilidade.
  const belowAvgClause = sql`
    ${filter.onlyBelowAvg
      ? sql`AND discount_percent_raw IS NOT NULL AND discount_percent_raw > ${sql.raw(String(INLINE_BAND_PERCENT))}`
      : sql``}
    ${filter.onlyLowestEver ? sql`AND low_badge_ok` : sql``}
  `;

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
    // rodou o primeiro ciclo) — nunca inventa média/mínimo. A média única só
    // existe com histórico elegível (>= 5 cotações e >= 14 dias); antes havia
    // um fallback `avg = min ?? current` que fabricava "média" = preço atual.
    const minPriceCents = row.min_price_cents != null ? Number(row.min_price_cents) : null;
    const maxPriceCents = row.max_price_cents != null ? Number(row.max_price_cents) : null;
    const avgRaw = row.avg_price_cents != null ? Math.round(Number(row.avg_price_cents)) : null;
    const quoteCount = row.quote_count != null ? Number(row.quote_count) : 0;
    const historyDays = row.history_days != null ? Number(row.history_days) : 0;
    const eligibility = checkEligibility({ quoteCount, historyDays });
    const lowConfidence = row.low_confidence === true;
    const verdict = computeVerdict({ currentCents: currentPrice, avgCents: avgRaw, quoteCount, historyDays, lowConfidence });
    const avg = eligibility.eligible ? avgRaw : null;
    // F-14: o menor já visto inclui a oferta de hoje (nunca fica acima do preço atual).
    const lowest = minPriceCents != null ? Math.min(minPriceCents, currentPrice) : currentPrice;
    const highest = maxPriceCents ?? currentPrice;
    // Derivado do veredito único: só "abaixo do normal" tem % de desconto.
    const avgDiscountPercent =
      verdict.kind === 'below' && verdict.deltaPercent != null ? Math.round(-verdict.deltaPercent) : null;

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
      avgPriceCents: avg,
      avgPriceCents30d: avg,
      eligibility,
      verdict,
      highestPriceCents: highest,
      totalQuoteCount: quoteCount,
      offerId: row.offer_id,
      offerSlug: row.offer_slug,
      networkName: row.network_name,
      networkColorHex: row.network_color_hex,
      isLowestEver: row.low_badge_ok === true && verdict.kind !== 'insufficient',
      avgDiscountPercent,
      lowConfidence,
    };
  });

  return { items, totalCount };
}

export async function getPriceTableData(filter: PriceTableFilter = {}): Promise<{ items: PriceTableRow[]; totalCount: number }> {
  return priceTableDataCached(filter);
}

const priceTableDataCached = createCachedQuery(
  async (filter: PriceTableFilter) => fetchPriceTableData(filter),
  ['price-table-data'],
  { revalidate: 60, tags: ['price-table'] }
);


export interface PriceTableCounters {
  /** Produtos da cartela com oferta pública (= linhas da tabela sem filtro). */
  products: number;
  /** Linhas com o selo "menor registrado" (mesma definição de `isLowestEver`). */
  lowestEver: number;
  /** Linhas com veredito "abaixo do normal" (mesma definição do filtro "abaixo da média"). */
  belowAverage: number;
}

async function fetchPriceTableCounters(): Promise<PriceTableCounters> {
  const conditions: SQL[] = [
    sql`o.status = 'active'`,
    sql`o.current_price_cents > 0`,
    sql`NOT (mp.attributes ? 'mergedInto')`,
    await catalogDimensionFilter({ idCol: sql`mp.id`, typeCol: sql`mp.product_type` }),
  ];
  const ctes = buildCtes(sql.join(conditions, sql` AND `));
  // Varre as estatísticas do catálogo inteiro (~3 M cotações): pode passar dos 2 min do
  // statement_timeout padrão do banco quando há carga. Roda só em segundo plano (SWR, 30 min),
  // então ganha um teto próprio, restrito a esta transação (SET LOCAL).
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '8min'`);
    return tx.execute<{ products: number; lowest_ever: number; below_average: number }>(sql`
      WITH ${ctes}
      SELECT COUNT(*)::int AS products,
             COUNT(*) FILTER (WHERE low_badge_ok)::int AS lowest_ever,
             COUNT(*) FILTER (WHERE discount_percent_raw IS NOT NULL)::int AS below_average
      FROM combined
    `);
  });
  return {
    products: Number(rows[0]?.products ?? 0),
    lowestEver: Number(rows[0]?.lowest_ever ?? 0),
    belowAverage: Number(rows[0]?.below_average ?? 0),
  };
}

/**
 * Quantos produtos a tabela tem sem filtro (= `products` dos contadores) SEM calcular
 * estatística: só `public_offers` + `distinct_products` (as demais CTEs não são avaliadas
 * quando a consulta final não as referencia). ~1 s, contra ~70 s dos contadores completos.
 */
async function fetchPriceTableProductCount(): Promise<number> {
  const conditions: SQL[] = [
    sql`o.status = 'active'`,
    sql`o.current_price_cents > 0`,
    sql`NOT (mp.attributes ? 'mergedInto')`,
    await catalogDimensionFilter({ idCol: sql`mp.id`, typeCol: sql`mp.product_type` }),
  ];
  const ctes = buildCtes(sql.join(conditions, sql` AND `));
  const rows = await db.execute<{ products: number }>(sql`
    WITH ${ctes}
    SELECT COUNT(*)::int AS products FROM distinct_products
  `);
  return Number(rows[0]?.products ?? 0);
}

/** Total de produtos da tabela sem filtro (cache SWR de 5 min). Fonte do número "produtos" de TODAS as telas. */
export const getPriceTableProductCount = createCachedQuery(fetchPriceTableProductCount, ['price-table-product-count-v1'], {
  revalidate: 300,
  maxStaleSeconds: 24 * 3600,
});

/**
 * Selos agregados do catálogo inteiro (`lowestEver`, `belowAverage`): mesma definição das
 * linhas da tabela, mas a varredura de estatística de ~3 M de cotações leva ~70 s e roda
 * SÓ em segundo plano (SWR: fresco 30 min, recalculado por trás). Enquanto não houver o
 * primeiro cálculo devolve `null` (a tela omite o número em vez de mostrar zero).
 */
export const getPriceTableBadgeCounters = createCachedQuery(
  async (): Promise<{ lowestEver: number; belowAverage: number }> => {
    const c = await fetchPriceTableCounters();
    return { lowestEver: c.lowestEver, belowAverage: c.belowAverage };
  },
  ['price-table-badge-counters-v1'],
  { revalidate: 1800, maxStaleSeconds: 24 * 3600, coldTimeoutSeconds: 0, slot: true, hardTimeoutSeconds: 600 }
) as () => Promise<{ lowestEver: number; belowAverage: number } | null>;

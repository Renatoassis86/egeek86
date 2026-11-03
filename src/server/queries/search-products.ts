import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import type { GamePlatformGen, ProductType } from '@/db/schema';
import { publicOffersCtes } from '@/server/queries/public-offers';
import {
  getMasterProductPriceStatsBatch,
  type MasterProductPriceStats,
} from '@/server/queries/product-price-stats';
import {
  checkEligibility,
  computeLowBadge,
  computePriceDrop,
  computeVerdict,
  type PriceDrop,
  type VerdictKind,
} from '@/lib/affiliate/price-verdict';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { isBundleTitle, isKitKeywordTitle } from '@/lib/affiliate/product-type-classifier';
import { comparePreference, effectiveCatalogType } from '@/lib/catalog/dimensions';
import { readPlatform } from '@/lib/catalog/platform';
import {
  analyzeName,
  cleanProductTitle,
  extractPlatforms,
  foldText,
  parseQuery,
  scoreName,
  type ParsedQuery,
} from '@/lib/search/query-normalize';

/**
 * MOTOR DE BUSCA DE PRODUTOS (servidor). Unidade do resultado = master_product
 * (um jogo = um resultado agregado; masters arquivados `mergedInto` ficam de
 * fora). Só LEITURA, só ofertas PÚBLICAS (ADR 0002, `publicOffersCtes`),
 * estatística de preço pela fonte única (ADR 0001, `product-price-stats.ts`) e
 * selos/veredito por `price-verdict.ts` (só com histórico elegível).
 *
 * Duas etapas:
 *  A) SQL: candidatos = masters com >= 1 oferta pública que casam o termo por
 *     palavras (LIKE) ou por trigram (`word_similarity`, pg_trgm), já com
 *     agregados de preço/loja da oferta pública. Sem a migration 0020 (índice
 *     GIN) roda igual, com varredura sequencial (4,7 mil masters = poucos ms).
 *  B) TS (`query-normalize.ts`): decisão de relevância. Número de sequência
 *     tem de ser igual ("mario kart 8" nunca traz "mario kart 7"); toda
 *     palavra do termo tem de casar (exata, prefixo ou 1 erro de digitação);
 *     abaixo do corte não aparece (lixo) e, sem nada, devolve sugestão.
 *
 * Preço do resultado = menor preço atual PÚBLICO (concorrência real). Média
 * única, veredito e selos: `null` quando o histórico não é elegível.
 * Frete e prazo NÃO existem nos dados e não são filtro nem campo.
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type SearchSort = 'relevance' | 'price_asc' | 'discount' | 'stores';
export type SearchCondition = 'new' | 'used';
export type SearchProductKind = ProductType; // 'game' | 'console' | 'accessory'

export interface SearchProductsParams {
  /** Termo digitado. Vazio só é aceito junto de `platform` (navegação por plataforma). */
  term: string;
  /** Aba. Padrão 'game'. Console e acessório nunca se misturam ao jogo. */
  type?: SearchProductKind;
  /** Geração/plataforma ('ps5', 'switch_2', ...) ou apelido ('ps 5', 'xbox series x'). Sobrepõe a deduzida do termo. */
  platform?: GamePlatformGen | string | Array<GamePlatformGen | string>;
  /** Faixa do MENOR preço atual público do produto, em centavos. */
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Loja/marketplace: id, nome ("Mercado Livre") ou slug ("mercado-livre"). Só ofertas dessa(s) loja(s) contam no preço/ofertas. */
  store?: string | string[];
  /** 'new' | 'used'. Não há coluna de condição: deduzida do título da oferta (usado, seminovo, open box). */
  condition?: SearchCondition;
  sort?: SearchSort;
  /** Preenche `insights` nos itens da página (mais lento em produtos com muito histórico). Padrão false; 'discount' liga sozinho. */
  withInsights?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SearchStoreQuote {
  networkId: string;
  /** Nome da loja/marketplace (ex.: "Mercado Livre"). */
  storeName: string;
  /** Menor preço PÚBLICO desta loja para o produto, em centavos. */
  lowestPriceCents: number;
  /** Ofertas públicas do produto nesta loja. */
  offerCount: number;
  offerId: string;
  offerSlug: string;
  /** Página interna da oferta mais barata desta loja. */
  href: string;
  /** Para onde o clique de saída leva (ver `SearchProduct.outboundUrl`). */
  outboundUrl: string | null;
  /** Interno (servidor/analytics). A UI do cliente nunca exibe isso. */
  isAffiliateLink: boolean;
}

export interface SearchHistoricLow {
  priceCents: number;
  /** ISO da cotação. */
  at: string;
  storeName: string;
  /** false => rotular "encerrada". */
  offerActive: boolean;
  /** true => o mínimo bruto estava abaixo do piso de plausibilidade e foi trocado pelo menor plausível. */
  floorReplacedRaw: boolean;
  /** false => não havia régua para aplicar o piso (poucas ofertas e histórico não elegível): valor bruto. */
  floorApplied: boolean;
}

export interface SearchProduct {
  masterProductId: string;
  /** Título limpo (sem plataforma, formato, condição comercial). */
  title: string;
  /** Nome cru do master (auditoria). */
  rawName: string;
  imageUrl: string | null;
  platform: GamePlatformGen;
  platformLabel: string;
  /** Plataforma legada fora do enum citada no título (Wii U, 3DS, PS2...), só quando platform = 'unknown'. Exibição. */
  legacyPlatformLabel: string | null;
  productType: SearchProductKind;
  /** Kit/lote/combo/bundle. Console com jogo: selo "Bundle" na aba Consoles e FORA da média/menor preço do console puro. */
  isBundle: boolean;
  /** 0..1 (1 = título exato). */
  relevance: number;

  /** Menor preço atual público, em centavos (respeita os filtros de loja/condição). */
  lowestPriceCents: number;
  lowestStoreName: string;
  /** Link interno da oferta mais barata (/ofertas/[slug]). */
  href: string;
  /**
   * Link de saída da oferta mais barata: o link de afiliado quando real
   * (`affiliate_link_pending = false`); enquanto pendente, a URL pública do
   * anúncio que está em `affiliate_url` (a descoberta grava ali a página
   * pública do produto). `null` se a coluna não tiver URL http(s) válida.
   * Nunca inventada.
   */
  outboundUrl: string | null;
  /** Interno: true só se `affiliate_link_pending = false` e há URL http(s). A UI do cliente nunca exibe a palavra afiliado. */
  isAffiliateLink: boolean;
  /** Lojas, da mais barata para a mais cara, cada uma com sua oferta mais barata. */
  stores: SearchStoreQuote[];
  storeCount: number;
  offerCount: number;

  /**
   * Média única, veredito, selos e menor histórico. null = ainda não carregado
   * (padrão: o histórico de preços custa uma varredura de snapshots, ver
   * `getSearchInsights`) — NÃO significa "sem histórico". Vem preenchido
   * quando `withInsights: true` ou `sort: 'discount'`.
   */
  insights: SearchInsights | null;
}

/** Estatística de preço do PRODUTO (todas as lojas, ADR 0001) + selos (só com histórico elegível). */
export interface SearchInsights {
  masterProductId: string;
  /** Menor preço público atual do produto em todas as lojas (base do veredito). */
  currentCents: number | null;
  /** Média única (todas as lojas, todo o histórico, filtro 2x); null sem elegibilidade. */
  avgPriceCents: number | null;
  verdict: VerdictKind;
  /** (preço − média)/média em %, negativo = abaixo da média. null se `verdict === 'insufficient'`. */
  verdictDeltaPercent: number | null;
  /** % abaixo da média (positivo = mais barato que a média). null sem elegibilidade. */
  discountVsAvgPercent: number | null;
  eligible: boolean;
  quoteCount: number;
  historyDays: number;
  /** Selo "menor preço já registrado" (só com elegibilidade). */
  lowestEverBadge: boolean;
  /** "Preço em queda" (só com elegibilidade). */
  priceDrop: PriceDrop | null;
  priceFalling: boolean;
  /** Menor preço histórico, com piso de plausibilidade; null sem cotações. */
  historicLow: SearchHistoricLow | null;
}

export interface SearchFacets {
  /** Resultados por aba para o termo (independe da aba escolhida). */
  types: Record<SearchProductKind, number>;
  /** Por plataforma, dentro da aba escolhida (antes do filtro de plataforma). */
  platforms: Partial<Record<GamePlatformGen, number>>;
  /** Por loja, dentro da aba/plataforma escolhidas (reflete o filtro de loja já aplicado). */
  stores: Array<{ storeName: string; products: number }>;
}

export type SearchEmptyReason = 'generic_term' | 'no_match' | 'filtered_out';

export interface SearchProductsResult {
  term: string;
  /** Termo normalizado, sem plataforma. */
  normalizedTerm: string;
  /** Plataforma efetivamente aplicada (explícita ou deduzida do termo). */
  appliedPlatform: GamePlatformGen | null;
  platformFromTerm: boolean;
  type: SearchProductKind;
  sort: SearchSort;
  items: SearchProduct[];
  /** Total de produtos (todas as páginas). */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** true quando a ordenação por desconto só avaliou os `DISCOUNT_SORT_POOL` mais relevantes. */
  truncated: boolean;
  facets: SearchFacets;
  emptyReason: SearchEmptyReason | null;
  /** Sugestões ("quis dizer") quando não há nenhum casamento; vazio caso contrário. */
  didYouMean: string[];
}

export interface ProductSuggestion {
  masterProductId: string;
  title: string;
  platform: GamePlatformGen;
  platformLabel: string;
  legacyPlatformLabel: string | null;
  productType: SearchProductKind;
  /** Selo Bundle no autocomplete. */
  isBundle: boolean;
  lowestPriceCents: number;
  offerCount: number;
  storeCount: number;
  imageUrl: string | null;
  /** /ofertas/[slug] da oferta pública mais barata. */
  href: string;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const SEARCH_MIN_RELEVANCE = 0.55;
export const SEARCH_DEFAULT_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE_SIZE = 60;
/** Ordenar por desconto exige estatística de histórico (varredura de snapshots): limita aos N mais relevantes. */
export const DISCOUNT_SORT_POOL = 30;
const CANDIDATE_LIMIT = 800;
const BROWSE_LIMIT = 1500;
/** Navegação só por dimensão (termo "console"): sem corte por oferta, a aba inteira. */
const DIMENSION_BROWSE_LIMIT = 6000;
const WSIM_STRICT = 0.45;
const WSIM_RELAXED = 0.3;
const CACHE_SECONDS = 60;
const CACHE_TAGS = ['affiliate-offers', 'price-snapshots'];

const PLATFORM_VALUES: ReadonlySet<string> = new Set([
  'switch_1', 'switch_2', 'ps4', 'ps5', 'xbox_one', 'xbox_series', 'xbox_360', 'unknown',
]);

// ---------------------------------------------------------------------------
// SQL: normalização do nome (função da migration 0020 se existir; senão inline)
// ---------------------------------------------------------------------------

const NORM_INLINE_TEMPLATE =
  "btrim(regexp_replace(regexp_replace(regexp_replace(lower(unaccent(COL)), '[''’`´]', '', 'g'), '[^a-z0-9]+', ' ', 'g'), '([a-z])([0-9])', '\\1 \\2', 'g'))";

let normFnState: { at: number; has: boolean } | null = null;

async function hasNormFunction(): Promise<boolean> {
  const now = Date.now();
  if (normFnState && now - normFnState.at < 5 * 60_000) return normFnState.has;
  let has = false;
  try {
    const rows = await db.execute<{ ok: boolean }>(
      sql`SELECT to_regprocedure('public.egeek_search_norm(text)') IS NOT NULL AS ok`
    );
    has = Boolean(rows[0]?.ok);
  } catch {
    has = false;
  }
  normFnState = { at: now, has };
  return has;
}

function normExpr(col: string, useFn: boolean): SQL {
  return useFn ? sql.raw(`public.egeek_search_norm(${col})`) : sql.raw(NORM_INLINE_TEMPLATE.replace('COL', col));
}

// ---------------------------------------------------------------------------
// Etapa A: candidatos no banco
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface StoreJson {
  networkId: string;
  networkName: string;
  offerId: string;
  offerSlug: string;
  priceCents: number;
  previousPriceCents: number | null;
  changedAt: string | null;
  imageUrl: string | null;
  outboundUrl: string | null;
  pending: boolean;
  offerCount: number;
}

interface Candidate {
  id: string;
  name: string;
  slug: string;
  dbType: ProductType;
  dbPlatform: GamePlatformGen;
  defaultImage: string | null;
  offerCount: number;
  networkCount: number;
  minPrice: number;
  stores: StoreJson[];
  pubOfferCount: number;
  pubMedian: number | null;
  wsim: number;
}

interface FetchOptions {
  limit: number;
  relaxed?: boolean;
  /** Termo sem texto: só plataforma. */
  browsePlatform?: GamePlatformGen | null;
  stores?: string[];
  condition?: SearchCondition;
}

const USED_RE = "'\\m(usad[oa]s?|seminov[oa]s?|used|open ?box|recondicionad[oa]s?)\\M'";

function variantText(v: { words: string[]; numbers: string[] }): string {
  return [...v.words, ...v.numbers].join(' ');
}

async function fetchCandidates(q: ParsedQuery, o: FetchOptions): Promise<Candidate[]> {
  const useFn = await hasNormFunction();
  const norm = normExpr('m.name', useFn);

  // filtros no nível da oferta
  const offerFilters: SQL[] = [];
  if (o.stores?.length) {
    const lowered = o.stores.map((s) => foldText(s).trim());
    const slugs = lowered.map((s) => s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    offerFilters.push(
      sql`(n.id::text IN (${sql.join(o.stores.map((s) => sql`${s}`), sql`, `)})
        OR lower(n.name) IN (${sql.join(lowered.map((s) => sql`${s}`), sql`, `)})
        OR regexp_replace(lower(n.name), '[^a-z0-9]+', '-', 'g') IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)}))`
    );
  }
  if (o.condition === 'used') offerFilters.push(sql`o.title ~* ${sql.raw(USED_RE)}`);
  if (o.condition === 'new') offerFilters.push(sql`o.title !~* ${sql.raw(USED_RE)}`);
  const offerWhere = offerFilters.length ? sql` AND ${sql.join(offerFilters, sql` AND `)}` : sql``;

  // casamento de texto
  const usable = q.variants.filter((v) => v.words.length > 0 || v.numbers.length > 0);
  let textPred: SQL;
  let wsimExpr: SQL;
  if (o.browsePlatform !== undefined && usable.length === 0) {
    textPred = o.browsePlatform
      ? sql`(m.game_platform_gen = ${o.browsePlatform} OR m.game_platform_gen = 'unknown')`
      : sql`TRUE`;
    wsimExpr = sql`0::real`;
  } else {
    const wsims = usable.map((v) => sql`word_similarity(${variantText(v)}::text, ${norm})`);
    wsimExpr = wsims.length === 1 ? wsims[0] : sql`GREATEST(${sql.join(wsims, sql`, `)})`;
    const threshold = o.relaxed ? WSIM_RELAXED : WSIM_STRICT;
    const likes: SQL[] = [];
    if (!o.relaxed) {
      for (const v of usable) {
        const patterns = v.words.map((w) => sql`${'%' + w + '%'}`);
        if (patterns.length) {
          likes.push(sql`(${norm}) LIKE ALL (ARRAY[${sql.join(patterns, sql`, `)}]::text[])`);
        } else {
          const nums = v.numbers.map((n) => sql`${'% ' + n + ' %'}`);
          likes.push(sql`(' ' || ${norm} || ' ') LIKE ALL (ARRAY[${sql.join(nums, sql`, `)}]::text[])`);
        }
      }
    }
    textPred = sql`(${likes.length ? sql`${sql.join(likes, sql` OR `)} OR ` : sql``}${wsimExpr} >= ${threshold})`;
  }

  const rows = await db.execute<Row>(sql`
    WITH ${publicOffersCtes()},
    pub_ref AS (
      SELECT po.master_product_id AS mid, COUNT(*)::int AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY po.current_price_cents) AS med
      FROM public_offers po GROUP BY po.master_product_id
    ),
    po AS (
      SELECT o.id, o.master_product_id AS mid, o.network_id, n.name AS network_name, o.slug,
             o.current_price_cents::bigint AS price, o.previous_price_cents::bigint AS prev,
             o.last_price_change_at AS changed_at, o.image_url, o.affiliate_url,
             o.affiliate_link_pending AS pending
      FROM affiliate_offers o
      INNER JOIN public_offers p ON p.id = o.id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      WHERE TRUE${offerWhere}
    ),
    store_best AS (
      SELECT DISTINCT ON (po.mid, po.network_id) po.*,
             COUNT(*) OVER (PARTITION BY po.mid, po.network_id)::int AS n_offers
      FROM po
      ORDER BY po.mid, po.network_id, po.price ASC, po.id
    ),
    agg AS (
      SELECT sb.mid, SUM(sb.n_offers)::int AS offer_count, COUNT(*)::int AS network_count,
             MIN(sb.price) AS min_price,
             jsonb_agg(jsonb_build_object(
               'networkId', sb.network_id, 'networkName', sb.network_name, 'offerId', sb.id,
               'offerSlug', sb.slug, 'priceCents', sb.price, 'previousPriceCents', sb.prev,
               'changedAt', sb.changed_at, 'imageUrl', sb.image_url, 'outboundUrl', sb.affiliate_url,
               'pending', sb.pending, 'offerCount', sb.n_offers
             ) ORDER BY sb.price ASC, sb.network_name ASC) AS stores
      FROM store_best sb GROUP BY sb.mid
    )
    SELECT m.id, m.name, m.slug, m.product_type, m.game_platform_gen,
           m.default_images ->> 0 AS default_image,
           a.offer_count, a.network_count, a.min_price, a.stores,
           r.n AS pub_offer_count, r.med AS pub_median,
           ${wsimExpr} AS wsim
    FROM master_products m
    INNER JOIN agg a ON a.mid = m.id
    LEFT JOIN pub_ref r ON r.mid = m.id
    WHERE NOT (m.attributes ? 'mergedInto')
      AND ${textPred}
    ORDER BY wsim DESC, a.offer_count DESC, m.id
    LIMIT ${o.limit}
  `);

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    slug: String(r.slug ?? ''),
    dbType: r.product_type as ProductType,
    dbPlatform: r.game_platform_gen as GamePlatformGen,
    defaultImage: (r.default_image as string | null) ?? null,
    offerCount: Number(r.offer_count),
    networkCount: Number(r.network_count),
    minPrice: Number(r.min_price),
    stores: (r.stores as StoreJson[]) ?? [],
    pubOfferCount: Number(r.pub_offer_count ?? 0),
    pubMedian: r.pub_median != null ? Number(r.pub_median) : null,
    wsim: Number(r.wsim ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Classificação efetiva (só leitura; não escreve no banco)
// ---------------------------------------------------------------------------

function effectivePlatform(c: Candidate): GamePlatformGen {
  return readPlatform(c.dbPlatform, c.name).platform;
}

/** Selo (qualquer bundle) x regra estreita que tira kit/lote/combo/bundle da aba Jogos. */
function bundleFlags(name: string): { bundle: boolean; kit: boolean } {
  return { bundle: isBundleTitle(name) || /\bbundle\b/i.test(name), kit: isKitKeywordTitle(name) };
}

/**
 * Tipo efetivo (aba) pela regra única de dimensões (`src/lib/catalog/dimensions.ts`):
 * o título corrige o tipo gravado (acessório/console tipado como jogo, etc.)
 * enquanto o UPDATE em lote não for aprovado. `null` = fora da cartela de games
 * (merchandise, peça/embalagem, outra vertical): NUNCA aparece em aba, facet,
 * sugestão nem autocomplete. Nunca promove acessório/console do banco a jogo.
 */
function effectiveType(c: Candidate): ProductType | null {
  return effectiveCatalogType(c.name, c.dbType);
}

function isHttpUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\/\S+$/i.test(u.trim());
}

function toStoreQuote(s: StoreJson): SearchStoreQuote {
  const url = isHttpUrl(s.outboundUrl) ? s.outboundUrl.trim() : null;
  return {
    networkId: s.networkId,
    storeName: s.networkName,
    lowestPriceCents: Number(s.priceCents),
    offerCount: Number(s.offerCount),
    offerId: s.offerId,
    offerSlug: s.offerSlug,
    href: `/ofertas/${s.offerSlug}`,
    outboundUrl: url,
    isAffiliateLink: url !== null && s.pending === false,
  };
}

// ---------------------------------------------------------------------------
// Termo de dimensão (F-20): "console" e "controle" são nomes de aba, não palavras de título
// ---------------------------------------------------------------------------

const DIMENSION_WORDS: Record<string, ProductType> = {
  console: 'console',
  consoles: 'console',
  controle: 'accessory',
  controles: 'accessory',
  acessorio: 'accessory',
  acessorios: 'accessory',
};

/**
 * Tira do termo as palavras que nomeiam uma dimensão (console, controle,
 * acessório) e devolve a dimensão pedida. A busca então usa a dimensão
 * CLASSIFICADA do produto, não a palavra no título: "console" não traz
 * "Mortal Kombat 1 Para Console" e "controle" não traz "Madden NFL 19 Controle
 * Real Player Motion". O resto do termo ("controle ps5" -> "ps5") segue a busca normal.
 */
export function splitDimensionTerm(term: string): { term: string; intent: ProductType | null } {
  const words = foldText(term ?? '').split(/\s+/).filter(Boolean);
  let intent: ProductType | null = null;
  const rest: string[] = [];
  for (const w of words) {
    const d = DIMENSION_WORDS[w];
    if (d) intent = intent ?? d;
    else rest.push(w);
  }
  return intent ? { term: rest.join(' '), intent } : { term: String(term ?? ''), intent: null };
}

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

function toPlatformList(input: SearchProductsParams['platform']): GamePlatformGen[] {
  const arr = Array.isArray(input) ? input : input ? [input] : [];
  const out: GamePlatformGen[] = [];
  for (const raw of arr) {
    const s = String(raw).trim().toLowerCase();
    if (PLATFORM_VALUES.has(s)) {
      out.push(s as GamePlatformGen);
      continue;
    }
    const { platforms } = extractPlatforms(foldText(s));
    if (platforms.length === 1) out.push(platforms[0]);
  }
  return [...new Set(out)];
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

interface NormalizedParams {
  term: string;
  type: SearchProductKind;
  platforms: GamePlatformGen[];
  minPriceCents: number | null;
  maxPriceCents: number | null;
  stores: string[];
  condition: SearchCondition | null;
  sort: SearchSort;
  withInsights: boolean;
  page: number;
  pageSize: number;
}

function normalizeParams(p: SearchProductsParams): NormalizedParams {
  const stores = (Array.isArray(p.store) ? p.store : p.store ? [p.store] : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 6)
    .sort();
  return {
    term: String(p.term ?? '').slice(0, 120).trim(),
    type: p.type === 'console' || p.type === 'accessory' ? p.type : 'game',
    platforms: toPlatformList(p.platform).sort(),
    minPriceCents: p.minPriceCents != null && Number.isFinite(+p.minPriceCents) ? Math.max(0, Math.trunc(+p.minPriceCents)) : null,
    maxPriceCents: p.maxPriceCents != null && Number.isFinite(+p.maxPriceCents) ? Math.max(0, Math.trunc(+p.maxPriceCents)) : null,
    stores,
    condition: p.condition === 'used' || p.condition === 'new' ? p.condition : null,
    sort: p.sort === 'price_asc' || p.sort === 'discount' || p.sort === 'stores' ? p.sort : 'relevance',
    withInsights: p.withInsights === true,
    page: clampInt(p.page, 1, 10_000, 1),
    pageSize: clampInt(p.pageSize, 1, SEARCH_MAX_PAGE_SIZE, SEARCH_DEFAULT_PAGE_SIZE),
  };
}

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

interface Scored {
  c: Candidate;
  relevance: number;
  type: ProductType;
  platform: GamePlatformGen;
  /** Selo Bundle (regra ampla). */
  bundle: boolean;
  /** kit/lote/combo/bundle explícito: some da aba Jogos, salvo se o termo pedir. */
  kit: boolean;
  legacy: string | null;
}

function scoreCandidates(q: ParsedQuery, rows: Candidate[], opts: { prefixLast?: boolean; relaxed?: boolean; browse?: boolean }): Scored[] {
  const out: Scored[] = [];
  const usable = q.variants.some((v) => v.words.length > 0 || v.numbers.length > 0);
  for (const c of rows) {
    let relevance = 1;
    if (usable) {
      const s = scoreName(q, analyzeName(c.name), { prefixLast: opts.prefixLast, relaxed: opts.relaxed, trigram: c.wsim });
      if (!s) continue;
      relevance = s.relevance;
    }
    if (relevance < (opts.relaxed ? 0.5 : SEARCH_MIN_RELEVANCE)) continue;
    const type = effectiveType(c);
    if (type === null) continue; // fora da cartela pública
    const rp = readPlatform(c.dbPlatform, c.name);
    out.push({ c, relevance, type, platform: rp.platform, legacy: rp.legacyLabel, ...bundleFlags(c.name) });
  }
  return out;
}

function emptyFacets(): SearchFacets {
  return { types: { game: 0, console: 0, accessory: 0 }, platforms: {}, stores: [] };
}

function emptyResult(n: NormalizedParams, q: ParsedQuery | null, reason: SearchEmptyReason, extra: Partial<SearchProductsResult> = {}): SearchProductsResult {
  return {
    term: n.term,
    normalizedTerm: q?.normalized ?? '',
    appliedPlatform: null,
    platformFromTerm: false,
    type: n.type,
    sort: n.sort,
    items: [],
    total: 0,
    page: n.page,
    pageSize: n.pageSize,
    pageCount: 0,
    truncated: false,
    facets: emptyFacets(),
    emptyReason: reason,
    didYouMean: [],
    ...extra,
  };
}

function sortScored(list: Scored[], sort: SearchSort): Scored[] {
  const bucket = (s: Scored) => Math.round(s.relevance * 20);
  // preferência: jogos > consoles > acessórios (só desempata quando a lista mistura abas)
  const byRel = (a: Scored, b: Scored) =>
    bucket(b) - bucket(a) || comparePreference(a.type, b.type) || b.c.offerCount - a.c.offerCount || a.c.minPrice - b.c.minPrice || a.c.name.localeCompare(b.c.name);
  const copy = [...list];
  if (sort === 'price_asc') copy.sort((a, b) => a.c.minPrice - b.c.minPrice || byRel(a, b));
  else if (sort === 'stores') copy.sort((a, b) => b.c.networkCount - a.c.networkCount || b.c.offerCount - a.c.offerCount || byRel(a, b));
  else copy.sort(byRel);
  return copy;
}

function buildBaseItems(list: Scored[]): SearchProduct[] {
  return list.map((s) => {
    const c = s.c;
    const stores = c.stores.map(toStoreQuote);
    const best = stores[0];
    return {
      masterProductId: c.id,
      title: cleanProductTitle(c.name, { keepPlatform: s.type !== 'game' }),
      rawName: c.name,
      imageUrl: c.stores[0].imageUrl || c.defaultImage || null,
      platform: s.platform,
      platformLabel: GAME_PLATFORM_GEN_LABELS[s.platform],
      legacyPlatformLabel: s.legacy,
      productType: s.type,
      isBundle: s.bundle,
      relevance: Math.round(s.relevance * 1000) / 1000,
      lowestPriceCents: best.lowestPriceCents,
      lowestStoreName: best.storeName,
      href: best.href,
      outboundUrl: best.outboundUrl,
      isAffiliateLink: best.isAffiliateLink,
      stores,
      storeCount: stores.length,
      offerCount: c.offerCount,
      insights: null,
    };
  });
}

/**
 * Média única, veredito, selos, queda e menor histórico com piso, para uma
 * lista de produtos (fonte única de estatística, ADR 0001; elegibilidade,
 * ADR 0001 item 4; piso e frescor, ADR 0002). Escopo: PRODUTO, todas as
 * lojas (ignora filtro de loja/condição da busca).
 *
 * Custo: varredura dos snapshots (3,2 mi de linhas no banco; o produto mais
 * cotado tem ~300 mil). Produtos comuns levam centenas de ms; os mais
 * populares, segundos. Por isso a busca NÃO chama isto por padrão: a UI
 * renderiza a grade e hidrata os selos com esta função (cache de 10 min).
 * O agregado diário (EG-11, migration) tornaria isto instantâneo.
 *
 * Piso do menor histórico: vem da fonte única (product-price-stats.ts): cotação
 * < PLAUSIBILITY_FLOOR_PERCENT % da mediana das cotações do produto é isca e
 * não entra no mínimo.
 */
async function computeInsights(ids: string[]): Promise<Record<string, SearchInsights>> {
  const out: Record<string, SearchInsights> = {};
  if (!ids.length) return out;
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

  const [statsMap, ctxRows] = await Promise.all([
    getMasterProductPriceStatsBatch(ids),
    db.execute<Row>(sql`
      WITH ${publicOffersCtes()},
      cheapest AS (
        SELECT DISTINCT ON (o.master_product_id)
               o.master_product_id AS mid, o.current_price_cents::bigint AS price,
               o.previous_price_cents::bigint AS prev, o.last_price_change_at AS changed_at
        FROM affiliate_offers o
        INNER JOIN public_offers p ON p.id = o.id
        WHERE o.master_product_id IN (${idList})
        ORDER BY o.master_product_id, o.current_price_cents ASC, o.last_checked_at DESC NULLS LAST
      )
      SELECT c.mid, c.price, c.prev, c.changed_at FROM cheapest c
    `),
  ]);
  const ctx = new Map(ctxRows.map((r) => [String(r.mid), r]));

  for (const id of ids) {
    const st: MasterProductPriceStats | undefined = statsMap.get(id);
    const c = ctx.get(id);
    const quoteCount = st?.quoteCount ?? 0;
    const historyDays = st?.historyDays ?? 0;
    const eligible = checkEligibility({ quoteCount, historyDays }).eligible;
    const current = c?.price != null ? Number(c.price) : null;
    const verdict = computeVerdict({ quoteCount, historyDays, currentCents: current, avgCents: st?.avgCents, lowConfidence: st?.lowConfidence });

    // Piso de plausibilidade já aplicado na fonte única (product-price-stats.ts).
    const historicLow: SearchHistoricLow | null = st?.lowAll
      ? {
          priceCents: st.lowAll.priceCents,
          at: st.lowAll.at,
          storeName: st.lowAll.networkName,
          offerActive: st.lowAll.offerActive,
          floorReplacedRaw: st.floorApplied,
          floorApplied: st.floorCents != null,
        }
      : null;

    const priceDrop = computePriceDrop({
      quoteCount,
      historyDays,
      currentCents: current,
      previousCents: c?.prev != null ? Number(c.prev) : null,
      changedAt: (c?.changed_at as string | Date | null | undefined) ?? null,
    });

    out[id] = {
      masterProductId: id,
      currentCents: current,
      avgPriceCents: eligible && st?.avgCents ? st.avgCents : null,
      verdict: verdict.kind,
      verdictDeltaPercent: verdict.deltaPercent,
      discountVsAvgPercent: verdict.deltaPercent != null ? Math.round(-verdict.deltaPercent * 10) / 10 : null,
      eligible,
      quoteCount,
      historyDays,
      lowestEverBadge: computeLowBadge({ quoteCount, historyDays, currentCents: current, lowestCents: historicLow?.priceCents, blocked: (st?.lowBadgeBlock ?? null) !== null }),
      priceDrop,
      priceFalling: priceDrop !== null,
      historicLow,
    };
  }
  return out;
}

const insightsCached = createCachedQuery(
  async (ids: string[]): Promise<Record<string, SearchInsights>> => computeInsights(ids),
  ['search-insights-v1'],
  { revalidate: 600, tags: CACHE_TAGS }
);

/** Insights de até 60 produtos (cache de 10 min). Para a UI hidratar a grade depois de renderizá-la. */
export async function getSearchInsights(masterProductIds: string[]): Promise<Record<string, SearchInsights>> {
  const ids = [...new Set(masterProductIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].sort().slice(0, 60);
  return insightsCached(ids);
}

/** Sem cache (scripts de medição). */
export async function getSearchInsightsUncached(masterProductIds: string[]): Promise<Record<string, SearchInsights>> {
  return computeInsights([...new Set(masterProductIds)].slice(0, 60));
}

async function attachInsights(items: SearchProduct[]): Promise<SearchProduct[]> {
  const map = await getSearchInsights(items.map((i) => i.masterProductId));
  return items.map((i) => ({ ...i, insights: map[i.masterProductId] ?? null }));
}

async function didYouMean(q: ParsedQuery, n: NormalizedParams): Promise<string[]> {
  if (!q.hasText) return [];
  const rows = await fetchCandidates(q, { limit: 60, relaxed: true, stores: n.stores, condition: n.condition ?? undefined });
  const scored = scoreCandidates(q, rows, { relaxed: true })
    // sugestão = jogo (ou a aba pedida), com a mesma plataforma se o termo citou uma
    .filter((s) => s.type === n.type && (!q.platform || s.platform === q.platform))
    .sort((a, b) => b.relevance - a.relevance || b.c.offerCount - a.c.offerCount);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scored) {
    const t = cleanProductTitle(s.c.name, { keepPlatform: s.type !== 'game' });
    const key = foldText(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

async function runSearch(n: NormalizedParams): Promise<SearchProductsResult> {
  const explicitPlatform = n.platforms.length > 0;
  const dim = splitDimensionTerm(n.term);
  const q = parseQuery(dim.term);
  const browseMode = !q.hasText && (explicitPlatform || q.platform !== null || dim.intent !== null);
  if (q.generic && !explicitPlatform && !dim.intent) return emptyResult(n, q, 'generic_term');
  if (!q.hasText && !browseMode) return emptyResult(n, q, 'generic_term');

  const platformFromTerm = !explicitPlatform && q.platform !== null;
  const wantedPlatforms: GamePlatformGen[] = explicitPlatform ? n.platforms : q.platform ? [q.platform] : [];

  const rows = await fetchCandidates(q, {
    limit: browseMode ? (dim.intent && !q.hasText && !explicitPlatform && !q.platform ? DIMENSION_BROWSE_LIMIT : BROWSE_LIMIT) : CANDIDATE_LIMIT,
    browsePlatform: browseMode ? (wantedPlatforms.length === 1 ? wantedPlatforms[0] : null) : undefined,
    stores: n.stores,
    condition: n.condition ?? undefined,
  });

  // 1) relevância (corte) + bundles escondidos nas abas de jogo
  let scored = scoreCandidates(q, rows, { browse: browseMode });
  scored = scored.filter((s) => q.wantsBundle || s.type !== 'game' || !s.kit);
  // termo de dimensão: só produtos CLASSIFICADOS nela (vale para as abas, facets e total)
  if (dim.intent) scored = scored.filter((s) => s.type === dim.intent);

  if (scored.length === 0) {
    return emptyResult(n, q, 'no_match', {
      appliedPlatform: wantedPlatforms[0] ?? null,
      platformFromTerm,
      didYouMean: await didYouMean(q, n),
    });
  }

  // Facets: cada contagem é exatamente o que o usuário vê ao clicar nela
  // (aplica todos os eixos, menos o próprio). A loja e a condição já filtram
  // no SQL, então valem para todos os eixos.
  const passPlatform = (s: Scored) => wantedPlatforms.length === 0 || wantedPlatforms.includes(s.platform);
  const passPrice = (s: Scored) =>
    (n.minPriceCents == null || s.c.minPrice >= n.minPriceCents) && (n.maxPriceCents == null || s.c.minPrice <= n.maxPriceCents);

  const facets = emptyFacets();
  for (const s of scored) {
    if (passPlatform(s) && passPrice(s)) facets.types[s.type]++; // eixo tipo: aplica plataforma e preço
    // eixo plataforma: aplica tipo e preço. Em navegação por plataforma (termo = só "ps5") a plataforma É o termo: só ela conta.
    if (s.type === n.type && passPrice(s) && (!browseMode || wantedPlatforms.includes(s.platform))) {
      facets.platforms[s.platform] = (facets.platforms[s.platform] ?? 0) + 1;
    }
  }

  // lista final = tipo + plataforma + preço (mesmo conjunto da aba)
  const filtered = scored.filter((s) => s.type === n.type && passPlatform(s) && passPrice(s));

  const storeCounts = new Map<string, number>();
  for (const s of filtered) for (const st of s.c.stores) storeCounts.set(st.networkName, (storeCounts.get(st.networkName) ?? 0) + 1);
  facets.stores = [...storeCounts].map(([storeName, products]) => ({ storeName, products })).sort((a2, b2) => b2.products - a2.products);

  if (filtered.length === 0) {
    return emptyResult(n, q, 'filtered_out', {
      appliedPlatform: wantedPlatforms[0] ?? null,
      platformFromTerm,
      facets,
    });
  }

  // 5) ordenação + página
  let sorted = sortScored(filtered, n.sort === 'discount' ? 'relevance' : n.sort);
  let truncated = false;
  let pageItems: SearchProduct[];
  const total = sorted.length;
  let pageable = total; // itens que a ordenação consegue paginar (menor que total só em 'discount' truncado)

  if (n.sort === 'discount') {
    truncated = sorted.length > DISCOUNT_SORT_POOL;
    sorted = sorted.slice(0, DISCOUNT_SORT_POOL);
    pageable = sorted.length;
    const all = await attachInsights(buildBaseItems(sorted));
    const disc = (x: SearchProduct) => x.insights?.discountVsAvgPercent ?? null;
    all.sort((a, b) => {
      const da = disc(a);
      const db2 = disc(b);
      if (da != null && db2 != null) return db2 - da || b.relevance - a.relevance;
      if (da != null) return -1;
      if (db2 != null) return 1;
      return b.relevance - a.relevance;
    });
    pageItems = all.slice((n.page - 1) * n.pageSize, n.page * n.pageSize);
  } else {
    const base = buildBaseItems(sorted.slice((n.page - 1) * n.pageSize, n.page * n.pageSize));
    pageItems = n.withInsights ? await attachInsights(base) : base;
  }

  return {
    term: n.term,
    normalizedTerm: q.normalized,
    appliedPlatform: wantedPlatforms[0] ?? null,
    platformFromTerm,
    type: n.type,
    sort: n.sort,
    items: pageItems,
    total,
    page: n.page,
    pageSize: n.pageSize,
    pageCount: Math.ceil(pageable / n.pageSize),
    truncated,
    facets,
    emptyReason: null,
    didYouMean: [],
  };
}

const searchProductsCached = createCachedQuery(
  async (n: NormalizedParams): Promise<SearchProductsResult> => runSearch(n),
  ['search-products-v4'],
  { revalidate: CACHE_SECONDS, tags: CACHE_TAGS }
);

/**
 * Busca de produtos, paginada, com cache de 60 s por combinação de parâmetros.
 * Nunca lança por termo ruim: devolve `items: []` com `emptyReason`.
 */
export async function searchProducts(params: SearchProductsParams): Promise<SearchProductsResult> {
  return searchProductsCached(normalizeParams(params));
}

/** Versão sem cache (scripts de medição). */
export async function searchProductsUncached(params: SearchProductsParams): Promise<SearchProductsResult> {
  return runSearch(normalizeParams(params));
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

async function runSuggestSql(term: string, limit: number, types: ProductType[]): Promise<ProductSuggestion[]> {
  const run = async (t: string, partial?: string): Promise<Scored[]> => {
    const dim = splitDimensionTerm(t);
    const q = parseQuery(dim.term);
    if (!q.hasText) return [];
    const rows = await fetchCandidates(q, { limit: 200 });
    let scored = scoreCandidates(q, rows, { prefixLast: true })
      .filter((s) => !dim.intent || s.type === dim.intent)
      .filter((s) => types.includes(s.type) && (q.wantsBundle || s.type !== 'game' || !s.kit))
      .filter((s) => !q.platform || s.platform === q.platform);
    if (partial) {
      // última palavra curta ainda sendo digitada ("resident evil v"): vale como prefixo, não como numeral romano
      const re = new RegExp('(^| )' + partial.replace(/[^a-z0-9]/g, ''));
      scored = scored.filter((s) => re.test(foldText(s.c.name).replace(/[^a-z0-9]+/g, ' ')));
    }
    return scored;
  };
  let scored = await run(term);
  if (scored.length === 0) {
    const m = foldText(term).match(/^(.*\S)\s+([a-z0-9]{1,2})$/);
    if (m) scored = await run(m[1], m[2]);
  }
  const sorted = sortScored(scored, 'relevance').slice(0, limit);
  return sorted.map((s) => {
    const best = s.c.stores[0];
    return {
      masterProductId: s.c.id,
      title: cleanProductTitle(s.c.name, { keepPlatform: s.type !== 'game' }),
      platform: s.platform,
      platformLabel: GAME_PLATFORM_GEN_LABELS[s.platform],
      legacyPlatformLabel: s.legacy,
      productType: s.type,
      isBundle: s.bundle,
      lowestPriceCents: Number(best.priceCents),
      offerCount: s.c.offerCount,
      storeCount: s.c.networkCount,
      imageUrl: best.imageUrl || s.c.defaultImage || null,
      href: '/ofertas/' + best.offerSlug,
    };
  });
}

// ---------------------------------------------------------------------------
// Índice em memória do autocomplete
// ---------------------------------------------------------------------------

/**
 * Todos os produtos com oferta pública numa consulta só (ADR 0002 via
 * `publicOffersCtes`, masters arquivados fora). O autocomplete busca aqui,
 * em memória, com a mesma normalização, siglas, numerais, regra de número de
 * sequência e restrição de plataforma da busca principal.
 *
 * Camadas (Next 16.2 sem Cache Components, ver
 * node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md):
 *  1. memória do processo, TTL `SUGGEST_INDEX_TTL_MS`; passado o TTL, a
 *     próxima chamada responde com o índice velho e recarrega em segundo
 *     plano (stale-while-revalidate): o usuário nunca espera a consulta,
 *     exceto na primeira chamada a frio de um processo.
 *  2. `unstable_cache` (Data Cache do Next, `SUGGEST_INDEX_DATA_CACHE_SECONDS`)
 *     por baixo: instâncias serverless novas reaproveitam a carga já feita por
 *     outra instância em vez de reconsultar o banco.
 *  3. Se a carga falhar e já houver índice, mantém o velho; se não houver
 *     nenhum, cai na consulta SQL antiga (`runSuggestSql`).
 */
export const SUGGEST_INDEX_TTL_MS = 90_000;
const SUGGEST_INDEX_DATA_CACHE_SECONDS = 120;

interface IndexRow {
  id: string;
  name: string;
  slug: string;
  productType: ProductType;
  platform: GamePlatformGen;
  defaultImage: string | null;
  offerCount: number;
  networkCount: number;
  minPrice: number;
  offerSlug: string;
  offerImage: string | null;
}

interface IndexEntry {
  scored: Omit<Scored, 'relevance'>;
  info: ReturnType<typeof analyzeName>;
  /** nome dobrado (sem acento, pontuação em espaço) para o filtro de prefixo parcial */
  folded: string;
  title: string;
}

async function loadIndexRows(): Promise<IndexRow[]> {
  const rows = await db.execute<Row>(sql`
    WITH ${publicOffersCtes()},
    po AS (
      SELECT o.id, o.master_product_id AS mid, o.network_id, o.slug,
             o.current_price_cents::bigint AS price, o.image_url
      FROM affiliate_offers o
      INNER JOIN public_offers p ON p.id = o.id
    ),
    agg AS (
      SELECT mid, COUNT(*)::int AS offer_count, COUNT(DISTINCT network_id)::int AS network_count
      FROM po GROUP BY mid
    ),
    best AS (
      SELECT DISTINCT ON (mid) mid, slug, price, image_url
      FROM po ORDER BY mid, price ASC, id
    )
    SELECT m.id, m.name, m.slug, m.product_type, m.game_platform_gen,
           m.default_images ->> 0 AS default_image,
           a.offer_count, a.network_count, b.slug AS offer_slug, b.price, b.image_url AS offer_image
    FROM master_products m
    INNER JOIN agg a ON a.mid = m.id
    INNER JOIN best b ON b.mid = m.id
    WHERE NOT (m.attributes ? 'mergedInto')
  `);
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    slug: String(r.slug ?? ''),
    productType: r.product_type as ProductType,
    platform: r.game_platform_gen as GamePlatformGen,
    defaultImage: (r.default_image as string | null) ?? null,
    offerCount: Number(r.offer_count),
    networkCount: Number(r.network_count),
    minPrice: Number(r.price),
    offerSlug: String(r.offer_slug),
    offerImage: (r.offer_image as string | null) ?? null,
  }));
}

const loadIndexRowsCached = createCachedQuery(loadIndexRows, ['suggest-index-v1'], {
  revalidate: SUGGEST_INDEX_DATA_CACHE_SECONDS,
  tags: CACHE_TAGS,
});

function buildIndex(rows: IndexRow[]): IndexEntry[] {
  return rows.flatMap((r): IndexEntry[] => {
    const c: Candidate = {
      id: r.id,
      name: r.name,
      slug: r.slug,
      dbType: r.productType,
      dbPlatform: r.platform,
      defaultImage: r.defaultImage,
      offerCount: r.offerCount,
      networkCount: r.networkCount,
      minPrice: r.minPrice,
      stores: [
        {
          networkId: '',
          networkName: '',
          offerId: '',
          offerSlug: r.offerSlug,
          priceCents: r.minPrice,
          previousPriceCents: null,
          changedAt: null,
          imageUrl: r.offerImage,
          outboundUrl: null,
          pending: true,
          offerCount: r.offerCount,
        },
      ],
      pubOfferCount: 0,
      pubMedian: null,
      wsim: 0,
    };
    const type = effectiveType(c);
    if (type === null) return []; // fora da cartela pública: nunca entra no autocomplete
    const rp = readPlatform(c.dbPlatform, c.name);
    return [{
      scored: { c, type, platform: rp.platform, legacy: rp.legacyLabel, ...bundleFlags(r.name) },
      info: analyzeName(r.name),
      folded: foldText(r.name).replace(/[^a-z0-9]+/g, ' '),
      title: cleanProductTitle(r.name, { keepPlatform: type !== 'game' }),
    }];
  });
}

let indexState: { entries: IndexEntry[]; loadedAt: number } | null = null;
let indexLoading: Promise<IndexEntry[]> | null = null;

function refreshIndex(useDataCache: boolean): Promise<IndexEntry[]> {
  if (indexLoading) return indexLoading;
  const p = (useDataCache ? loadIndexRowsCached() : loadIndexRows())
    .then((rows) => {
      const entries = buildIndex(rows);
      indexState = { entries, loadedAt: Date.now() };
      return entries;
    })
    .finally(() => {
      indexLoading = null;
    });
  indexLoading = p;
  return p;
}

/**
 * Índice atual. Fresco: devolve. Velho: devolve o velho e recarrega em
 * segundo plano. Ausente (1ª chamada a frio do processo): espera a carga.
 */
async function getSuggestIndex(): Promise<IndexEntry[] | null> {
  const now = Date.now();
  if (indexState) {
    if (now - indexState.loadedAt > SUGGEST_INDEX_TTL_MS && !indexLoading) {
      refreshIndex(true).catch(() => undefined); // segundo plano; falha mantém o velho
    }
    return indexState.entries;
  }
  try {
    return await refreshIndex(true);
  } catch {
    return null;
  }
}

/** Pré-carrega o índice (ex.: no start do servidor). Devolve quantos produtos entraram. */
export async function warmSuggestIndex(): Promise<number> {
  const idx = await getSuggestIndex();
  return idx?.length ?? 0;
}

/** Só para medição: esquece o índice em memória (o Data Cache do Next não é limpo). */
export function resetSuggestIndexForMeasurement(): void {
  indexState = null;
  indexLoading = null;
}

/** Só para medição: carga direta no banco, sem Data Cache, e troca o índice em memória. */
export async function reloadSuggestIndexFromDatabaseForMeasurement(): Promise<number> {
  indexLoading = null;
  return (await refreshIndex(false)).length;
}

function suggestFromIndex(index: IndexEntry[], term: string, limit: number, types: ProductType[]): ProductSuggestion[] {
  const run = (t: string, partial?: string): Scored[] => {
    const dim = splitDimensionTerm(t);
    const q = parseQuery(dim.term);
    if (!q.hasText) {
      // só plataforma ("ps5", "switch 2 jogos") ou só dimensão ("console"): os mais cotados
      if (!q.platform && !dim.intent) return [];
      const top: Scored[] = [];
      for (const e of index) {
        const s = e.scored;
        if (!types.includes(s.type) || (q.platform && s.platform !== q.platform)) continue;
        if (dim.intent && s.type !== dim.intent) continue;
        if (s.type === 'game' && s.kit) continue;
        top.push({ ...s, relevance: 1 });
      }
      return top;
    }
    const re = partial ? new RegExp('(^| )' + partial.replace(/[^a-z0-9]/g, '')) : null;
    const out: Scored[] = [];
    for (const e of index) {
      const s = e.scored;
      if (!types.includes(s.type)) continue;
      if (dim.intent && s.type !== dim.intent) continue;
      if (!q.wantsBundle && s.type === 'game' && s.kit) continue;
      if (q.platform && s.platform !== q.platform) continue;
      if (re && !re.test(e.folded)) continue;
      const sc = scoreName(q, e.info, { prefixLast: true });
      if (!sc || sc.relevance < SEARCH_MIN_RELEVANCE) continue;
      out.push({ ...s, relevance: sc.relevance });
    }
    return out;
  };
  let scored = run(term);
  if (scored.length === 0) {
    const m = foldText(term).match(/^(.*\S)\s+([a-z0-9]{1,2})$/);
    if (m) scored = run(m[1], m[2]);
  }
  const byId = new Map(index.map((e) => [e.scored.c.id, e]));
  return sortScored(scored, 'relevance')
    .slice(0, limit)
    .map((s) => {
      const best = s.c.stores[0];
      return {
        masterProductId: s.c.id,
        title: byId.get(s.c.id)?.title ?? cleanProductTitle(s.c.name, { keepPlatform: s.type !== 'game' }),
        platform: s.platform,
        platformLabel: GAME_PLATFORM_GEN_LABELS[s.platform],
        legacyPlatformLabel: s.legacy,
        productType: s.type,
        isBundle: s.bundle,
        lowestPriceCents: Number(best.priceCents),
        offerCount: s.c.offerCount,
        storeCount: s.c.networkCount,
        imageUrl: best.imageUrl || s.c.defaultImage || null,
        href: '/ofertas/' + best.offerSlug,
      };
    });
}

async function runSuggest(term: string, limit: number, types: ProductType[]): Promise<ProductSuggestion[]> {
  const index = await getSuggestIndex();
  if (!index) return runSuggestSql(term, limit, types); // índice indisponível: consulta direta
  return suggestFromIndex(index, term, limit, types);
}

/**
 * Autocomplete: só produtos com oferta pública, ordenados por relevância
 * (último token pode ser prefixo). Padrão: só jogos; se não houver nenhum jogo,
 * repete a busca em console e acessório (campo `productType` indica a aba).
 * Busca no índice em memória (ver `getSuggestIndex`): sem ida ao banco no
 * caminho quente.
 */
export async function suggestProducts(
  term: string,
  limit = 8,
  opts: { types?: SearchProductKind[] } = {}
): Promise<ProductSuggestion[]> {
  const t = String(term ?? '').slice(0, 80).trim();
  const lim = clampInt(limit, 1, 20, 8);
  if (t.length < 2) return [];
  if (opts.types?.length) return runSuggest(t, lim, [...new Set(opts.types)]);
  const games = await runSuggest(t, lim, ['game']);
  if (games.length) return games;
  return runSuggest(t, lim, ['console', 'accessory']);
}

/** Igual a `suggestProducts` (o índice em memória não passa por cache de resposta); mantido para os scripts. */
export async function suggestProductsUncached(term: string, limit = 8): Promise<ProductSuggestion[]> {
  return suggestProducts(term, limit);
}

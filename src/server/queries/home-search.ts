import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import type { GamePlatformGen } from '@/db/schema';
import { publicOffersCtes } from '@/server/queries/public-offers';
import { isBundleTitle } from '@/lib/affiliate/product-type-classifier';
import { derivePlatformFromTitle } from '@/lib/affiliate/game-classification';
import { effectiveCatalogType } from '@/lib/catalog/dimensions';
import type { ProductType } from '@/db/schema';
import { cleanProductTitle, foldText } from '@/lib/search/query-normalize';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';

/**
 * Dados REAIS para o hero de busca da home. Tudo sai de ofertas públicas
 * (ADR 0002) de masters não arquivados; nada é fixo nem inventado.
 *  - platforms: plataformas de jogo com ao menos 1 produto, com contagem.
 *  - popular: jogos mais cotados (mais ofertas públicas), título limpo, um por título.
 *  - totals: produtos e lojas com preço atual.
 */
export interface HomeSearchData {
  platforms: Array<{ platform: GamePlatformGen; label: string; count: number }>;
  popular: Array<{ term: string; platformLabel: string }>;
  totals: { products: number; stores: number };
}

const PLATFORM_ORDER: GamePlatformGen[] = ['ps5', 'switch_2', 'xbox_series', 'ps4', 'switch_1', 'xbox_one', 'xbox_360'];

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  product_type: string;
  game_platform_gen: GamePlatformGen;
  offers: number;
}

async function compute(): Promise<HomeSearchData> {
  const rows = await db.execute<Row>(sql`
    WITH ${publicOffersCtes()}
    SELECT m.id, m.name, m.product_type, m.game_platform_gen, COUNT(*)::int AS offers
    FROM public_offers p
    INNER JOIN master_products m ON m.id = p.master_product_id
    WHERE NOT (m.attributes ? 'mergedInto')
    GROUP BY m.id
  `);
  const stores = await db.execute<{ n: number } & Record<string, unknown>>(sql`
    WITH ${publicOffersCtes()}
    SELECT COUNT(DISTINCT o.network_id)::int AS n
    FROM public_offers p INNER JOIN affiliate_offers o ON o.id = p.id
  `);

  // Cartela pública (src/lib/catalog/dimensions.ts): o que está fora dela
  // (merchandise, peças, outras verticais) não conta em total, chip nem atalho,
  // e o tipo EFETIVO (título corrige o campo do banco) decide o que é jogo.
  const visible = rows
    .map((r) => ({
      ...r,
      type: effectiveCatalogType(String(r.name ?? ''), r.product_type as ProductType),
      // plataforma 'unknown' nunca é padrão: deriva do título antes de desistir
      platform: r.game_platform_gen !== 'unknown' ? r.game_platform_gen : derivePlatformFromTitle(String(r.name ?? '')),
    }))
    .filter((r) => r.type !== null);

  const counts = new Map<GamePlatformGen, number>();
  for (const r of visible) {
    if (r.type !== 'game' || r.platform === 'unknown') continue;
    counts.set(r.platform, (counts.get(r.platform) ?? 0) + 1);
  }
  const platforms = PLATFORM_ORDER.filter((p) => (counts.get(p) ?? 0) > 0).map((p) => ({
    platform: p,
    label: GAME_PLATFORM_GEN_LABELS[p],
    count: counts.get(p) ?? 0,
  }));

  const games = visible
    .filter((r) => r.type === 'game' && !isBundleTitle(r.name))
    .sort((a, b) => Number(b.offers) - Number(a.offers) || String(a.name).localeCompare(String(b.name)));
  const seen = new Set<string>();
  const popular: HomeSearchData['popular'] = [];
  for (const g of games) {
    const term = cleanProductTitle(g.name);
    const key = foldText(term);
    if (!key || seen.has(key)) continue;
    // título de catálogo truncado/repetido ("X: Y - Volume 02: X: Y - V") não serve de atalho de busca
    const head = key.slice(0, 12);
    if (term.length > 42 || key.indexOf(head, 1) > 0) continue;
    // livro/mangá/HQ que escapou da classificação de tipo não é atalho de busca de jogo
    if (/\b(manga|mangas|vol|volume|livro|hq|revista|panini)\b/.test(key)) continue;
    seen.add(key);
    popular.push({
      term,
      platformLabel: g.platform === 'unknown' ? '' : GAME_PLATFORM_GEN_LABELS[g.platform],
    });
    if (popular.length >= 6) break;
  }

  return {
    platforms,
    popular,
    totals: { products: visible.length, stores: Number(stores[0]?.n ?? 0) },
  };
}

const cached = createCachedQuery(async (): Promise<HomeSearchData> => compute(), ['home-search-v5'], { revalidate: 600 });

/**
 * FONTE ÚNICA dos totais públicos do site (home, ofertas, tabela de preços, sobre).
 * Definição:
 *  - products = produtos (master_product, sem os mesclados) com ao menos 1 oferta pública ativa (ADR 0002).
 *  - stores   = marketplaces (affiliate_networks) com ao menos 1 oferta pública ativa.
 * Não é filtrado por tela/aba/busca; contagem filtrada (ex.: itens da aba atual) deve ter rótulo próprio.
 */
export async function getPublicTotals(): Promise<HomeSearchData['totals']> {
  return (await getHomeSearchData()).totals;
}

/** Chips de plataforma, termos mais cotados e totais do hero (cache de 10 min). Nunca lança: sem banco, devolve vazio. */
export async function getHomeSearchData(): Promise<HomeSearchData> {
  try {
    return await cached();
  } catch (err) {
    console.error('[home-search] falha', err);
    return { platforms: [], popular: [], totals: { products: 0, stores: 0 } };
  }
}

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery, createPersistedQuery } from '@/lib/cache/server-cache';
import { publicOffersCtes } from '@/server/queries/public-offers';
import { catalogDimensionFilter } from '@/server/queries/catalog-dimensions';
import { getPriceTableProductCount, getPriceTableBadgeCounters } from '@/server/queries/price-table';
import { GAMES, verticalSql } from '@/lib/catalog/verticais';

/**
 * FONTE ÚNICA dos contadores públicos (home, /ofertas, /sobre, /contatos e
 * cabeçalho da tabela de preços). Nenhuma tela soma, conta ou cacheia por conta
 * própria. Recorte filtrado (aba, busca) tem rótulo próprio na própria tela.
 *
 * Definições (docs/modelo-indicadores.md, seção 9):
 *  - products: master_product (sem mesclados, dentro da cartela pública) com
 *    >= 1 oferta pública (ADR 0002). É exatamente o total da tabela sem filtro.
 *  - stores: marketplaces com >= 1 oferta pública de produto da cartela.
 *  - sellers: vendedores distintos com >= 1 oferta pública de produto da cartela
 *    (não os "já vistos": inclui só quem tem oferta viva).
 *  - quotes: snapshots reais com price_cents > 0 (cotações brutas; ver ADR 0004,
 *    proposta, sobre contar por oferta/dia).
 *  - lowestEverCount: produtos com o selo "menor registrado" (mesma linha-a-linha
 *    da tabela: `low_badge_ok` em price-table.ts).
 *  - belowAverageCount: produtos com veredito "abaixo do normal" (mesmo filtro
 *    "abaixo da média" da tabela).
 *  - computedAt: ISO do cálculo, para a tela dizer "atualizado em".
 */
export interface PublicMetrics {
  products: number;
  stores: number;
  sellers: number;
  quotes: number;
  /** null = ainda não calculado (varredura de ~70 s em segundo plano); a tela omite o número. */
  lowestEverCount: number | null;
  belowAverageCount: number | null;
  computedAt: string;
}

/**
 * Total de cotações (snapshots com price_cents > 0). A contagem exata varre ~3 M de
 * linhas (3-4 s no banco); o número só muda a cada coleta e é exibido arredondado
 * em "mil", então vive em cache próprio: fresco 15 min, recalculado por trás
 * (SWR), igual em TODAS as telas porque só existe esta função.
 */
export const getQuoteCount = createPersistedQuery(
  async (): Promise<number> => {
    const rows = await db.execute<{ quotes: string }>(sql`
      SELECT COUNT(*)::bigint AS quotes FROM affiliate_price_snapshots s
      WHERE s.price_cents > 0 AND s.offer_id IN (SELECT xo.id FROM affiliate_offers xo WHERE ${verticalSql('xo', GAMES)})
    `);
    return Number(rows[0]?.quotes ?? 0);
  },
  ['public-quote-count-v1'],
  { revalidate: 900, maxStaleSeconds: 24 * 3600, coldTimeoutSeconds: 40, persist: { maxAgeSeconds: 3600 } }
);

/** Rótulos ÚNICOS dos contadores (todas as telas usam estes; ver docs/modelo-indicadores.md, seção 9). */
export const PUBLIC_METRIC_LABELS = {
  products: 'Produtos com oferta ativa',
  quotes: 'Cotações de preço registradas',
} as const;

async function compute(): Promise<PublicMetrics> {
  const inCatalog = await catalogDimensionFilter({ idCol: sql`mp.id`, typeCol: sql`mp.product_type` });
  const [productCount, badges, offerRows, quotes] = await Promise.all([
    getPriceTableProductCount(),
    // Contadores de selo ainda não calculados (sem snapshot e varredura ao vivo lenta): null, a tela omite o número.
    getPriceTableBadgeCounters().catch(() => null),
    db.execute<{ stores: number; sellers: number }>(sql`
      WITH ${publicOffersCtes(GAMES)}
      SELECT COUNT(DISTINCT o.network_id)::int AS stores,
             COUNT(DISTINCT o.seller_id)::int AS sellers
      FROM public_offers po
      INNER JOIN affiliate_offers o ON o.id = po.id
      INNER JOIN master_products mp ON mp.id = o.master_product_id
      WHERE NOT (mp.attributes ? 'mergedInto') AND ${inCatalog}
    `),
    getQuoteCount(),
  ]);
  return {
    products: productCount,
    stores: Number(offerRows[0]?.stores ?? 0),
    sellers: Number(offerRows[0]?.sellers ?? 0),
    quotes,
    lowestEverCount: badges?.lowestEver ?? null,
    belowAverageCount: badges?.belowAverage ?? null,
    computedAt: new Date().toISOString(),
  };
}

export const publicMetricsCached = createPersistedQuery(compute, ['public-metrics-v2'], {
  persist: { maxAgeSeconds: 1800 },
  revalidate: 300,
  maxStaleSeconds: 24 * 3600,
  coldTimeoutSeconds: 60,
  tags: ['price-table', 'affiliate-offers', 'price-snapshots'],
});

const EMPTY: PublicMetrics = {
  products: 0,
  stores: 0,
  sellers: 0,
  quotes: 0,
  lowestEverCount: null,
  belowAverageCount: null,
  computedAt: new Date(0).toISOString(),
};

/** Contadores públicos do site (cache de 5 min, uma chave só). Nunca lança: sem banco, devolve zeros. */
export async function getPublicMetrics(): Promise<PublicMetrics> {
  try {
    return await publicMetricsCached();
  } catch (err) {
    console.error('[public-metrics] falha', err);
    return EMPTY;
  }
}

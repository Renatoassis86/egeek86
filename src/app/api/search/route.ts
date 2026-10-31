import { NextResponse } from 'next/server';
import { suggestProducts, type ProductSuggestion } from '@/server/queries/search-products';
import { searchPublishedArticles } from '@/server/queries/news';

export const dynamic = 'force-dynamic';

export interface GlobalSearchResult {
  id: string;
  title: string;
  type: 'jogo' | 'noticia';
  category?: string;
  priceCents?: number;
  url: string;
}

export interface SearchApiResponse {
  /** Autocomplete de produtos (motor `suggestProducts`), já ordenado por relevância. */
  products: ProductSuggestion[];
  /** Formato achatado usado pelo modal do header (produtos + notícias). */
  items: GlobalSearchResult[];
}

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

/**
 * Busca do header e do hero. Produtos vêm do motor novo (`suggestProducts`,
 * cache próprio de 60 s); nada de fuzzy próprio aqui. `?scope=products`
 * dispensa as notícias (hero). Resposta cacheável no CDN por 60 s.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().slice(0, 80);
  const productsOnly = searchParams.get('scope') === 'products';
  const limit = Math.min(10, Math.max(1, Number(searchParams.get('limit')) || 6));

  if (q.length < 2) {
    return NextResponse.json({ products: [], items: [] } satisfies SearchApiResponse, { headers: CACHE_HEADERS });
  }

  const [products, articles] = await Promise.all([
    suggestProducts(q, limit).catch(() => [] as ProductSuggestion[]),
    productsOnly ? Promise.resolve([]) : searchPublishedArticles(q, 4).catch(() => []),
  ]);

  const items: GlobalSearchResult[] = [
    ...products.map((p) => ({
      id: p.masterProductId,
      title: p.title,
      type: 'jogo' as const,
      category: p.platformLabel,
      priceCents: p.lowestPriceCents,
      url: p.href,
    })),
    ...articles.map((a) => ({
      id: a.id,
      title: a.title,
      type: 'noticia' as const,
      category: 'Notícias',
      url: `/noticias/${a.slug}`,
    })),
  ];

  return NextResponse.json({ products, items } satisfies SearchApiResponse, { headers: CACHE_HEADERS });
}

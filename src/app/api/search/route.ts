import { NextResponse } from 'next/server';
import { listRankedOffers } from '@/server/queries/affiliate';
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

/**
 * Busca global do header (Ctrl+K) — antes rodava 100% sobre um array
 * hardcoded de 8 itens de exemplo (DEMO_SEARCH_DATABASE), então qualquer
 * busca real (fora desses 8 títulos) sempre voltava "nenhum resultado",
 * mesmo pra item que já estava catalogado de verdade no banco. Hype Zone e
 * Leilões ficam de fora por ora — outro processo está construindo esses
 * módulos em paralelo nesta mesma base de código.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return NextResponse.json({ items: [] satisfies GlobalSearchResult[] });
  }

  const [offers, articles] = await Promise.all([
    listRankedOffers({ search: q, limit: 6 }),
    searchPublishedArticles(q, 4),
  ]);

  const items: GlobalSearchResult[] = [
    ...offers.map((o) => ({
      id: o.id,
      title: o.title,
      type: 'jogo' as const,
      category: o.masterProduct.name,
      priceCents: o.currentPriceCents,
      url: `/ofertas/${o.slug}`,
    })),
    ...articles.map((a) => ({
      id: a.id,
      title: a.title,
      type: 'noticia' as const,
      category: 'Notícias',
      url: `/noticias/${a.slug}`,
    })),
  ];

  return NextResponse.json({ items });
}

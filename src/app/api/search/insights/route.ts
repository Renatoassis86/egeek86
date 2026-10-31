import { NextResponse } from 'next/server';
import { getSearchInsights, type SearchInsights } from '@/server/queries/search-products';

export const dynamic = 'force-dynamic';

export interface InsightsApiResponse {
  insights: Record<string, SearchInsights>;
}

/**
 * Selos de decisão (média única, veredito, menor preço registrado, queda) de
 * até 60 produtos, carregados DEPOIS da grade porque a estatística é lenta em
 * produto muito cotado. `getSearchInsights` já tem cache de 10 min no servidor;
 * o CDN guarda a resposta por 5 min (as ids na URL fazem parte da chave).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 60);
  if (ids.length === 0) return NextResponse.json({ insights: {} } satisfies InsightsApiResponse);

  try {
    const insights = await getSearchInsights(ids);
    return NextResponse.json({ insights } satisfies InsightsApiResponse, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[search/insights] falha', err);
    return NextResponse.json({ insights: {} } satisfies InsightsApiResponse, { status: 503 });
  }
}

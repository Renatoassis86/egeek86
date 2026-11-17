import { NextResponse } from 'next/server';
import { buscarProdutosRanking, rankingDoProduto } from '@/server/queries/ranking-busca';

export const dynamic = 'force-dynamic';
const CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

/** Busca da home (ranking do menor ao maior preço). ?q=termo -> produtos; ?produto=<id> -> ofertas do produto em ordem de preço. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  try {
    const produto = (sp.get('produto') ?? '').trim();
    if (produto) return NextResponse.json({ ranking: await rankingDoProduto(produto) }, { headers: CACHE });
    const q = (sp.get('q') ?? '').trim().slice(0, 80);
    return NextResponse.json({ produtos: await buscarProdutosRanking(q) }, { headers: CACHE });
  } catch (e) {
    console.error('[api/ranking-busca]', e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json({ produtos: [], ranking: null, erro: true }, { status: 200 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { searchMasterProductsToWatch } from '@/server/queries/price-watches';

export const dynamic = 'force-dynamic';

/**
 * Busca de jogo pro "+" do painel de Monitoramento (adicionar à watchlist) —
 * exige login porque o resultado já vem marcado com alreadyWatched (depende
 * do usuário), igual o resto do módulo de Monitoramento.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') ?? '';
  const items = await searchMasterProductsToWatch(q, profile.id);
  return NextResponse.json({ items });
}

import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { getMasterProductChangePercent } from '@/server/queries/price-history';

export const dynamic = 'force-dynamic';

export interface WatchlistApiItem {
  masterProductId: string;
  slug: string;
  title: string;
  networkName: string;
  currentPriceCents: number;
  changePercent: number | null;
}

/**
 * Resumo da watchlist do usuário logado (menor preço entre vendedores +
 * variação 24h), usado pelo polling do painel lateral do monitoramento.
 * Reaproveita getUserWatches (mesma fonte do dashboard em /conta), que já
 * resolve cada produto acompanhado pra sua oferta ativa mais barata.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  }

  const watches = await getUserWatches(profile.id);
  if (watches.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const changeMap = await getMasterProductChangePercent(watches.map((w) => w.masterProductId));

  const items: WatchlistApiItem[] = watches.map((w) => ({
    masterProductId: w.masterProductId,
    slug: w.offerSlug,
    title: w.title,
    networkName: w.networkName,
    currentPriceCents: w.currentPriceCents,
    changePercent: changeMap.get(w.masterProductId)?.changePercent ?? null,
  }));

  return NextResponse.json({ items });
}

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { getMasterProductPriceHistory, getMasterProductChangePercent } from '@/server/queries/price-history';
import { getOffers } from '@/server/queries/affiliate';
import { MonitoringBoard } from '@/components/monitoring/monitoring-board';

export const metadata = { title: 'Monitoramento de Preços | Espaço Geek 86' };
export const dynamic = 'force-dynamic';

export default async function MonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const profile = await getCurrentProfile();

  let userWatches = profile ? await getUserWatches(profile.id) : [];

  // Se o usuário é visitante ou ainda não tem itens favoritados, carrega as principais ofertas ativas para o painel de cotações
  if (userWatches.length === 0) {
    const popularOffers = await getOffers({ limit: 8 });
    userWatches = popularOffers.map((item) => ({
      watchId: item.id,
      masterProductId: item.masterProduct.id,
      offerId: item.id,
      offerSlug: item.slug,
      title: item.title,
      imageUrl: item.imageUrl,
      networkName: item.network.name,
      gameFormat: item.masterProduct.gameFormat,
      gamePlatformGen: item.masterProduct.gamePlatformGen,
      currentPriceCents: item.currentPriceCents,
      metrics: null,
    }));
  }

  const selected = userWatches.find((w) => w.masterProductId === jogo) ?? userWatches[0];
  const [initialHistory, changeMap] = await Promise.all([
    getMasterProductPriceHistory(selected.masterProductId, '1M'),
    getMasterProductChangePercent(userWatches.map((w) => w.masterProductId)),
  ]);

  const watchlistItems = userWatches.map((w) => ({
    masterProductId: w.masterProductId,
    slug: w.offerSlug,
    title: w.title,
    imageUrl: w.imageUrl,
    networkName: w.networkName,
    currentPriceCents: w.currentPriceCents,
    changePercent: changeMap.get(w.masterProductId)?.changePercent ?? null,
  }));

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <Text as="h1" variant="heading-xl">
          Monitoramento de preço
        </Text>
        <Text variant="body-md" color="secondary" className="mt-1">
          Acompanhe o menor preço entre todos os vendedores dos jogos que você monitora, do dia a dia até o
          histórico completo.
        </Text>
      </div>

      <MonitoringBoard
        watchlistItems={watchlistItems}
        initialSelectedId={selected.masterProductId}
        initialHistory={initialHistory}
      />
    </section>
  );
}

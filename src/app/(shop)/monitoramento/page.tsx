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
      {/* Banner Informativo para Visitantes (Modo Demonstração) */}
      {!profile && (
        <div className="relative border border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-inset)]/60 rounded-[var(--radius-xl)] p-6 md:p-8 overflow-hidden mb-8 z-10 backdrop-blur-md">
          <div className="absolute right-0 top-0 bottom-0 w-full md:w-[40%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
            <div 
              className="relative w-full h-full"
              style={{ clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)' }}
            >
              <Image
                src="/images/monitoramento/demo-banner.png"
                alt="Demonstração do Monitoramento"
                fill
                className="object-cover object-center"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-transparent to-transparent opacity-90 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-3 relative z-10 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--color-accent-gold)]/20 text-[var(--color-accent-gold)] border border-[var(--color-accent-gold)]/30 animate-pulse">
                ⚡ Modo Demonstração (1 Item Liberado)
              </span>
            </div>
            <Text as="h1" variant="heading-lg" className="text-2xl md:text-3xl font-black">
              Monitoramento de Preço em Tempo Real
            </Text>
            <Text variant="body-sm" color="secondary" className="text-xs md:text-sm leading-relaxed">
              Você está visualizando o painel em modo de demonstração. Como visitante, você pode explorar o gráfico e acompanhar <strong>1 item por vez</strong>. Faça seu cadastro gratuito para liberar o monitoramento ilimitado e receber alertas por e-mail e Telegram!
            </Text>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="sm" variant="primary" className="font-bold">
                <Link href="/entrar?next=/monitoramento">Criar Conta Grátis / Entrar</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/sobre">Como funcionam os Alertas</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {profile && (
        <div className="mb-8">
          <Text as="h1" variant="heading-xl">
            Monitoramento de preço
          </Text>
          <Text variant="body-md" color="secondary" className="mt-1">
            Acompanhe o menor preço entre todos os vendedores dos jogos que você monitora, do dia a dia até o
            histórico completo.
          </Text>
        </div>
      )}

      <MonitoringBoard
        watchlistItems={watchlistItems}
        initialSelectedId={selected.masterProductId}
        initialHistory={initialHistory}
        isGuest={!profile}
      />
    </section>
  );
}

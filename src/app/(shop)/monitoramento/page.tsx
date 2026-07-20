import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { getMasterProductPriceHistory, getMasterProductChangePercent } from '@/server/queries/price-history';
import { getPublicOffers } from '@/server/queries/affiliate';
import { MonitoringBoard } from '@/components/monitoring/monitoring-board';

export const metadata = { title: 'Monitoramento de Preços | Espaço Geek 86' };
export const dynamic = 'force-dynamic';

const DEMO_FALLBACK_WATCHLIST = [
  {
    masterProductId: 'demo-1',
    slug: 'red-dead-redemption-nintendo-switch-756960592',
    title: 'Red Dead Redemption - Nintendo Switch',
    imageUrl: '/images/home/tile-1.png',
    networkName: 'Mercado Livre',
    currentPriceCents: 29900,
    changePercent: -12,
  },
  {
    masterProductId: 'demo-2',
    slug: 'super-mario-bros-wonder',
    title: 'Super Mario Bros Wonder - Nintendo Switch 2',
    imageUrl: '/images/home/tile-2.png',
    networkName: 'Shopee',
    currentPriceCents: 49692,
    changePercent: 5,
  },
  {
    masterProductId: 'demo-3',
    slug: 'mario-kart-8-deluxe',
    title: 'Mario Kart 8 Deluxe - Nintendo Switch',
    imageUrl: '/images/home/tile-3.png',
    networkName: 'Amazon',
    currentPriceCents: 27900,
    changePercent: -8,
  },
];

const DEMO_FALLBACK_HISTORY = {
  points: [
    { time: Math.floor(Date.now() / 1000) - 86400 * 30, value: 320 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 20, value: 310 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 10, value: 299 },
    { time: Math.floor(Date.now() / 1000), value: 299 },
  ],
  movingAveragePoints: [
    { time: Math.floor(Date.now() / 1000) - 86400 * 30, value: 325 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 20, value: 315 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 10, value: 305 },
    { time: Math.floor(Date.now() / 1000), value: 300 },
  ],
  pointOffers: {},
  quotes: [],
  totalOffersCount: 3,
  totalQuoteCount: 24,
  stats: {
    minPriceCents: 29900,
    maxPriceCents: 32000,
    avgPriceCents: 30800,
    globalMaxPriceCents: 35000,
  },
};

export default async function MonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  let profile = null;

  try {
    profile = await getCurrentProfile();
  } catch (e) {
    console.error('Erro ao buscar perfil:', e);
  }

  let watchlistItems: Array<{
    masterProductId: string;
    slug: string;
    title: string;
    imageUrl: string | null;
    networkName: string;
    currentPriceCents: number;
    changePercent: number | null;
  }> = [];

  let selectedProductId = jogo ?? 'demo-1';
  let initialHistory: any = DEMO_FALLBACK_HISTORY;

  try {
    let userWatches = profile ? await getUserWatches(profile.id) : [];

    if (userWatches.length === 0) {
      const popularOffers = await getPublicOffers(8);
      if (popularOffers && popularOffers.length > 0) {
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
    }

    if (userWatches.length > 0) {
      const selected = userWatches.find((w) => w.masterProductId === jogo) ?? userWatches[0];
      selectedProductId = selected.masterProductId;

      const [historyData, changeMap] = await Promise.all([
        getMasterProductPriceHistory(selected.masterProductId, '1M').catch(() => DEMO_FALLBACK_HISTORY),
        getMasterProductChangePercent(userWatches.map((w) => w.masterProductId)).catch(() => new Map()),
      ]);

      if (historyData) {
        initialHistory = historyData;
      }

      watchlistItems = userWatches.map((w) => ({
        masterProductId: w.masterProductId,
        slug: w.offerSlug,
        title: w.title,
        imageUrl: w.imageUrl,
        networkName: w.networkName,
        currentPriceCents: w.currentPriceCents,
        changePercent: changeMap.get(w.masterProductId)?.changePercent ?? null,
      }));
    }
  } catch (e) {
    console.error('Erro ao montar dados de monitoramento:', e);
  }

  // Fallback garantido se a lista ainda estiver vazia
  if (watchlistItems.length === 0) {
    watchlistItems = DEMO_FALLBACK_WATCHLIST;
    selectedProductId = 'demo-1';
  }

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
                Modo Demonstração (1 Item Liberado)
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
        initialSelectedId={selectedProductId}
        initialHistory={initialHistory}
        isGuest={!profile}
      />
    </section>
  );
}

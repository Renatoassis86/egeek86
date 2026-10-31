import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { getMasterProductPriceHistory, getMasterProductChangePercent, type PriceHistoryResult } from '@/server/queries/price-history';
import { getPublicOffers } from '@/server/queries/affiliate';
import { MonitoringBoard } from '@/components/monitoring/monitoring-board';

export const metadata = { title: 'Bolsa Gamer' };
export const dynamic = 'force-dynamic';

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
    sellerNickname: string | null;
    sellerReputationLevel: string | null;
    sellerPositiveRatingPercent: string | null;
    sellerPowerSellerStatus: string | null;
  }> = [];

  let selectedProductId = jogo ?? '';
  let initialHistory: PriceHistoryResult | null = null;

  try {
    let userWatches = profile ? await getUserWatches(profile.id) : [];

    if (userWatches.length > 0) {
      const selected = userWatches.find((w) => w.masterProductId === jogo) ?? userWatches[0];
      selectedProductId = selected.masterProductId;

      const [historyData, changeMap] = await Promise.all([
        getMasterProductPriceHistory(selected.masterProductId, '1M').catch(() => null),
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
        // null quer dizer que ainda não temos base pra comparar (produto
        // novo). 0 quer dizer que o preço genuinamente não mudou. Nenhum dos
        // dois vira número inventado, a UI já mostra "N/D" quando é null.
        changePercent: changeMap.get(w.masterProductId)?.changePercent ?? null,
        sellerNickname: w.sellerNickname,
        sellerReputationLevel: w.sellerReputationLevel,
        sellerPositiveRatingPercent: w.sellerPositiveRatingPercent,
        sellerPowerSellerStatus: w.sellerPowerSellerStatus,
      }));
    } else if (jogo) {
      // Se veio um jogo específico via URL (ex: ?jogo=UUID)
      selectedProductId = jogo;
      const historyData = await getMasterProductPriceHistory(jogo, '1M').catch(() => null);
      if (historyData) {
        initialHistory = historyData;
      }
    } else {
      initialHistory = null;
      selectedProductId = '';
    }
  } catch (e) {
    console.error('Erro ao montar dados de monitoramento:', e);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-14">
      {/* Banner Informativo para Visitantes */}
      {!profile && (
        <div className="relative border border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-inset)]/60 rounded-[var(--radius-xl)] p-6 md:p-8 overflow-hidden mb-8 z-10 backdrop-blur-md">
          <div className="absolute right-0 top-0 bottom-0 w-full md:w-[40%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
            <div 
              className="relative w-full h-full"
              style={{ clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)' }}
            >
              <Image
                src="/images/monitoramento/demo-banner.png"
                alt="Bolsa Gamer: monitoramento de preços"
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
                Visitante: 1 item por vez
              </span>
            </div>
            <Text as="h1" variant="heading-lg" className="text-2xl md:text-3xl font-black">
              Bolsa Gamer: monitoramento de preços
            </Text>
            <Text variant="body-sm" color="secondary" className="text-xs md:text-sm leading-relaxed">
              Como visitante, você pode explorar os gráficos da Bolsa Gamer e acompanhar <strong>1 item por vez</strong>. Faça seu cadastro gratuito para acompanhar quantos jogos quiser e receber o resumo diário de quedas de preço por e-mail e Telegram.
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
            Bolsa Gamer
          </Text>
          <Text variant="body-md" color="secondary" className="mt-1">
            Acompanhe o menor preço e a flutuação diária dos jogos que você monitora, como em uma verdadeira Bolsa de Valores.
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

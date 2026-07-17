import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { getMasterProductPriceHistory, getMasterProductChangePercent } from '@/server/queries/price-history';
import { PriceHistoryChart } from '@/components/monitoring/price-history-chart';
import { WatchlistPanel } from '@/components/monitoring/watchlist-panel';
import { AnimatedPrice } from '@/components/monitoring/animated-price';

export const metadata = { title: 'Monitoramento' };

/**
 * Dashboard estilo tela de bolsa pros jogos que o usuário acompanha. O preço
 * rastreado é sempre o MENOR entre todos os vendedores/plataformas ativos do
 * produto (Mercado Livre, Shopee, Amazon etc quando existirem), nunca de um
 * vendedor específico — clicar no preço abre a comparação entre vendedores.
 * Gate suave (getCurrentProfile, não requireCustomer) — mesmo padrão de
 * /conta: deslogado ou sem watchlist vê um CTA, nunca um redirect forçado.
 */
export default async function MonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <section className="mx-auto max-w-3xl px-4 lg:px-8 py-16 text-center">
        <Text as="h1" variant="heading-xl">
          Monitoramento de preço
        </Text>
        <Text variant="body-md" color="secondary" className="mt-3">
          Entre na sua conta pra montar seu painel de acompanhamento, como uma tela de bolsa, só que pros seus jogos.
        </Text>
        <Button asChild className="mt-6">
          <Link href="/entrar?next=/monitoramento">Entrar</Link>
        </Button>
      </section>
    );
  }

  const watches = await getUserWatches(profile.id);

  if (watches.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-4 lg:px-8 py-16 text-center">
        <Text as="h1" variant="heading-xl">
          Monitoramento de preço
        </Text>
        <Text variant="body-md" color="secondary" className="mt-3">
          Você ainda não está acompanhando nenhum jogo. Encontre um na vitrine e clique em &quot;Acompanhar
          preço&quot; pra ele aparecer aqui.
        </Text>
        <Button asChild className="mt-6">
          <Link href="/ofertas">Explorar ofertas</Link>
        </Button>
      </section>
    );
  }

  const selected = watches.find((w) => w.masterProductId === jogo) ?? watches[0];
  const [initialHistory, changeMap] = await Promise.all([
    getMasterProductPriceHistory(selected.masterProductId, '1M'),
    getMasterProductChangePercent(watches.map((w) => w.masterProductId)),
  ]);

  const watchlistItems = watches.map((w) => ({
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

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <WatchlistPanel initialItems={watchlistItems} selectedMasterProductId={selected.masterProductId} />

        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <Text variant="heading-md">{selected.title}</Text>
                <Text variant="caption" color="tertiary">
                  Menor preço agora em {selected.networkName}
                </Text>
              </div>
              <Link
                href={`/monitoramento/comparar/${selected.masterProductId}`}
                className="group inline-flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors hover:text-[var(--color-accent-primary)]"
              >
                <AnimatedPrice cents={selected.currentPriceCents} className="text-mono-lg" />
                <ArrowUpRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </div>
            <PriceHistoryChart
              key={selected.masterProductId}
              masterProductId={selected.masterProductId}
              initialHistory={initialHistory}
              initialTimeframe="1M"
            />
            <Text variant="caption" color="tertiary" className="mt-3">
              <Link href={`/monitoramento/comparar/${selected.masterProductId}`} className="underline">
                Comparar preço entre vendedores
              </Link>
            </Text>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

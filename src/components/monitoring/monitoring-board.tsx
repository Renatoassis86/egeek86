'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, LineChart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { WatchlistPanel } from './watchlist-panel';
import { PriceHistoryChart, type PriceChartCanonical } from './price-history-chart';
import { getSellerTrustInfo, sellerTrustTextColor } from '@/lib/affiliate/labels';
import { AnimatedPrice } from './animated-price';
import type { PriceHistoryResult } from '@/server/queries/price-history';

/** Estado vazio (sem nenhum ponto): o gráfico busca o histórico real logo ao montar. Não é dado sintético. */
const EMPTY_PRICE_HISTORY: PriceHistoryResult = {
  points: [],
  avgPoints: [],
  frequencyPoints: [],
  pointOffers: {},
  stats: { avgPriceCents: null, minPriceCents: null, maxPriceCents: null, globalMaxPriceCents: null },
  quotes: [],
  totalQuoteCount: 0,
  totalOffersCount: 0,
  bucketSeconds: 86400,
};

interface WatchlistPanelItem {
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
}

/**
 * Dono do estado de "qual jogo está selecionado" no dashboard — troca
 * acontece 100% no cliente (WatchlistPanel avisa via onSelect), sem esperar
 * o servidor re-renderizar a página. O gráfico reage sozinho à mudança de
 * masterProductId (useEffect já existente em PriceHistoryChart), então a UI
 * inteira atualiza na hora do clique, não só depois que a navegação volta.
 * A URL (?jogo=) ainda é atualizada, só que com replace (não push) — mantém
 * o link compartilhável sem empilhar histórico a cada clique na lista.
 */
export function MonitoringBoard({
  watchlistItems,
  initialSelectedId,
  initialHistory,
  isGuest = false,
  canonicalById,
}: {
  watchlistItems: WatchlistPanelItem[];
  initialSelectedId: string;
  initialHistory: PriceHistoryResult | null;
  isGuest?: boolean;
  /** Estatística canônica por produto (getMasterProductPriceStats); o selo e as contagens do gráfico leem daqui. */
  canonicalById?: Record<string, PriceChartCanonical>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  // Espelho local da lista, atualizado a cada poll do WatchlistPanel — é a
  // fonte de verdade pro item ativo, pra "preço atual" do cabeçalho nunca
  // ficar congelado no valor do carregamento inicial enquanto o gráfico (que
  // tem seu próprio polling) segue avançando sozinho.
  const [items, setItems] = useState(watchlistItems);
  const [selectedItem, setSelectedItem] = useState<WatchlistPanelItem | null>(() => {
    return watchlistItems.find((item) => item.masterProductId === initialSelectedId) ?? watchlistItems[0] ?? null;
  });

  function handleSelect(masterProductId: string) {
    setSelectedId(masterProductId);
    const found = items.find((item) => item.masterProductId === masterProductId);
    if (found) {
      setSelectedItem(found);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('jogo', masterProductId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleItemsRefreshed(freshItems: WatchlistPanelItem[]) {
    setItems(freshItems);
    // Lista zerada (ex: usuário apagou tudo) tem que limpar o painel do
    // gráfico também — sem isso ficava mostrando o último jogo selecionado
    // como se ainda estivesse sendo acompanhado.
    if (freshItems.length === 0) {
      setSelectedItem(null);
      return;
    }
    const freshActive = freshItems.find((item) => item.masterProductId === selectedId);
    setSelectedItem(freshActive ?? freshItems[0]);
  }

  const active = selectedItem;
  const trust = active
    ? getSellerTrustInfo({
        reputationLevel: active.sellerReputationLevel,
        powerSellerStatus: active.sellerPowerSellerStatus,
        totalSales: null,
      })
    : null;

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr] w-full min-w-0 max-w-full overflow-hidden">
      <WatchlistPanel
        initialItems={watchlistItems}
        selectedMasterProductId={selectedId}
        onSelect={handleSelect}
        onItemsRefreshed={handleItemsRefreshed}
        isGuest={isGuest}
      />

      {active ? (
        <Card className="min-w-0 max-w-full overflow-hidden">
          <CardContent className="p-3.5 sm:p-5">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <Text variant="heading-md" className="line-clamp-2 leading-snug">{active.title}</Text>
                <Text variant="caption" color="tertiary" className="truncate block">
                  Menor preço entre todas as lojas · atualmente em {active.networkName}
                </Text>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Link
                  href={`/monitoramento/comparar/${active.masterProductId}`}
                  className="group inline-flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors hover:text-[var(--color-accent-primary)]"
                >
                  <AnimatedPrice cents={active.currentPriceCents} className="text-mono-lg" />
                  <ArrowUpRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
                {(active.sellerNickname || trust) && (
                  <Text variant="caption" color="tertiary" className="text-right">
                    {active.sellerNickname && <span className="font-medium">{active.sellerNickname}</span>}
                    {trust && (
                      <span>
                        {active.sellerNickname ? ' · ' : ''}
                        <Text as="span" variant="caption" color={sellerTrustTextColor(trust.variant)}>
                          {trust.label}
                        </Text>
                      </span>
                    )}
                    {active.sellerPositiveRatingPercent && <span> · {active.sellerPositiveRatingPercent}% positivas</span>}
                  </Text>
                )}
              </div>
            </div>
            <PriceHistoryChart
              masterProductId={active.masterProductId}
              initialHistory={initialHistory ?? EMPTY_PRICE_HISTORY}
              initialTimeframe="1M"
              currentPriceCents={active.currentPriceCents}
              canonical={canonicalById?.[active.masterProductId]}
            />
            <Text variant="caption" color="tertiary" className="mt-3">
              <Link href={`/monitoramento/comparar/${active.masterProductId}`} className="underline">
                Comparar preço entre vendedores
              </Link>
            </Text>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-5 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-[var(--color-text-tertiary)]">
              <LineChart className="size-6" aria-hidden />
            </div>
            <Text variant="body-md" className="font-semibold">
              Selecione um produto para monitorarmos
            </Text>
            <Text variant="body-sm" color="tertiary" className="max-w-[36ch]">
              Clique no + ao lado de &quot;Sua lista&quot; pra adicionar o primeiro jogo e acompanhar o gráfico de preço aqui.
            </Text>
            <Link href="/ofertas" className="text-sm underline">
              Ver ofertas
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

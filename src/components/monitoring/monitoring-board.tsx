'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { WatchlistPanel } from './watchlist-panel';
import { PriceHistoryChart } from './price-history-chart';
import { AnimatedPrice } from './animated-price';
import type { PriceHistoryResult } from '@/server/queries/price-history';

interface WatchlistPanelItem {
  masterProductId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  networkName: string;
  currentPriceCents: number;
  changePercent: number | null;
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
}: {
  watchlistItems: WatchlistPanelItem[];
  initialSelectedId: string;
  initialHistory: PriceHistoryResult;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(initialSelectedId);

  const selected = watchlistItems.find((item) => item.masterProductId === selectedId) ?? watchlistItems[0];

  function handleSelect(masterProductId: string) {
    setSelectedId(masterProductId);
    const params = new URLSearchParams(searchParams.toString());
    params.set('jogo', masterProductId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <WatchlistPanel initialItems={watchlistItems} selectedMasterProductId={selectedId} onSelect={handleSelect} />

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <Text variant="heading-md">{selected.title}</Text>
              <Text variant="caption" color="tertiary">
                Menor preço entre todas as lojas · atualmente em {selected.networkName}
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
  );
}

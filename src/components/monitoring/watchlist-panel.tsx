'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { AnimatedPrice } from './animated-price';
import { usePollingRefresh } from '@/hooks/use-polling-refresh';

const POLL_INTERVAL_MS = 45_000;

interface WatchlistPanelItem {
  masterProductId: string;
  slug: string;
  title: string;
  networkName: string;
  currentPriceCents: number;
  changePercent: number | null;
}

/**
 * Painel lateral "Lista" (Símbolo/Preço/Var%), estilo watchlist de tela de
 * bolsa. Clique troca o jogo selecionado via ?jogo= na URL (compartilhável),
 * não estado local — mesmo padrão de filtro já usado em /ofertas.
 */
export function WatchlistPanel({
  initialItems,
  selectedMasterProductId,
}: {
  initialItems: WatchlistPanelItem[];
  selectedMasterProductId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);

  usePollingRefresh(async () => {
    const res = await fetch('/api/monitoramento/watchlist');
    if (!res.ok) return;
    const json = (await res.json()) as { items: WatchlistPanelItem[] };
    setItems(json.items ?? []);
  }, POLL_INTERVAL_MS);

  function selectProduct(masterProductId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('jogo', masterProductId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-6 text-center">
        <Text variant="body-sm" color="tertiary">
          Você ainda não está acompanhando nenhum jogo.
        </Text>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
        <Text variant="caption" color="tertiary">
          Jogo
        </Text>
        <Text variant="caption" color="tertiary" className="text-right">
          Preço
        </Text>
        <Text variant="caption" color="tertiary" className="text-right">
          Var%
        </Text>
      </div>
      <ul>
        {items.map((item) => {
          const isSelected = item.masterProductId === selectedMasterProductId;
          const change = item.changePercent;
          const Icon = change == null || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
          // Aqui é rastreamento de preço de COMPRA, não valor de ação: queda é a
          // notícia boa (verde), alta é a notícia ruim (vermelho) — invertido do
          // convencional de bolsa de propósito, igual CamelCamelCamel.
          const changeColor =
            change == null || change === 0
              ? 'text-[var(--color-text-tertiary)]'
              : change > 0
                ? 'text-[var(--color-accent-danger)]'
                : 'text-[var(--color-accent-success)]';

          return (
            <li key={item.masterProductId}>
              <button
                type="button"
                onClick={() => selectProduct(item.masterProductId)}
                className={cn(
                  'grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors',
                  isSelected ? 'bg-[var(--color-bg-elevated)]' : 'hover:bg-[var(--color-bg-surface)]'
                )}
              >
                <div className="min-w-0">
                  <Text variant="body-sm" className="truncate font-medium">
                    {item.title}
                  </Text>
                  <Text variant="caption" color="tertiary">
                    {item.networkName}
                  </Text>
                </div>
                <AnimatedPrice cents={item.currentPriceCents} className="text-body-sm" />
                <span
                  className={cn(
                    'inline-flex items-center justify-end gap-1 text-caption font-medium tabular',
                    changeColor
                  )}
                >
                  <Icon className="size-3" aria-hidden />
                  {change != null ? `${change > 0 ? '+' : ''}${change}%` : 'N/D'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

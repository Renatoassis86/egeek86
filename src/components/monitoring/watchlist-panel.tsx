'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { TrendingUp, TrendingDown, Minus, Plus, Search, Check, Gamepad2, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatBRL } from '@/lib/format';
import { AnimatedPrice } from './animated-price';
import { usePollingRefresh } from '@/hooks/use-polling-refresh';
import { toggleWatch } from '@/server/actions/price-watches';
import type { WatchSearchResult } from '@/server/queries/price-watches';

const POLL_INTERVAL_MS = 45_000;
const SEARCH_DEBOUNCE_MS = 300;

interface WatchlistPanelItem {
  masterProductId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  networkName: string;
  currentPriceCents: number;
  changePercent: number | null;
}

export function WatchlistPanel({
  initialItems,
  selectedMasterProductId,
  onSelect,
  isGuest = false,
}: {
  initialItems: WatchlistPanelItem[];
  selectedMasterProductId: string | null;
  onSelect?: (masterProductId: string) => void;
  isGuest?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  async function refreshWatchlist() {
    if (isGuest) return;
    const res = await fetch('/api/monitoramento/watchlist');
    if (!res.ok) return;
    const json = (await res.json()) as { items: WatchlistPanelItem[] };
    setItems(json.items ?? []);
  }

  usePollingRefresh(refreshWatchlist, POLL_INTERVAL_MS);

  function handleAddClick() {
    if (isGuest) {
      setUnlockModalOpen(true);
    } else {
      setSearchOpen(true);
    }
  }

  function selectProduct(masterProductId: string, index: number) {
    if (isGuest && index >= 1) {
      setUnlockModalOpen(true);
      return;
    }
    onSelect?.(masterProductId);
    const params = new URLSearchParams(searchParams.toString());
    params.set('jogo', masterProductId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
        <Text variant="caption" color="tertiary" className="font-medium">
          Sua lista
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Adicionar jogo à lista"
          onClick={handleAddClick}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <AddToWatchlistDialog open={searchOpen} onOpenChange={setSearchOpen} onAdded={refreshWatchlist} />

      {/* Modal de Desbloqueio para Visitantes */}
      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent className="max-w-md bg-[var(--color-bg-elevated)] border-[var(--color-border-default)]">
          <DialogHeader className="flex flex-col items-center text-center gap-3">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
              <Image
                src="/images/monitoramento/unlock-account.png"
                alt="Desbloqueie o Monitoramento Ilimitado"
                fill
                className="object-cover"
              />
            </div>
            <DialogTitle className="text-xl font-black text-[var(--color-accent-gold)] flex items-center gap-2 mt-2">
              <Lock className="size-5" />
              Desbloqueie o Monitoramento Ilimitado
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              No <strong>Modo de Demonstração</strong>, você pode explorar 1 item como amostra. Crie sua conta grátis para adicionar quantos jogos quiser à sua lista e receber avisos automáticos no e-mail e Telegram quando o preço cair de verdade!
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-3">
            <Button asChild variant="primary" size="lg" className="w-full font-bold">
              <Link href="/entrar?next=/monitoramento">Criar Minha Conta Grátis / Entrar</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setUnlockModalOpen(false)}>
              Continuar com 1 Item de Demonstração
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <div className="p-6 text-center">
          <Text variant="body-sm" color="tertiary">
            Você ainda não está acompanhando nenhum jogo. Clica no + acima pra adicionar o primeiro.
          </Text>
        </div>
      ) : (
        <>
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
            {items.map((item, i) => {
              const isSelected = item.masterProductId === selectedMasterProductId;
              const change = item.changePercent;
              const Icon = change == null || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
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
                    onClick={() => selectProduct(item.masterProductId, i)}
                    className={cn(
                      'grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors',
                      isSelected ? 'bg-[var(--color-bg-elevated)]' : 'hover:bg-[var(--color-bg-surface)]'
                    )}
                  >
                    <WatchThumb src={item.imageUrl} alt={item.title} />
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
        </>
      )}
    </div>
  );
}

/**
 * Dialog "+ Adicionar símbolo" (estilo TradingView) — busca por nome em
 * master_products e adiciona à watchlist via toggleWatch. Fica montado
 * sempre (controlado por `open`) pra não perder o estado de busca ao
 * fechar sem querer.
 */
function AddToWatchlistDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WatchSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/monitoramento/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) return;
        const json = (await res.json()) as { items: WatchSearchResult[] };
        setResults(json.items ?? []);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  async function handleAdd(masterProductId: string) {
    setAddingId(masterProductId);
    try {
      await toggleWatch(masterProductId, true);
      setResults((prev) =>
        prev.map((r) => (r.masterProductId === masterProductId ? { ...r, alreadyWatched: true } : r))
      );
      onAdded();
    } finally {
      setAddingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar à sua lista</DialogTitle>
          <DialogDescription>
            Busca um jogo pra começar a acompanhar — o preço mostrado é sempre o menor entre todos os
            vendedores monitorados, não de uma loja só.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          placeholder="Nome do jogo..."
          leftAddon={<Search />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="max-h-80 overflow-y-auto -mx-2">
          {loading && (
            <Text variant="body-sm" color="tertiary" className="px-2 py-3">
              Buscando...
            </Text>
          )}

          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <Text variant="body-sm" color="tertiary" className="px-2 py-3">
              Nenhum jogo encontrado com esse nome.
            </Text>
          )}

          <ul className="flex flex-col gap-0.5">
            {results.map((result) => (
              <li key={result.masterProductId}>
                <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--color-bg-surface)]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <WatchThumb src={result.imageUrl} alt={result.name} />
                    <div className="min-w-0">
                      <Text variant="body-sm" className="truncate font-medium">
                        {result.name}
                      </Text>
                      <Text variant="caption" color="tertiary">
                        {result.currentPriceCents != null
                          ? `${formatBRL(result.currentPriceCents)} · ${result.networkName}`
                          : 'Sem oferta ativa no momento'}
                      </Text>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={result.alreadyWatched ? 'secondary' : 'primary'}
                    disabled={result.alreadyWatched || addingId === result.masterProductId}
                    onClick={() => handleAdd(result.masterProductId)}
                  >
                    {result.alreadyWatched ? (
                      <>
                        <Check className="size-3.5" /> Adicionado
                      </>
                    ) : addingId === result.masterProductId ? (
                      'Adicionando...'
                    ) : (
                      'Adicionar'
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Capa em miniatura (símbolo do jogo, igual ícone de ativo em tela de bolsa) — ícone de fallback quando não há imagem. */
function WatchThumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-bg-inset)]">
        <Gamepad2 className="size-4 text-[var(--color-text-tertiary)]" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de CDN externa (mesmo padrão de offer-card.tsx)
    <img src={src} alt={alt} className="size-8 shrink-0 rounded-[var(--radius-xs)] object-cover" />
  );
}

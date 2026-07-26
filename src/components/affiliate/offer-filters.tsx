'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import type { AffiliateNetwork } from '@/db/schema';

const SEARCH_DEBOUNCE_MS = 400;

const FORMAT_LABELS: Record<string, string> = {
  physical: 'Físico',
  digital: 'Digital',
};

// 'unknown' fora de propósito — não é um filtro útil pro cliente escolher.
const GEN_LABELS = Object.fromEntries(
  Object.entries(GAME_PLATFORM_GEN_LABELS).filter(([value]) => value !== 'unknown')
) as Record<string, string>;

const SORT_LABELS: Record<string, string> = {
  price_asc: 'Menor preço',
  price_desc: 'Maior preço',
};

/** Radix Select não aceita value="" em Item — usa esse sentinel só localmente pra representar "sem filtro". */
const ALL = '__all__';

interface OfferFiltersProps {
  networks: Pick<AffiliateNetwork, 'id' | 'name' | 'slug' | 'colorHex'>[];
  /** Total de ofertas já filtradas pelo server — contexto real (não decorativo), no espírito de Buscapé/Trivago ("X resultados"). */
  resultCount?: number;
}

/**
 * Ilha client de filtros da vitrine de ofertas — lê/escreve querystring
 * (formato, geracao, rede, ordenar) pra deixar a página server-side
 * (src/app/(shop)/ofertas/page.tsx) refazer a query com listRankedOffers.
 * Menus suspensos (Select/Radix) em vez de linhas de chips — mesmo padrão
 * já usado em admin-offer-filters.tsx, bem mais compacto que uma fileira de
 * botão por opção (principalmente "Loja", que já tem 5 redes).
 */
export function OfferFilters({ networks, resultCount }: OfferFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const format = searchParams.get('formato') ?? ALL;
  const gen = searchParams.get('geracao') ?? ALL;
  const rede = searchParams.get('rede') ?? ALL;
  const sort = searchParams.get('ordenar') ?? 'price_asc';
  const q = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  // Mantém o campo em sincronia se a URL mudar por fora (ex: link "Ver todos
  // os resultados" da busca global do header) sem sobrescrever o que o
  // usuário está digitando agora.
  useEffect(() => {
    setSearchInput(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = [format, gen, rede].some((v) => v !== ALL) || q !== '';

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  // Debounce pra não refazer a query a cada tecla — mesmo padrão já usado no
  // campo de busca de /tabela-de-precos.
  useEffect(() => {
    if (searchInput === q) return;
    const timer = setTimeout(() => setParam('q', searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('formato');
    params.delete('geracao');
    params.delete('rede');
    params.delete('q');
    setSearchInput('');
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/90 backdrop-blur-md p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 w-full max-w-full overflow-hidden shadow-sm">
      {/* 1. Busca compacta e contagem */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar jogo..."
          leftAddon={<Search className="size-3.5 text-[var(--color-text-tertiary)]" />}
          className="h-8 text-xs font-medium w-full sm:w-56 bg-[var(--color-bg-inset)]"
        />

        {typeof resultCount === 'number' && (
          <Text variant="caption" color="tertiary" className="shrink-0 whitespace-nowrap text-[11px] font-semibold px-1">
            {resultCount} {resultCount === 1 ? 'oferta' : 'ofertas'}
          </Text>
        )}
      </div>

      {/* 2. Chips de Filtro em linha horizontal deslizante no mobile */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar whitespace-nowrap w-full sm:w-auto sm:ml-auto">
        <Select value={format} onValueChange={(v) => setParam('formato', v)}>
          <SelectTrigger size="xs" className="h-8 text-[11px] font-semibold shrink-0 w-auto min-w-[96px] bg-[var(--color-bg-inset)] border-[var(--color-border-default)]">
            <SelectValue placeholder="Formato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todo formato</SelectItem>
            {Object.entries(FORMAT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={gen} onValueChange={(v) => setParam('geracao', v)}>
          <SelectTrigger size="xs" className="h-8 text-[11px] font-semibold shrink-0 w-auto min-w-[100px] bg-[var(--color-bg-inset)] border-[var(--color-border-default)]">
            <SelectValue placeholder="Geração" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toda geração</SelectItem>
            {Object.entries(GEN_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {networks.length > 0 && (
          <Select value={rede} onValueChange={(v) => setParam('rede', v)}>
            <SelectTrigger size="xs" className="h-8 text-[11px] font-semibold shrink-0 w-auto min-w-[90px] bg-[var(--color-bg-inset)] border-[var(--color-border-default)]">
              <SelectValue placeholder="Loja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toda loja</SelectItem>
              {networks.map((network) => (
                <SelectItem key={network.id} value={network.id}>
                  {network.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sort} onValueChange={(v) => setParam('ordenar', v)}>
          <SelectTrigger size="xs" className="h-8 text-[11px] font-semibold shrink-0 w-auto min-w-[105px] bg-[var(--color-bg-inset)] border-[var(--color-border-default)]">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-8 px-2 text-[11px] font-bold text-[var(--color-accent-hype)] hover:bg-[var(--color-accent-hype)]/10 shrink-0 border border-[var(--color-accent-hype)]/30 rounded-md"
          >
            <RotateCcw className="size-3" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

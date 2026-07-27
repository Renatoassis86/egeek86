'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Gamepad2,
  Tv2,
  Headphones,
  Flame,
  Tag,
  ArrowUpRight,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@/lib/format';
import { GAME_FORMAT_LABELS, GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { cn } from '@/lib/cn';
import type { PriceTableRow } from '@/server/queries/price-table';
import type { ProductType, GameFormat, GamePlatformGen } from '@/db/schema';

type SortBy = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'discount_desc';

interface PriceTableFilters {
  area: ProductType;
  format: GameFormat | 'all';
  gen: GamePlatformGen | 'all';
  sortBy: SortBy;
  search: string;
  onlyBelowAvg: boolean;
}

interface PriceTableBoardProps {
  items: PriceTableRow[];
  totalCount: number;
  filters: PriceTableFilters;
}

const SEARCH_DEBOUNCE_MS = 400;

export function PriceTableBoard({ items, totalCount, filters }: PriceTableBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(filters.search);

  // Mantém o campo em sincronia se a URL mudar por outra via (voltar/avançar)
  // sem sobrescrever o que a pessoa está digitando agora.
  useEffect(() => {
    setSearchInput(filters.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a URL muda, não a cada tecla
  }, [filters.search]);

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === '') params.delete(key);
      else params.set(key, value);
    }
    // Qualquer mudança de filtro sempre volta pra página 1 e sai do modo
    // "ver todos" — sem isso, filtrar enquanto navegado numa página 3+ podia
    // cair numa página que não existe mais no resultado filtrado.
    params.delete('pagina');
    params.delete('todos');
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
    });
  }

  // Busca com debounce — evita 1 requisição ao servidor por tecla digitada.
  useEffect(() => {
    if (searchInput === filters.search) return;
    const timer = setTimeout(() => setParams({ busca: searchInput || null }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só depende do texto digitado
  }, [searchInput]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Abas Superiores de Áreas (Jogos, Consoles, Acessórios) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)]">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant={filters.area === 'game' ? 'primary' : 'ghost'}
            onClick={() => setParams({ area: null })}
            className="flex-1 sm:flex-none gap-2 font-bold"
          >
            <Gamepad2 className="size-4" />
            <span>Jogos</span>
          </Button>

          <Button
            variant={filters.area === 'console' ? 'primary' : 'ghost'}
            onClick={() => setParams({ area: 'console' })}
            className="flex-1 sm:flex-none gap-2 font-bold"
          >
            <Tv2 className="size-4" />
            <span>Consoles</span>
          </Button>

          <Button
            variant={filters.area === 'accessory' ? 'primary' : 'ghost'}
            onClick={() => setParams({ area: 'accessory' })}
            className="flex-1 sm:flex-none gap-2 font-bold"
          >
            <Headphones className="size-4" />
            <span>Acessórios</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] px-3 py-1 bg-[var(--color-bg-elevated)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-[var(--color-accent-gold)]" />}
          <span>{totalCount} cotações monitoradas nesta área</span>
        </div>
      </div>

      {/* 2. Barra de Filtros Discreta & Compacta */}
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/90 backdrop-blur-md p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 w-full max-w-full overflow-hidden shadow-sm">
        {/* Busca por nome */}
        <div className="relative w-full sm:w-56 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-text-tertiary)]" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Pesquisar..."
            className="pl-8 h-8 text-xs font-medium bg-[var(--color-bg-inset)]"
          />
        </div>

        {/* Linha de filtros deslizante no mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar whitespace-nowrap w-full sm:w-auto sm:ml-auto">
          {/* Plataforma */}
          <select
            value={filters.gen}
            onChange={(e) => setParams({ geracao: e.target.value === 'all' ? null : e.target.value })}
            className="h-8 px-2.5 text-[11px] font-semibold rounded-md bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] shrink-0"
          >
            <option value="all">Toda Plataforma</option>
            <option value="switch_1">Nintendo Switch</option>
            <option value="switch_2">Nintendo Switch 2</option>
            <option value="ps5">PlayStation 5</option>
            <option value="ps4">PlayStation 4</option>
            <option value="xbox_series">Xbox Series X/S</option>
            <option value="xbox_one">Xbox One</option>
          </select>

          {/* Formato */}
          <select
            value={filters.format}
            onChange={(e) => setParams({ formato: e.target.value === 'all' ? null : e.target.value })}
            className="h-8 px-2.5 text-[11px] font-semibold rounded-md bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] shrink-0"
          >
            <option value="all">Todo Formato</option>
            <option value="physical">Mídia Física</option>
            <option value="digital">Mídia Digital</option>
          </select>

          {/* Ordenação */}
          <select
            value={filters.onlyBelowAvg ? 'discount_desc' : filters.sortBy}
            disabled={filters.onlyBelowAvg}
            onChange={(e) => setParams({ ordenar: e.target.value })}
            className="h-8 px-2.5 text-[11px] font-semibold rounded-md bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] shrink-0 disabled:opacity-60"
          >
            <option value="name_asc">Ordem (A-Z)</option>
            <option value="name_desc">Ordem (Z-A)</option>
            <option value="price_asc">Menor Preço</option>
            <option value="price_desc">Maior Preço</option>
            <option value="discount_desc">Maior Desconto vs. Média</option>
          </select>

          {/* Toggle de Apenas Oportunidades / Descontos */}
          <Button
            variant={filters.onlyBelowAvg ? 'hype' : 'outline'}
            size="sm"
            onClick={() => setParams({ desconto: filters.onlyBelowAvg ? null : '1' })}
            className="h-8 px-2.5 text-[11px] font-bold gap-1.5 shrink-0 border-[var(--color-accent-hype)]/40"
          >
            <Flame className="size-3" />
            <span>Abaixo da Média</span>
          </Button>
        </div>
      </div>

      {/* 3. Tabela Geral de Preços Contínua */}
      {items.length === 0 ? (
        <Card className="bg-[var(--color-bg-surface)] p-12 text-center">
          <Text variant="heading-sm">Nenhum produto encontrado para estes filtros.</Text>
          <Text variant="body-sm" color="secondary" className="mt-1">
            Tente pesquisar outro termo ou limpar os filtros selecionados.
          </Text>
        </Card>
      ) : (
        <>
          {/* Visão de Cards Responsivos para Telas Celulares (Mobile) */}
          <div className="block md:hidden space-y-3">
            {items.map((item) => {
              const img = item.defaultImages[0] || null;
              const specLine = [
                item.gameFormat !== 'unknown' ? GAME_FORMAT_LABELS[item.gameFormat] : null,
                item.gamePlatformGen !== 'unknown' ? GAME_PLATFORM_GEN_LABELS[item.gamePlatformGen] : null,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <div
                  key={item.masterProductId}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4 shadow-sm space-y-3 min-w-0"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {img ? (
                      <img
                        src={img}
                        alt={item.name}
                        className="size-14 object-contain rounded bg-[var(--color-bg-inset)] p-1 shrink-0"
                      />
                    ) : (
                      <div className="size-14 rounded bg-[var(--color-bg-inset)] flex items-center justify-center shrink-0">
                        <Tag className="size-6 text-[var(--color-text-tertiary)]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={`/ofertas/${item.offerSlug}`} className="hover:underline">
                        <Text variant="body-sm" className="font-bold line-clamp-2 leading-snug">
                          {item.name}
                        </Text>
                      </Link>
                      {specLine && (
                        <Text variant="caption" color="tertiary" className="uppercase tracking-wider mt-0.5 block truncate">
                          {specLine}
                        </Text>
                      )}
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {item.isLowestEver ? (
                          <Badge variant="hype" size="sm" className="font-bold text-[10px] py-0 px-1.5">
                            Recorde Histórico
                          </Badge>
                        ) : item.avgDiscountPercent && item.avgDiscountPercent > 0 ? (
                          <Badge variant="outline" size="sm" className="border-emerald-500/50 text-emerald-400 text-[10px] py-0 px-1.5">
                            -{item.avgDiscountPercent}% Média
                          </Badge>
                        ) : null}
                        <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
                          {item.networkName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)]/60 pt-2.5 min-w-0">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] block">
                        Preço Atual
                      </span>
                      <Text variant="mono-md" className="font-bold text-[var(--color-accent-gold)] tabular">
                        {formatBRL(item.currentPriceCents)}
                      </Text>
                    </div>

                    {item.lowestPriceCents > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] block">
                          Menor Histórico
                        </span>
                        <Text variant="mono-sm" color="tertiary" className="tabular">
                          {formatBRL(item.lowestPriceCents)}
                        </Text>
                      </div>
                    )}

                    <Button asChild variant="outline" size="sm" className="gap-1 h-8 text-xs font-bold shrink-0">
                      <Link href={`/monitoramento/comparar/${item.masterProductId}`}>
                        <span>Comparar</span>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visão de Tabela Completa para Telas Maiores (Tablet / Desktop) */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] shadow-md">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Título do Produto
                  </th>
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-right">
                    Preço Atual
                  </th>
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-right">
                    Média Histórica
                  </th>
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-right">
                    Menor Histórico
                  </th>
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-center">
                    Cotações / Loja
                  </th>
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-center">
                    Indicador do Consumidor
                  </th>
                  <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-right">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const img = item.defaultImages[0] || null;
                  const specLine = [
                    item.gameFormat !== 'unknown' ? GAME_FORMAT_LABELS[item.gameFormat] : null,
                    item.gamePlatformGen !== 'unknown' ? GAME_PLATFORM_GEN_LABELS[item.gamePlatformGen] : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr
                      key={item.masterProductId}
                      className="border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-surface)]/80 transition-colors"
                    >
                      {/* Nome & Capa */}
                      <td className="px-4 py-3 max-w-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          {img ? (
                            <img
                              src={img}
                              alt={item.name}
                              className="size-11 object-contain rounded bg-[var(--color-bg-inset)] p-1 shrink-0"
                            />
                          ) : (
                            <div className="size-11 rounded bg-[var(--color-bg-inset)] flex items-center justify-center shrink-0">
                              <Tag className="size-5 text-[var(--color-text-tertiary)]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <Link href={`/ofertas/${item.offerSlug}`} className="hover:underline">
                              <Text variant="body-sm" className="font-bold line-clamp-1">
                                {item.name}
                              </Text>
                            </Link>
                            {specLine && (
                              <Text variant="caption" color="tertiary" className="uppercase tracking-wider truncate block">
                                {specLine}
                              </Text>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Preço Atual */}
                      <td className="px-4 py-3 text-right">
                        <Text variant="mono-md" className="font-bold text-[var(--color-accent-gold)] tabular">
                          {formatBRL(item.currentPriceCents)}
                        </Text>
                      </td>

                      {/* Média Histórica */}
                      <td className="px-4 py-3 text-right">
                        {item.avgPriceCents30d ? (
                          <div className="flex flex-col items-end">
                            <Text variant="mono-sm" color="secondary" className="line-through tabular">
                              {formatBRL(item.avgPriceCents30d)}
                            </Text>
                            {item.avgDiscountPercent && item.avgDiscountPercent > 0 && (
                              <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                                -{item.avgDiscountPercent}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <Text variant="caption" color="tertiary">
                            --
                          </Text>
                        )}
                      </td>

                      {/* Menor Histórico */}
                      <td className="px-4 py-3 text-right">
                        <Text variant="mono-sm" color="tertiary" className="tabular">
                          {formatBRL(item.lowestPriceCents)}
                        </Text>
                      </td>

                      {/* Cotações & Loja */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
                            {item.totalQuoteCount} variações
                          </span>
                          <span className="text-[10px] color-tertiary">{item.networkName}</span>
                        </div>
                      </td>

                      {/* Indicador do Consumidor */}
                      <td className="px-4 py-3 text-center">
                        {item.isLowestEver ? (
                          <Badge variant="hype" size="sm" className="font-bold">
                            Recorde Histórico
                          </Badge>
                        ) : item.avgDiscountPercent && item.avgDiscountPercent > 0 ? (
                          <Badge variant="outline" size="sm" className="border-emerald-500/50 text-emerald-400">
                            Preço Excelente
                          </Badge>
                        ) : (
                          <Badge variant="outline" size="sm">
                            Preço Regular
                          </Badge>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="ghost" size="sm" className="gap-1 hover:text-[var(--color-accent-gold)]">
                          <Link href={`/monitoramento/comparar/${item.masterProductId}`}>
                            <span>Comparar</span>
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

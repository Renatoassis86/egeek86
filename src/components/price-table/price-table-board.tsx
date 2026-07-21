'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Search,
  SlidersHorizontal,
  Gamepad2,
  Tv2,
  Headphones,
  TrendingDown,
  Flame,
  ArrowUpDown,
  Tag,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  RefreshCcw,
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

interface PriceTableBoardProps {
  initialItems: PriceTableRow[];
  initialTotalCount: number;
}

export function PriceTableBoard({ initialItems, initialTotalCount }: PriceTableBoardProps) {
  const [activeArea, setActiveArea] = useState<ProductType>('game');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc');
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);

  // Filtragem dinâmica no cliente
  const filteredItems = initialItems.filter((item) => {
    // Área (Game, Console, Accessory)
    if (item.productType !== activeArea) return false;

    // Busca por Nome
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!item.name.toLowerCase().includes(q)) return false;
    }

    // Plataforma
    if (selectedPlatform !== 'all' && item.gamePlatformGen !== selectedPlatform) {
      return false;
    }

    // Formato
    if (selectedFormat !== 'all' && item.gameFormat !== selectedFormat) {
      return false;
    }

    // Filtro de Desconto
    if (onlyDiscounted && (!item.avgDiscountPercent || item.avgDiscountPercent <= 0)) {
      return false;
    }

    return true;
  });

  // Ordenação
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    if (sortBy === 'price_asc') return a.currentPriceCents - b.currentPriceCents;
    if (sortBy === 'price_desc') return b.currentPriceCents - a.currentPriceCents;
    return 0;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Abas Superiores de Áreas (Jogos, Consoles, Acessórios) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)]">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant={activeArea === 'game' ? 'primary' : 'ghost'}
            onClick={() => setActiveArea('game')}
            className="flex-1 sm:flex-none gap-2 font-bold"
          >
            <Gamepad2 className="size-4" />
            <span>Jogos</span>
          </Button>

          <Button
            variant={activeArea === 'console' ? 'primary' : 'ghost'}
            onClick={() => setActiveArea('console')}
            className="flex-1 sm:flex-none gap-2 font-bold"
          >
            <Tv2 className="size-4" />
            <span>Consoles</span>
          </Button>

          <Button
            variant={activeArea === 'accessory' ? 'primary' : 'ghost'}
            onClick={() => setActiveArea('accessory')}
            className="flex-1 sm:flex-none gap-2 font-bold"
          >
            <Headphones className="size-4" />
            <span>Acessórios</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] px-3 py-1 bg-[var(--color-bg-elevated)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
          <Sparkles className="size-3.5 text-[var(--color-accent-gold)]" />
          <span>{sortedItems.length} cotações monitoradas nesta área</span>
        </div>
      </div>

      {/* 2. Barra de Filtros de Indicadores do Consumidor */}
      <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)]">
        <CardContent className="p-4 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Busca Instantânea */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-tertiary)]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por nome..."
                className="pl-9 bg-[var(--color-bg-elevated)]"
              />
            </div>

            {/* Plataforma */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)]"
            >
              <option value="all">Todas as Plataformas</option>
              <option value="switch_1">Nintendo Switch</option>
              <option value="switch_2">Nintendo Switch 2</option>
              <option value="ps5">PlayStation 5</option>
              <option value="ps4">PlayStation 4</option>
              <option value="xbox_series">Xbox Series X/S</option>
              <option value="xbox_one">Xbox One</option>
            </select>

            {/* Formato */}
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)]"
            >
              <option value="all">Todos os Formatos</option>
              <option value="physical">Mídia Física</option>
              <option value="digital">Mídia Digital</option>
            </select>

            {/* Ordenação */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 text-xs font-semibold rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] font-bold text-[var(--color-accent-gold)]"
            >
              <option value="name_asc">Ordem Alfabética (A-Z)</option>
              <option value="name_desc">Ordem Alfabética (Z-A)</option>
              <option value="price_asc">Menor Preço (R$)</option>
              <option value="price_desc">Maior Preço (R$)</option>
            </select>
          </div>

          {/* Toggle de Apenas Oportunidades / Descontos */}
          <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
            <Button
              variant={onlyDiscounted ? 'hype' : 'outline'}
              size="sm"
              onClick={() => setOnlyDiscounted(!onlyDiscounted)}
              className="gap-2 text-xs font-bold"
            >
              <Flame className="size-3.5" />
              <span>Apenas Itens Abaixo da Média de Preço</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. Tabela Geral de Preços Contínua */}
      {sortedItems.length === 0 ? (
        <Card className="bg-[var(--color-bg-surface)] p-12 text-center">
          <Text variant="heading-sm">Nenhum produto encontrado para estes filtros.</Text>
          <Text variant="body-sm" color="secondary" className="mt-1">
            Tente pesquisar outro termo ou limpar os filtros selecionados.
          </Text>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] shadow-md">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Título do Produto (A-Z)
                </th>
                <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-right">
                  Preço Atual
                </th>
                <th className="px-4 py-3.5 text-caption font-black uppercase tracking-wider text-[var(--color-text-tertiary)] text-right">
                  Média 30 Dias
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
              {sortedItems.map((item) => {
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
                      <div className="flex items-center gap-3">
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
                            <Text variant="caption" color="tertiary" className="uppercase tracking-wider">
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

                    {/* Média 30 Dias */}
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
      )}
    </div>
  );
}

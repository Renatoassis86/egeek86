'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, LineChart, Gamepad2, Headphones, TrendingDown, Layers, Monitor } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CouponCarousel } from './coupon-carousel';
import type { DisplayCoupon } from '@/server/queries/affiliate';

interface MarketplaceHeroBannerProps {
  title: string;
  subtitle: string;
  categoryTag?: string;
  stats?: {
    monitoredProducts?: number;
    lowestPriceCount?: number;
    partnerStores?: number;
  };
  coupons: DisplayCoupon[];
}

export function MarketplaceHeroBanner({
  title,
  subtitle,
  categoryTag = 'Geek Deals · Inteligência de Preço',
  stats,
  coupons,
}: MarketplaceHeroBannerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set('q', query.trim());
    } else {
      params.delete('q');
    }
    startTransition(() => {
      router.push(`/ofertas?${params.toString()}`);
    });
  };

  const handleCategoryShortcut = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => {
      router.push(`/ofertas?${params.toString()}`);
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/60 p-6 md:p-10 backdrop-blur-xl">
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.25} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.14} />

      <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8 z-10">
        {/* Lado Esquerdo: Conteúdo Comercial & Busca */}
        <div className="flex-1 max-w-2xl">
          <Reveal>
            <Text variant="label" color="hype" className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs">
              <LineChart className="size-4 text-[var(--color-accent-hype)]" aria-hidden />
              {categoryTag}
            </Text>
            <Text as="h1" variant="display-lg" className="mt-2 font-black tracking-tight text-[var(--color-text-primary)]">
              {title}
            </Text>
            <Text variant="body-lg" color="secondary" className="mt-2 font-medium leading-relaxed text-[var(--color-text-secondary)]">
              {subtitle}
            </Text>
          </Reveal>

          {/* Barra de Pesquisa Estilo Portal */}
          <Reveal delay={0.04}>
            <form onSubmit={handleSearch} className="mt-6 flex items-center gap-2 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por jogo, console ou acessório..."
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/90 py-2.5 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition-all focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                />
              </div>
              <Button type="submit" disabled={isPending} className="h-10 px-5 font-bold">
                {isPending ? 'Buscando...' : 'Buscar'}
              </Button>
            </form>
          </Reveal>

          {/* Pílulas de Atalho / Categorias Rápidas */}
          <Reveal delay={0.06}>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="text-[var(--color-text-tertiary)] text-[11px] uppercase font-bold tracking-wider mr-1">
                Atalhos:
              </span>
              <button
                type="button"
                onClick={() => handleCategoryShortcut('formato', 'physical')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/60 px-3 py-1 text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)] transition-all"
              >
                <Layers className="size-3 text-[var(--color-accent-primary)]" />
                Mídia Física
              </button>
              <button
                type="button"
                onClick={() => handleCategoryShortcut('geracao', 'switch_1')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/60 px-3 py-1 text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)] transition-all"
              >
                <Gamepad2 className="size-3 text-red-500" />
                Switch
              </button>
              <button
                type="button"
                onClick={() => handleCategoryShortcut('geracao', 'ps5')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/60 px-3 py-1 text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)] transition-all"
              >
                <Monitor className="size-3 text-blue-500" />
                PS5
              </button>
              <button
                type="button"
                onClick={() => handleCategoryShortcut('tipo', 'accessory')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/60 px-3 py-1 text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)] transition-all"
              >
                <Headphones className="size-3 text-[var(--color-accent-hype)]" />
                Acessórios
              </button>
            </div>
          </Reveal>

          {/* Métricas do Topo */}
          {stats && (
            <Reveal delay={0.08}>
              <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-[var(--color-border-subtle)]/60 pt-5">
                {stats.monitoredProducts != null && (
                  <div className="flex flex-col">
                    <span className="font-mono text-xl font-black text-[var(--color-accent-primary)]">
                      {stats.monitoredProducts}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      Produtos Monitorados
                    </span>
                  </div>
                )}
                {stats.lowestPriceCount != null && (
                  <div className="flex flex-col">
                    <span className="font-mono text-xl font-black text-[var(--color-accent-hype)]">
                      {stats.lowestPriceCount}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      No Menor Preço Histórico
                    </span>
                  </div>
                )}
                {stats.partnerStores != null && (
                  <div className="flex flex-col">
                    <span className="font-mono text-xl font-black text-[var(--color-text-primary)]">
                      {stats.partnerStores}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      Lojas Parceiras
                    </span>
                  </div>
                )}
              </div>
            </Reveal>
          )}
        </div>

        {/* Lado Direito: Carrossel de Cupons do Dia */}
        <div className="shrink-0 flex justify-center lg:justify-end w-full lg:w-auto">
          <CouponCarousel coupons={coupons} />
        </div>
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { cn } from '@/lib/cn';
import type { AffiliateNetwork } from '@/db/schema';

const FORMAT_OPTIONS = [
  { value: 'physical', label: 'Físico' },
  { value: 'digital', label: 'Digital' },
] as const;

const GEN_OPTIONS = [
  { value: 'switch_1', label: 'Switch' },
  { value: 'switch_2', label: 'Switch 2' },
] as const;

const SORT_OPTIONS = [
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
] as const;

interface OfferFiltersProps {
  networks: Pick<AffiliateNetwork, 'id' | 'name' | 'slug' | 'colorHex'>[];
}

/**
 * Ilha client de filtros da vitrine de ofertas — lê/escreve querystring
 * (formato, geracao, rede, ordenar) pra deixar a página server-side
 * (src/app/(shop)/ofertas/page.tsx) refazer a query com listRankedOffers.
 * Mesma UI serve pro trigger inline (desktop) e pro Drawer (mobile).
 */
export function OfferFilters({ networks }: OfferFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const format = searchParams.get('formato');
  const gen = searchParams.get('geracao');
  const rede = searchParams.get('rede');
  const sort = searchParams.get('ordenar') ?? 'price_asc';

  const activeCount = [format, gen, rede].filter(Boolean).length;

  function pushParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) {
      params.delete(key);
    } else if (params.get(key) === value) {
      // clicar de novo na opção já ativa desliga o filtro
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('formato');
    params.delete('geracao');
    params.delete('rede');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const body = (
    <div className="flex flex-col gap-5">
      <FilterGroup label="Formato">
        {FORMAT_OPTIONS.map((opt) => (
          <FilterPill
            key={opt.value}
            active={format === opt.value}
            onClick={() => pushParam('formato', opt.value)}
          >
            {opt.label}
          </FilterPill>
        ))}
      </FilterGroup>

      <FilterGroup label="Geração">
        {GEN_OPTIONS.map((opt) => (
          <FilterPill key={opt.value} active={gen === opt.value} onClick={() => pushParam('geracao', opt.value)}>
            {opt.label}
          </FilterPill>
        ))}
      </FilterGroup>

      {networks.length > 0 && (
        <FilterGroup label="Loja">
          {networks.map((network) => (
            <FilterPill key={network.id} active={rede === network.id} onClick={() => pushParam('rede', network.id)}>
              {network.name}
            </FilterPill>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Ordenar por">
        {SORT_OPTIONS.map((opt) => (
          <FilterPill key={opt.value} active={sort === opt.value} onClick={() => pushParam('ordenar', opt.value)}>
            {opt.label}
          </FilterPill>
        ))}
      </FilterGroup>
    </div>
  );

  return (
    <>
      {/* Desktop: filtros inline */}
      <div className="hidden lg:flex flex-wrap items-center gap-2">
        {body}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-[var(--color-text-tertiary)]">
            <X className="size-3.5" />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Mobile: botão que abre Drawer */}
      <div className="lg:hidden">
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="secondary" size="md" leftIcon={<SlidersHorizontal className="size-4" />}>
              Filtros
              {activeCount > 0 && (
                <Badge variant="primary" size="sm" className="ml-1">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Filtrar ofertas</DrawerTitle>
            </DrawerHeader>
            <div className="px-5 pb-4">{body}</div>
            <DrawerFooter className="flex-row">
              <Button variant="ghost" size="md" onClick={clearAll} className="flex-1">
                Limpar
              </Button>
              <DrawerClose asChild>
                <Button size="md" className="flex-1">
                  Ver resultados
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-2">
      <Text variant="label" color="tertiary" className="lg:hidden">
        {label}
      </Text>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center h-9 px-3 rounded-[var(--radius-full)] text-body-sm font-medium border whitespace-nowrap',
        'transition-colors duration-[var(--duration-fast)]',
        active
          ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)] border-transparent'
          : 'bg-transparent text-[var(--color-text-secondary)] border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
      )}
    >
      {children}
    </button>
  );
}

'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import type { AffiliateNetwork } from '@/db/schema';

const FORMAT_LABELS: Record<string, string> = {
  physical: 'Físico',
  digital: 'Digital',
};

const GEN_LABELS: Record<string, string> = {
  switch_1: 'Switch',
  switch_2: 'Switch 2',
};

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

  const hasFilters = [format, gen, rede].some((v) => v !== ALL);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('formato');
    params.delete('geracao');
    params.delete('rede');
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
      {typeof resultCount === 'number' && (
        <Text variant="caption" color="tertiary" className="shrink-0 whitespace-nowrap font-medium">
          {resultCount} {resultCount === 1 ? 'oferta' : 'ofertas'}
        </Text>
      )}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select value={format} onValueChange={(v) => setParam('formato', v)}>
          <SelectTrigger size="sm" className="w-full sm:w-[9rem]">
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
          <SelectTrigger size="sm" className="w-full sm:w-[9rem]">
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
            <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
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
          <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
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
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="w-full text-[var(--color-text-tertiary)] sm:ml-auto sm:w-fit"
        >
          <RotateCcw className="size-3.5" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

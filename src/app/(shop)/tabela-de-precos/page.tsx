import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { getPriceTableData, type PriceTableFilter } from '@/server/queries/price-table';
import { PriceTableBoard } from '@/components/price-table/price-table-board';
import type { ProductType, GameFormat, GamePlatformGen } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Tabela Geral de Preços | Espaço Geek 86',
  description: 'Tabela dinâmica e contínua de preços para todos os jogos, consoles e acessórios em ordem alfabética com indicadores de decisão do consumidor.',
};

export const dynamic = 'force-dynamic';

const AREA_VALUES: readonly ProductType[] = ['game', 'console', 'accessory'];
const FORMAT_VALUES: readonly GameFormat[] = ['physical', 'digital'];
const GEN_VALUES: readonly GamePlatformGen[] = ['switch_1', 'switch_2', 'ps5', 'ps4', 'xbox_series', 'xbox_one'];
const SORT_VALUES = ['name_asc', 'name_desc', 'price_asc', 'price_desc', 'discount_desc'] as const;
const PAGE_SIZE = 40;
/** Teto de segurança pro "Ver todos" — bem acima de qualquer contagem realista filtrada hoje. */
const SHOW_ALL_CAP = 1000;

function parseEnumParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function TabelaDePrecosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const area = parseEnumParam(sp.area, AREA_VALUES) ?? 'game';
  const format = parseEnumParam(sp.formato, FORMAT_VALUES);
  const gen = parseEnumParam(sp.geracao, GEN_VALUES);
  const sortBy = parseEnumParam(sp.ordenar, SORT_VALUES) ?? 'name_asc';
  const search = typeof sp.busca === 'string' && sp.busca.trim() ? sp.busca.trim() : undefined;
  const onlyBelowAvg = sp.desconto === '1';
  const showAll = sp.todos === '1';
  const page = Math.max(1, Number(sp.pagina) || 1);

  const filter: PriceTableFilter = {
    productType: area,
    gameFormat: format,
    gamePlatformGen: gen,
    searchQuery: search,
    onlyBelowAvg,
    sortBy,
    limit: showAll ? SHOW_ALL_CAP : PAGE_SIZE,
    offset: showAll ? 0 : (page - 1) * PAGE_SIZE,
  };

  const { items, totalCount } = await getPriceTableData(filter);

  const paginationParams = new URLSearchParams();
  if (area !== 'game') paginationParams.set('area', area);
  if (format) paginationParams.set('formato', format);
  if (gen) paginationParams.set('geracao', gen);
  if (sortBy !== 'name_asc') paginationParams.set('ordenar', sortBy);
  if (search) paginationParams.set('busca', search);
  if (onlyBelowAvg) paginationParams.set('desconto', '1');

  function pageHref(targetPage: number) {
    const params = new URLSearchParams(paginationParams);
    if (targetPage > 1) params.set('pagina', String(targetPage));
    const qs = params.toString();
    return `/tabela-de-precos${qs ? `?${qs}` : ''}`;
  }

  const showAllHref = (() => {
    const params = new URLSearchParams(paginationParams);
    params.set('todos', '1');
    return `/tabela-de-precos?${params.toString()}`;
  })();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 flex flex-col gap-8">
      <Reveal>
        <div className="flex flex-col gap-2 max-w-3xl">
          <Text variant="label" color="tertiary" className="uppercase tracking-widest">
            Monitoramento Abrangente
          </Text>
          <Text as="h1" variant="display-lg">
            Tabela Geral de Preços
          </Text>
          <Text variant="body-md" color="secondary" className="mt-1">
            Explore todo o catálogo monitorado em ordem alfabética. Filtre por área (Jogos, Consoles e Acessórios) e compare cotações, médias históricas e os principais indicadores para sua decisão de compra.
          </Text>
        </div>
      </Reveal>

      <PriceTableBoard
        items={items}
        totalCount={totalCount}
        filters={{ area, format: format ?? 'all', gen: gen ?? 'all', sortBy, search: search ?? '', onlyBelowAvg }}
      />

      {!showAll && totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text variant="body-sm" color="secondary">
            Página {page} de {totalPages} · {totalCount} {totalCount === 1 ? 'item encontrado' : 'itens encontrados'}
          </Text>
          <div className="flex items-center gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled className="gap-1">
                <ChevronLeft className="size-4" /> Anterior
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={pageHref(page - 1)}>
                  <ChevronLeft className="size-4" /> Anterior
                </Link>
              </Button>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled className="gap-1">
                Próxima <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={pageHref(page + 1)}>
                  Próxima <ChevronRight className="size-4" />
                </Link>
              </Button>
            )}
            {totalCount > PAGE_SIZE && (
              <Button asChild variant="ghost" size="sm">
                <Link href={showAllHref}>Ver todos ({totalCount})</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {showAll && totalCount > 0 && (
        <Text variant="body-sm" color="secondary">
          {items.length >= totalCount
            ? `Mostrando todos os ${totalCount} ${totalCount === 1 ? 'item encontrado' : 'itens encontrados'}`
            : `Mostrando os primeiros ${items.length} de ${totalCount} itens encontrados`}
          {' · '}
          <Link href={pageHref(1)} className="underline hover:text-[var(--color-text-primary)]">
            voltar pra paginação
          </Link>
        </Text>
      )}
    </div>
  );
}

import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { MarketplaceHeroBanner } from '@/components/affiliate/marketplace-hero-banner';
import { getPriceTableData, getNetworksWithOffers, type PriceTableFilter } from '@/server/queries/price-table';
import { getActiveCouponsForDisplay } from '@/server/queries/affiliate';
import { PriceTableBoard } from '@/components/price-table/price-table-board';
import type { ProductType, GameFormat, GamePlatformGen } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Tabela Geral de Preços | Espaço Geek 86',
  description: 'Tabela dinâmica e contínua de preços para todos os jogos, consoles e acessórios com indicadores de decisão do consumidor e cupons ativos.',
};

export const dynamic = 'force-dynamic';

const AREA_VALUES: readonly ProductType[] = ['game', 'console', 'accessory'];
const FORMAT_VALUES: readonly GameFormat[] = ['physical', 'digital'];
const GEN_VALUES: readonly GamePlatformGen[] = ['switch_1', 'switch_2', 'ps5', 'ps4', 'xbox_series', 'xbox_one'];
const SORT_VALUES = ['name_asc', 'name_desc', 'price_asc', 'price_desc', 'discount_desc'] as const;
const PAGE_SIZE = 40;
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
  const loja = typeof sp.loja === 'string' && sp.loja.trim() ? sp.loja.trim() : undefined;

  const filter: PriceTableFilter = {
    productType: area,
    gameFormat: format,
    gamePlatformGen: gen,
    networkSlug: loja,
    searchQuery: search,
    onlyBelowAvg,
    sortBy,
    limit: showAll ? SHOW_ALL_CAP : PAGE_SIZE,
    offset: showAll ? 0 : (page - 1) * PAGE_SIZE,
  };

  const [{ items, totalCount }, coupons, networks] = await Promise.all([
    getPriceTableData(filter),
    getActiveCouponsForDisplay(),
    getNetworksWithOffers(),
  ]);

  const paginationParams = new URLSearchParams();
  if (area !== 'game') paginationParams.set('area', area);
  if (format) paginationParams.set('formato', format);
  if (gen) paginationParams.set('geracao', gen);
  if (sortBy !== 'name_asc') paginationParams.set('ordenar', sortBy);
  if (search) paginationParams.set('busca', search);
  if (onlyBelowAvg) paginationParams.set('desconto', '1');
  if (loja) paginationParams.set('loja', loja);

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
    <div className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-8 lg:py-12 flex flex-col gap-8">
      {/* Banner Principal com Carrossel de Cupons do Dia no Lado Direito */}
      <MarketplaceHeroBanner
        title="Tabela Geral de Preços"
        subtitle="Explore todo o catálogo monitorado em ordem alfabética. Compare cotações ativas, médias históricas e os principais indicadores para sua decisão de compra."
        categoryTag="Monitoramento Abrangente"
        stats={{
          monitoredProducts: totalCount,
          partnerStores: 6,
        }}
        coupons={coupons}
      />

      <PriceTableBoard
        items={items}
        totalCount={totalCount}
        filters={{ area, format: format ?? 'all', gen: gen ?? 'all', sortBy, search: search ?? '', onlyBelowAvg, loja: loja ?? 'all' }}
        networks={networks}
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

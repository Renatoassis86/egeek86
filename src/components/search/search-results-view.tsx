import { Paginacao } from '@/components/ui/paginacao';
import Link from 'next/link';
import { X, SlidersHorizontal, SearchX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { GamePlatformGen } from '@/db/schema';
import {
  searchProducts,
  SEARCH_DEFAULT_PAGE_SIZE,
  type SearchProductKind,
  type SearchSort,
  type SearchProductsResult,
} from '@/server/queries/search-products';
import { getHomeSearchData } from '@/server/queries/home-search';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { SearchBox } from '@/components/search/search-box';
import { ResultsGrid } from '@/components/search/results-grid';
import { SortSelect, type SortOption } from '@/components/search/sort-select';

type RawParams = { [key: string]: string | string[] | undefined };

const PLATFORMS: readonly GamePlatformGen[] = ['switch_1', 'switch_2', 'ps4', 'ps5', 'xbox_one', 'xbox_series', 'xbox_360'];
const TYPES: readonly SearchProductKind[] = ['game', 'console', 'accessory'];
const SORTS: Array<{ value: SearchSort; label: string }> = [
  { value: 'relevance', label: 'Mais relevante' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'discount', label: 'Maior desconto' },
  { value: 'stores', label: 'Mais lojas' },
];
const TYPE_LABEL: Record<SearchProductKind, string> = { game: 'Jogos', console: 'Consoles', accessory: 'Acessórios' };
const TYPE_LABEL_SINGULAR: Record<SearchProductKind, string> = { game: 'jogo', console: 'console', accessory: 'acessório' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "49,90" ou "49.90" ou "50" (reais) para centavos; vazio/ruim = null. */
function parseReais(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export interface ParsedSearchParams {
  q: string;
  platform: GamePlatformGen | null;
  type: SearchProductKind;
  minCents: number | null;
  maxCents: number | null;
  store: string | null;
  sort: SearchSort;
  page: number;
}

export function parseSearchParams(sp: RawParams): ParsedSearchParams {
  const plat = first(sp.plataforma);
  const tipo = first(sp.tipo);
  const ord = first(sp.ordenar);
  return {
    q: (first(sp.q) ?? '').trim().slice(0, 80),
    platform: plat && (PLATFORMS as readonly string[]).includes(plat) ? (plat as GamePlatformGen) : null,
    type: tipo && (TYPES as readonly string[]).includes(tipo) ? (tipo as SearchProductKind) : 'game',
    minCents: parseReais(first(sp.min)),
    maxCents: parseReais(first(sp.max)),
    store: (first(sp.loja) ?? '').trim().slice(0, 60) || null,
    sort: ord === 'price_asc' || ord === 'discount' || ord === 'stores' ? ord : 'relevance',
    page: Math.max(1, Math.min(500, Math.trunc(Number(first(sp.pagina))) || 1)),
  };
}

/** A página é de busca quando há termo ou plataforma escolhida (navegação por plataforma). */
export function isSearchRequest(sp: RawParams): boolean {
  const p = parseSearchParams(sp);
  return p.q.length > 0 || p.platform !== null;
}

function buildHref(p: ParsedSearchParams, over: Partial<Record<string, string | null>>): string {
  const base: Record<string, string | null> = {
    q: p.q || null,
    plataforma: p.platform,
    tipo: p.type === 'game' ? null : p.type,
    min: p.minCents != null ? String(p.minCents / 100) : null,
    max: p.maxCents != null ? String(p.maxCents / 100) : null,
    loja: p.store,
    ordenar: p.sort === 'relevance' ? null : p.sort,
    pagina: null,
  };
  const merged = { ...base, ...over };
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, v);
  const s = usp.toString();
  return s ? `/ofertas?${s}` : '/ofertas';
}

const chipCls =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-full)] border px-3.5 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export async function SearchResultsView({ searchParams }: { searchParams: RawParams }) {
  const p = parseSearchParams(searchParams);
  const [result, home] = await Promise.all([
    searchProducts({
      term: p.q,
      type: p.type,
      platform: p.platform ?? undefined,
      minPriceCents: p.minCents ?? undefined,
      maxPriceCents: p.maxCents ?? undefined,
      store: p.store ?? undefined,
      sort: p.sort,
      page: p.page,
      pageSize: SEARCH_DEFAULT_PAGE_SIZE,
    }),
    getHomeSearchData(),
  ]);

  const effectivePlatform = p.platform ?? result.appliedPlatform;
  const platformName = effectivePlatform ? GAME_PLATFORM_GEN_LABELS[effectivePlatform] : null;
  const heading = p.q
    ? `Preços de “${p.q}”`
    : platformName
      ? `Menores preços de ${TYPE_LABEL[p.type].toLowerCase()} de ${platformName}`
      : 'Buscar preços';

  const activeFilters: Array<{ label: string; href: string }> = [];
  if (p.platform) activeFilters.push({ label: GAME_PLATFORM_GEN_LABELS[p.platform], href: buildHref(p, { plataforma: null }) });
  if (p.minCents != null || p.maxCents != null) {
    const a = p.minCents != null ? formatBRL(p.minCents) : 'R$ 0';
    const b = p.maxCents != null ? formatBRL(p.maxCents) : 'sem limite';
    activeFilters.push({ label: `${a} a ${b}`, href: buildHref(p, { min: null, max: null }) });
  }
  if (p.store) activeFilters.push({ label: p.store, href: buildHref(p, { loja: null }) });
  const clearHref = buildHref(p, { plataforma: null, min: null, max: null, loja: null });

  const sortOptions: SortOption[] = SORTS.map((s) => ({
    ...s,
    href: buildHref(p, { ordenar: s.value === 'relevance' ? null : s.value }),
  }));

  const panel = <FilterPanel p={p} result={result} clearHref={clearHref} hasActive={activeFilters.length > 0} />;

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-10">
      <nav aria-label="Trilha" className="mb-3 text-[13px] text-[var(--color-text-tertiary)]">
        <Link href="/" className="hover:text-[var(--color-text-primary)]">Início</Link>
        <span aria-hidden> / </span>
        <Link href="/ofertas" className="hover:text-[var(--color-text-primary)]">Ofertas</Link>
      </nav>

      <div className="max-w-3xl">
        <SearchBox
          key={`${p.q}|${p.platform ?? ''}`}
          variant="compact"
          initialQuery={p.q}
          initialPlatform={p.platform}
          placeholder="Busque outro jogo ou console"
        />
      </div>

      <div className="mt-6 flex flex-col gap-1">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-[32px]">{heading}</h1>
        {result.total > 0 && (
          <p className="text-[15px] text-[var(--color-text-secondary)]" aria-live="polite">
            {result.truncated
              ? `Os ${result.total} produtos com maior desconto de ${TYPE_LABEL[p.type].toLowerCase()}`
              : `${result.total} ${result.total === 1 ? TYPE_LABEL_SINGULAR[p.type] : TYPE_LABEL[p.type].toLowerCase()} com preço atual`}
            {result.platformFromTerm && platformName ? ` · filtrado por ${platformName}` : ''}
          </p>
        )}
      </div>

      {/* Abas por tipo, com contagem real do motor */}
      <nav aria-label="Tipo de produto" className="mt-5 flex gap-1 overflow-x-auto border-b border-[var(--color-border-default)]">
        {TYPES.map((t) => {
          const on = p.type === t;
          const n = result.facets.types[t] ?? 0;
          return (
            <Link
              key={t}
              href={buildHref(p, { tipo: t === 'game' ? null : t })}
              aria-current={on ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-[15px] font-semibold transition-colors',
                on
                  ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {TYPE_LABEL[t]}
              <span className="rounded-[var(--radius-full)] bg-[var(--color-bg-inset)] px-2 text-[12px] tabular-nums text-[var(--color-text-tertiary)]">
                {n}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
        <div>
          <details className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-semibold text-[var(--color-text-primary)]">
              <SlidersHorizontal className="size-4" aria-hidden />
              Filtros{activeFilters.length ? ` (${activeFilters.length})` : ''}
            </summary>
            <div className="border-t border-[var(--color-border-subtle)] p-4">{panel}</div>
          </details>
          <aside aria-label="Filtros" className="sticky top-28 hidden lg:block">
            {panel}
          </aside>
        </div>

        <div className="min-w-0">
          {(activeFilters.length > 0 || result.total > 0) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.map((f) => (
                  <Link
                    key={f.label}
                    href={f.href}
                    aria-label={`Remover filtro ${f.label}`}
                    className={cn(chipCls, 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] text-[var(--color-text-primary)]')}
                  >
                    {f.label}
                    <X className="size-3.5" aria-hidden />
                  </Link>
                ))}
                {activeFilters.length > 1 && (
                  <Link href={clearHref} className="min-h-11 content-center px-2 text-[14px] font-semibold text-[var(--color-accent-primary)] hover:underline">
                    Limpar filtros
                  </Link>
                )}
              </div>
              {result.total > 0 && <SortSelect options={sortOptions} value={p.sort} />}
            </div>
          )}

          {result.items.length > 0 ? (
            <>
              <ResultsGrid items={result.items} />
              <Pagination p={p} pageCount={result.pageCount} page={result.page} />
            </>
          ) : (
            <EmptyState p={p} result={result} clearHref={clearHref} popular={home.popular} />
          )}
        </div>
      </div>
    </section>
  );
}

function FilterPanel({
  p,
  result,
  clearHref,
  hasActive,
}: {
  p: ParsedSearchParams;
  result: SearchProductsResult;
  clearHref: string;
  hasActive: boolean;
}) {
  const platforms = (Object.entries(result.facets.platforms) as Array<[GamePlatformGen, number]>)
    .filter(([k, n]) => k !== 'unknown' && n > 0)
    .sort((a, b) => b[1] - a[1]);
  // Itens sem plataforma identificada (ex.: legado fora do enum) contam na aba, então a soma das plataformas
  // precisa mostrá-los, senão a lista "soma 22" contra 23 na aba (QA 2026-11-03). Linha informativa, sem filtro.
  const unknownPlatformCount = result.facets.platforms.unknown ?? 0;
  const stores = result.facets.stores;

  return (
    <div className="flex flex-col gap-6">
      {platforms.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Plataforma</legend>
          {platforms.map(([k, n]) => {
            const on = p.platform === k;
            return (
              <Link
                key={k}
                href={buildHref(p, { plataforma: on ? null : k })}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 items-center justify-between rounded-[var(--radius-md)] px-3 text-[15px] transition-colors hover:bg-[var(--color-bg-elevated)]',
                  on ? 'bg-[var(--color-accent-primary-muted)] font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
                )}
              >
                <span>{GAME_PLATFORM_GEN_LABELS[k]}</span>
                <span className="text-[13px] tabular-nums text-[var(--color-text-tertiary)]">{n}</span>
              </Link>
            );
          })}
          {unknownPlatformCount > 0 && (
            <div className="flex min-h-11 items-center justify-between px-3 text-[15px] text-[var(--color-text-tertiary)]">
              <span>Outras plataformas</span>
              <span className="text-[13px] tabular-nums">{unknownPlatformCount}</span>
            </div>
          )}
        </fieldset>
      )}

      <form action="/ofertas" method="get" className="flex flex-col gap-2">
        {p.q && <input type="hidden" name="q" value={p.q} />}
        {p.platform && <input type="hidden" name="plataforma" value={p.platform} />}
        {p.type !== 'game' && <input type="hidden" name="tipo" value={p.type} />}
        {p.store && <input type="hidden" name="loja" value={p.store} />}
        {p.sort !== 'relevance' && <input type="hidden" name="ordenar" value={p.sort} />}
        <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Faixa de preço (R$)</span>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="f-min">Preço mínimo em reais</label>
          <input
            id="f-min"
            name="min"
            inputMode="decimal"
            placeholder="Mín."
            defaultValue={p.minCents != null ? String(p.minCents / 100) : ''}
            className="min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 text-[16px] text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
          />
          <span aria-hidden className="text-[var(--color-text-tertiary)]">a</span>
          <label className="sr-only" htmlFor="f-max">Preço máximo em reais</label>
          <input
            id="f-max"
            name="max"
            inputMode="decimal"
            placeholder="Máx."
            defaultValue={p.maxCents != null ? String(p.maxCents / 100) : ''}
            className="min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 text-[16px] text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
          />
        </div>
        <button
          type="submit"
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] text-[15px] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
        >
          Aplicar faixa
        </button>
      </form>

      {stores.length > 1 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Loja</legend>
          {stores.map((s) => {
            const on = p.store === s.storeName;
            return (
              <Link
                key={s.storeName}
                href={buildHref(p, { loja: on ? null : s.storeName })}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 items-center justify-between rounded-[var(--radius-md)] px-3 text-[15px] transition-colors hover:bg-[var(--color-bg-elevated)]',
                  on ? 'bg-[var(--color-accent-primary-muted)] font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
                )}
              >
                <span>{s.storeName}</span>
                <span className="text-[13px] tabular-nums text-[var(--color-text-tertiary)]">{s.products}</span>
              </Link>
            );
          })}
        </fieldset>
      )}

      {hasActive && (
        <Link href={clearHref} className="min-h-11 content-center text-[14px] font-semibold text-[var(--color-accent-primary)] hover:underline">
          Limpar filtros
        </Link>
      )}
    </div>
  );
}

function Pagination({ p, page, pageCount }: { p: ParsedSearchParams; page: number; pageCount: number }) {
  return <Paginacao pagina={page} totalPaginas={pageCount} href={(n) => buildHref(p, { pagina: n > 1 ? String(n) : null })} />;
}

function EmptyState({
  p,
  result,
  clearHref,
  popular,
}: {
  p: ParsedSearchParams;
  result: SearchProductsResult;
  clearHref: string;
  popular: Array<{ term: string; platformLabel: string }>;
}) {
  const reason = result.emptyReason;
  const otherTabs = TYPES.filter((t) => t !== p.type && (result.facets.types[t] ?? 0) > 0);

  return (
    <div className="flex flex-col items-start gap-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-6 sm:p-8">
      <SearchX className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
      {reason === 'filtered_out' ? (
        <>
          <h2 className="text-[20px] font-bold text-[var(--color-text-primary)]">Nenhum {TYPE_LABEL_SINGULAR[p.type]} com esses filtros</h2>
          <p className="max-w-prose text-[15px] text-[var(--color-text-secondary)]">
            {p.q ? `Para “${p.q}” ` : ''}existem{' '}
            {TYPES.filter((t) => (result.facets.types[t] ?? 0) > 0)
              .map((t) => `${result.facets.types[t]} ${t === 'game' ? 'jogo(s)' : t === 'console' ? 'console(s)' : 'acessório(s)'}`)
              .join(', ')}{' '}
            sem filtros. Tire a plataforma, a faixa de preço ou a loja para ver.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={clearHref} className={cn(chipCls, 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]')}>
              Limpar filtros
            </Link>
            {otherTabs.map((t) => (
              <Link key={t} href={buildHref(p, { tipo: t === 'game' ? null : t })} className={cn(chipCls, 'border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]')}>
                Ver {TYPE_LABEL[t].toLowerCase()} ({result.facets.types[t]})
              </Link>
            ))}
          </div>
        </>
      ) : reason === 'generic_term' ? (
        <>
          <h2 className="text-[20px] font-bold text-[var(--color-text-primary)]">Digite o nome do jogo ou do console</h2>
          <p className="max-w-prose text-[15px] text-[var(--color-text-secondary)]">
            “{p.q}” é amplo demais para comparar preços. Use o título, por exemplo com a plataforma junto.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-[20px] font-bold text-[var(--color-text-primary)]">Nenhum resultado para “{p.q}”</h2>
          <p className="max-w-prose text-[15px] text-[var(--color-text-secondary)]">
            Só mostramos produtos com preço atual em loja monitorada. Confira a grafia ou busque pelo título completo.
          </p>
          {result.didYouMean.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">Você quis dizer</span>
              <div className="flex flex-wrap gap-2">
                {result.didYouMean.map((s) => (
                  <Link key={s} href={buildHref({ ...p, q: s, minCents: null, maxCents: null, store: null, platform: p.platform }, {})} className={cn(chipCls, 'border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]')}>
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(reason === 'no_match' || reason === 'generic_term') && popular.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">Mais cotados agora</span>
          <div className="flex flex-wrap gap-2">
            {popular.map((t) => (
              <Link key={t.term} href={`/ofertas?q=${encodeURIComponent(t.term)}`} className={cn(chipCls, 'border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]')}>
                {t.term}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

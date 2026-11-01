'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { ProductSuggestion } from '@/server/queries/search-products';
import type { SearchApiResponse } from '@/app/api/search/route';
import { ProductThumb } from '@/components/search/product-thumb';
import { PLATFORM_SHORT } from '@/components/search/platform-short';

const DEBOUNCE_MS = 220;
const MIN_CHARS = 2;

export interface SearchPlatformChip {
  platform: string;
  label: string;
}

interface SearchBoxProps {
  /** hero = campo grande da home; compact = barra da página de resultados. */
  variant?: 'hero' | 'compact';
  initialQuery?: string;
  initialPlatform?: string | null;
  /** Chips de plataforma (valores reais do catálogo). */
  platforms?: SearchPlatformChip[];
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Campo de busca de preços com autocomplete (motor `suggestProducts` via
 * /api/search). É um <form method="get"> real: funciona sem JS e o Enter
 * sempre leva a /ofertas?q=. Combobox ARIA: setas, Enter, Esc, debounce e
 * cancelamento de requisição obsoleta. Fonte >= 16px (sem zoom no iOS).
 */
export function SearchBox({
  variant = 'hero',
  initialQuery = '',
  initialPlatform = null,
  platforms = [],
  autoFocus = false,
  placeholder = 'Busque um jogo ou console',
  className,
}: SearchBoxProps) {
  const router = useRouter();
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [platform, setPlatform] = useState<string | null>(initialPlatform);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<ProductSuggestion[]>([]);
  const [searchedFor, setSearchedFor] = useState('');
  const [active, setActive] = useState(-1);

  const suggestions = useMemo(
    () => (platform ? raw.filter((s) => s.platform === platform) : raw),
    [raw, platform]
  );
  const trimmed = query.trim();
  const showPanel = open && trimmed.length >= MIN_CHARS;
  // última opção = "Ver todos os resultados"
  const optionCount = suggestions.length + 1;

  useEffect(() => {
    if (trimmed.length < MIN_CHARS) {
      setRaw([]);
      setSearchedFor('');
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?scope=products&limit=6&q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('http ' + res.status);
        const json = (await res.json()) as SearchApiResponse;
        setRaw(json.products ?? []);
        setSearchedFor(trimmed);
        setActive(-1);
        setLoading(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setRaw([]);
          setSearchedFor(trimmed);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, []);

  const goSearch = () => {
    const p = new URLSearchParams();
    if (trimmed) p.set('q', trimmed);
    if (platform) p.set('plataforma', platform);
    if (!trimmed && !platform) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    router.push(`/ofertas?${p.toString()}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showPanel) setOpen(true);
      setActive((a) => (a + 1) % optionCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? optionCount - 1 : a - 1));
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === 'Enter' && showPanel && active >= 0 && active < suggestions.length) {
      e.preventDefault();
      setOpen(false);
      router.push(suggestions[active].href);
    }
  };

  const hero = variant === 'hero';
  const noResults = showPanel && !loading && searchedFor === trimmed && suggestions.length === 0;

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        action="/ofertas"
        method="get"
        onSubmit={(e) => {
          e.preventDefault();
          goSearch();
        }}
        className="flex flex-col gap-3"
      >
        {platform && <input type="hidden" name="plataforma" value={platform} />}
        <div
          className={cn(
            'flex items-stretch overflow-hidden border bg-[var(--color-bg-surface)] shadow-[var(--shadow-lg)] transition-colors',
            'focus-within:border-[var(--color-border-focus)] focus-within:ring-2 focus-within:ring-[var(--color-border-focus)]/30',
            'border-[var(--color-border-strong)]',
            hero ? 'h-14 rounded-[var(--radius-lg)] sm:h-16' : 'h-12 rounded-[var(--radius-md)]'
          )}
        >
          <label htmlFor={`${uid}-q`} className="sr-only">
            Buscar preços de jogos e consoles
          </label>
          <span className="flex items-center pl-4 text-[var(--color-text-tertiary)]" aria-hidden>
            <Search className={hero ? 'size-5 sm:size-6' : 'size-5'} />
          </span>
          <input
            id={`${uid}-q`}
            ref={inputRef}
            name="q"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={query}
            placeholder={placeholder}
            maxLength={80}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && active >= 0 ? `${uid}-opt-${active}` : undefined}
            className={cn(
              'min-w-0 flex-1 bg-transparent px-3 text-[16px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none',
              '[&::-webkit-search-cancel-button]:hidden',
              hero && 'sm:text-[18px]'
            )}
          />
          {loading && (
            <span className="flex items-center pr-2 text-[var(--color-text-tertiary)]" aria-hidden>
              <Loader2 className="size-4 animate-spin" />
            </span>
          )}
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setQuery('');
                setRaw([]);
                inputRef.current?.focus();
              }}
              className="flex min-w-11 items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="submit"
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-2 bg-[var(--color-accent-primary)] font-semibold text-[var(--color-text-inverse)]',
              'hover:bg-[var(--color-accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-text-inverse)]',
              hero ? 'px-4 text-[15px] sm:px-8 sm:text-[17px]' : 'px-4 text-[15px] sm:px-6'
            )}
          >
            <Search className="size-4 sm:hidden" aria-hidden />
            <span className="max-sm:sr-only">Buscar preços</span>
          </button>
        </div>

        {platforms.length > 0 && (
          <div
            role="group"
            aria-label="Restringir a uma plataforma"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            {platforms.map((p) => {
              const on = platform === p.platform;
              return (
                <button
                  key={p.platform}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPlatform(on ? null : p.platform)}
                  className={cn(
                    'min-h-11 shrink-0 rounded-[var(--radius-full)] border px-4 text-[14px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
                    on
                      ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
                      : 'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </form>

      {showPanel && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugestões de produtos"
          className="absolute left-0 right-0 z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-1.5 text-left shadow-[var(--shadow-xl)]"
        >
          {suggestions.map((s, i) => (
            <li key={s.masterProductId} id={`${uid}-opt-${i}`} role="option" aria-selected={active === i}>
              <a
                href={s.href}
                onMouseEnter={() => setActive(i)}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  router.push(s.href);
                }}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] p-2',
                  active === i ? 'bg-[var(--color-bg-surface)]' : 'hover:bg-[var(--color-bg-surface)]'
                )}
              >
                <ProductThumb
                  src={s.imageUrl}
                  alt=""
                  fallbackLabel={PLATFORM_SHORT[s.platform] || 'Jogo'}
                  dimension={s.productType}
                  className="w-11"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-[var(--color-text-primary)]">{s.title}</span>
                  <span className="block truncate text-[13px] text-[var(--color-text-tertiary)]">
                    {s.platformLabel}
                    {s.storeCount > 1 ? ` · ${s.storeCount} lojas` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] text-[var(--color-text-tertiary)]">a partir de</span>
                  <span className="block text-[15px] font-bold tabular-nums text-[var(--color-text-primary)]">
                    {formatBRL(s.lowestPriceCents)}
                  </span>
                </span>
              </a>
            </li>
          ))}
          {noResults && (
            <li role="presentation" className="px-3 py-3 text-[14px] text-[var(--color-text-secondary)]">
              Nenhum produto encontrado para &quot;{trimmed}&quot;.
            </li>
          )}
          <li id={`${uid}-opt-${suggestions.length}`} role="option" aria-selected={active === suggestions.length}>
            <button
              type="button"
              onMouseEnter={() => setActive(suggestions.length)}
              onClick={goSearch}
              className={cn(
                'flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-md)] px-3 text-left text-[14px] font-semibold text-[var(--color-accent-primary)]',
                active === suggestions.length ? 'bg-[var(--color-bg-surface)]' : 'hover:bg-[var(--color-bg-surface)]'
              )}
            >
              <Search className="size-4" aria-hidden />
              Ver todos os resultados para &quot;{trimmed}&quot;
            </button>
          </li>
        </ul>
      )}
      <div className="sr-only" aria-live="polite">
        {showPanel && !loading && searchedFor === trimmed ? `${suggestions.length} sugestões de produtos` : ''}
      </div>
    </div>
  );
}

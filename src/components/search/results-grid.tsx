'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, TrendingDown, History, Flame, Minus, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { SearchProduct, SearchInsights } from '@/server/queries/search-products';
import type { InsightsApiResponse } from '@/app/api/search/insights/route';
import { ProductThumb } from '@/components/search/product-thumb';
import { PLATFORM_SHORT } from '@/components/search/platform-short';

type InsightsState = 'loading' | 'done' | 'failed';

/**
 * Grade de resultados. Renderiza já com preço/loja (dados do servidor) e
 * preenche os selos de decisão depois, buscando /api/search/insights em lote
 * (estatística lenta em produto muito cotado). Skeleton nos selos enquanto
 * carrega; se falhar, a grade segue sem selos (nada estimado).
 */
export function ResultsGrid({ items }: { items: SearchProduct[] }) {
  const [insights, setInsights] = useState<Record<string, SearchInsights>>(() => {
    const init: Record<string, SearchInsights> = {};
    for (const i of items) if (i.insights) init[i.masterProductId] = i.insights;
    return init;
  });
  const missing = items.filter((i) => !i.insights).map((i) => i.masterProductId);
  const missingKey = missing.join(',');
  const [state, setState] = useState<InsightsState>(missing.length ? 'loading' : 'done');

  useEffect(() => {
    if (!missingKey) {
      setState('done');
      return;
    }
    const ctrl = new AbortController();
    setState('loading');
    fetch(`/api/search/insights?ids=${missingKey}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json() as Promise<InsightsApiResponse>;
      })
      .then((json) => {
        setInsights((prev) => ({ ...prev, ...json.insights }));
        setState('done');
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setState('failed');
      });
    return () => ctrl.abort();
  }, [missingKey]);

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.masterProductId} className="min-w-0">
          <ResultCard
            item={item}
            insights={insights[item.masterProductId] ?? null}
            loadingInsights={state === 'loading' && !insights[item.masterProductId]}
          />
        </li>
      ))}
    </ul>
  );
}

function Seal({
  tone,
  icon,
  children,
}: {
  tone: 'gold' | 'good' | 'bad' | 'neutral';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2 py-0.5 text-[12px] font-semibold leading-5',
        tone === 'gold' &&
          'border-[var(--color-accent-primary)]/50 bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)]',
        tone === 'good' && 'border-[var(--color-accent-success)]/40 bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)]',
        tone === 'bad' && 'border-[var(--color-accent-danger)]/40 bg-[var(--color-accent-danger)]/10 text-[var(--color-accent-danger)]',
        tone === 'neutral' && 'border-[var(--color-border-strong)] bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)]'
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Selos só com dado: nenhum estimado. Escopo = produto (todas as lojas). */
function InsightSeals({ insights, loading }: { insights: SearchInsights | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-1.5" aria-hidden>
        <span className="skeleton h-6 w-28 rounded-[var(--radius-full)]" />
        <span className="skeleton h-6 w-20 rounded-[var(--radius-full)]" />
      </div>
    );
  }
  if (!insights) return null;
  if (!insights.eligible) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Seal tone="neutral" icon={<History className="size-3" aria-hidden />}>
          Histórico curto
        </Seal>
      </div>
    );
  }
  const delta = insights.verdictDeltaPercent;
  return (
    <div className="flex flex-wrap gap-1.5">
      {insights.lowestEverBadge && (
        <Seal tone="gold" icon={<Flame className="size-3" aria-hidden />}>
          Menor preço já registrado
        </Seal>
      )}
      {insights.verdict === 'below' && (
        <Seal tone="good" icon={<TrendingDown className="size-3" aria-hidden />}>
          Abaixo da média{delta != null ? ` (${Math.abs(delta).toFixed(0)}%)` : ''}
        </Seal>
      )}
      {insights.verdict === 'inline' && (
        <Seal tone="neutral" icon={<Minus className="size-3" aria-hidden />}>
          Na média
        </Seal>
      )}
      {insights.verdict === 'above' && (
        <Seal tone="bad" icon={<TrendingUp className="size-3" aria-hidden />}>
          Acima da média{delta != null ? ` (+${Math.abs(delta).toFixed(0)}%)` : ''}
        </Seal>
      )}
      {insights.priceDrop && (
        <Seal tone="good" icon={<TrendingDown className="size-3" aria-hidden />}>
          Em queda -{insights.priceDrop.percent.toFixed(0)}%
        </Seal>
      )}
    </div>
  );
}

export function ExitButton({
  offerSlug,
  outboundUrl,
  className,
  size = 'md',
}: {
  offerSlug: string;
  outboundUrl: string | null;
  className?: string;
  size?: 'sm' | 'md';
}) {
  if (!outboundUrl) return null;
  return (
    <a
      href={`/go/${offerSlug}`}
      target="_blank"
      rel="noopener noreferrer nofollow sponsored"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent-primary)] font-semibold text-[var(--color-text-inverse)] transition-colors',
        'hover:bg-[var(--color-accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)]',
        size === 'md' ? 'min-h-11 px-4 text-[15px]' : 'min-h-11 px-3 text-[14px]',
        className
      )}
    >
      Ir à loja
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function ResultCard({
  item,
  insights,
  loadingInsights,
}: {
  item: SearchProduct;
  insights: SearchInsights | null;
  loadingInsights: boolean;
}) {
  const [open, setOpen] = useState(false);
  const best = item.stores[0];
  const multi = item.storeCount > 1;
  const panelId = `lojas-${item.masterProductId}`;
  const avg = insights?.eligible ? insights.avgPriceCents : null;

  return (
    <article className="flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 transition-colors hover:border-[var(--color-border-strong)] sm:p-4">
      <div className="flex gap-3">
        <Link href={item.href} aria-hidden tabIndex={-1} className="shrink-0">
          <ProductThumb
            src={item.imageUrl}
            alt=""
            fallbackLabel={PLATFORM_SHORT[item.platform] || item.legacyPlatformLabel || 'Produto'}
            dimension={item.productType}
            bundle={item.isBundle}
            className="w-24 sm:w-28"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            {item.platform !== 'unknown' ? item.platformLabel : (item.legacyPlatformLabel ?? 'Produto')}
          </span>
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug text-[var(--color-text-primary)]">
            <Link href={item.href} className="hover:text-[var(--color-accent-primary)] focus-visible:underline">
              {item.title}
            </Link>
          </h3>
          <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[12px] text-[var(--color-text-tertiary)]">a partir de</span>
            <span className="text-[22px] font-bold leading-none tabular-nums text-[var(--color-text-primary)]">
              {formatBRL(item.lowestPriceCents)}
            </span>
          </p>
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            {item.lowestStoreName}
            {multi ? ` · ${item.storeCount} lojas` : ''}
          </p>
        </div>
      </div>

      <div className="min-h-6">
        <InsightSeals insights={insights} loading={loadingInsights} />
      </div>
      {avg != null && (
        <p className="-mt-1 text-[12px] text-[var(--color-text-tertiary)]">
          Média do produto em todas as lojas: {formatBRL(avg)}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {best && <ExitButton offerSlug={best.offerSlug} outboundUrl={best.outboundUrl} className="flex-1 sm:flex-none" />}
        {multi ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] px-3 text-[14px] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
          >
            Comparar {item.storeCount} lojas
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        ) : (
          <Link
            href={item.href}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-[14px] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
          >
            Ver histórico
          </Link>
        )}
      </div>

      {multi && open && (
        <div id={panelId} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
          <table className="w-full text-left text-[14px]">
            <caption className="sr-only">Menor preço por loja, da mais barata para a mais cara</caption>
            <thead className="bg-[var(--color-bg-inset)] text-[12px] text-[var(--color-text-tertiary)]">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Loja</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Menor preço</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {item.stores.map((s, i) => (
                <tr key={s.networkId} className="border-t border-[var(--color-border-subtle)]">
                  <td className="px-3 py-2 text-[var(--color-text-primary)]">
                    {s.storeName}
                    {i === 0 && (
                      <span className="ml-2 rounded-[var(--radius-full)] bg-[var(--color-accent-primary-muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-accent-primary)]">
                        Menor preço
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {formatBRL(s.lowestPriceCents)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <ExitButton offerSlug={s.offerSlug} outboundUrl={s.outboundUrl} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

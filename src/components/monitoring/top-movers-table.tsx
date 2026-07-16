import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { TopMoverItem, MoverPeriod, MoverDirection } from '@/server/queries/price-history';

const PERIOD_OPTIONS: { value: MoverPeriod; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

function buildHref(period: MoverPeriod, direction: MoverDirection) {
  const params = new URLSearchParams();
  params.set('periodo', period);
  params.set('direcao', direction);
  return `?${params.toString()}`;
}

/**
 * Ranking de maiores altas/baixas, estilo "gainers & losers" de tela de
 * bolsa. Server Component puro — período/direção trocam via <Link> +
 * searchParams, mesmo padrão de OfferFilters (sem estado client aqui).
 */
export function TopMoversTable({
  items,
  period,
  direction,
}: {
  items: TopMoverItem[];
  period: MoverPeriod;
  direction: MoverDirection;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1">
          <Link
            href={buildHref(period, 'down')}
            className={cn(
              'rounded-[var(--radius-sm)] px-3 py-1.5 text-body-sm font-medium transition-colors',
              direction === 'down'
                ? 'bg-[var(--color-accent-success)]/15 text-[var(--color-accent-success)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            )}
          >
            Maiores quedas
          </Link>
          <Link
            href={buildHref(period, 'up')}
            className={cn(
              'rounded-[var(--radius-sm)] px-3 py-1.5 text-body-sm font-medium transition-colors',
              direction === 'up'
                ? 'bg-[var(--color-accent-danger)]/15 text-[var(--color-accent-danger)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            )}
          >
            Maiores altas
          </Link>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildHref(opt.value, direction)}
              className={cn(
                'rounded-[var(--radius-sm)] px-3 py-1.5 text-body-sm font-medium transition-colors',
                period === opt.value
                  ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Text variant="body-sm" color="tertiary">
              Ainda não há dado suficiente pra esse período. Tente 24h ou volte mais tarde.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
          {items.map((item, i) => {
            const isUp = item.changePercent > 0;
            const Icon = isUp ? TrendingUp : TrendingDown;
            return (
              <Link
                key={item.masterProductId}
                href={`/monitoramento/comparar/${item.masterProductId}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--color-bg-surface)]"
              >
                <Text variant="mono-sm" color="tertiary" className="w-6 shrink-0 tabular">
                  {i + 1}
                </Text>
                <div className="min-w-0 flex-1">
                  <Text variant="body-sm" className="truncate font-medium">
                    {item.title}
                  </Text>
                  <Badge variant="outline" size="sm" className="mt-1">
                    Menor em {item.networkName}
                  </Badge>
                </div>
                <Text variant="mono-md" color="primary" className="shrink-0 tabular">
                  {formatBRL(item.currentPriceCents)}
                </Text>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 text-body-sm font-semibold tabular',
                    // Preço de compra: queda é boa notícia (verde), alta é ruim (vermelho).
                    isUp ? 'text-[var(--color-accent-danger)]' : 'text-[var(--color-accent-success)]'
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {isUp ? '+' : ''}
                  {item.changePercent}%
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

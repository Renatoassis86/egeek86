'use client';

import { cn } from '@/lib/cn';
import type { PriceHistoryTimeframe } from '@/server/queries/price-history';

const OPTIONS: PriceHistoryTimeframe[] = ['1D', '1S', '1M', '3M', '6M', '1A', 'Tudo'];

export function TimeframeSelector({
  value,
  onChange,
}: {
  value: PriceHistoryTimeframe;
  onChange: (tf: PriceHistoryTimeframe) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-[var(--radius-sm)] px-2.5 py-1 text-caption font-medium transition-colors',
            value === opt
              ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

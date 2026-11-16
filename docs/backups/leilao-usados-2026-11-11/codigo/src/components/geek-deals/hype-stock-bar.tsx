'use client';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

interface HypeStockBarProps {
  stockLimit: number;
  stockSold: number;
  className?: string;
}

export function HypeStockBar({ stockLimit, stockSold, className }: HypeStockBarProps) {
  const stockAvailable = Math.max(0, stockLimit - stockSold);
  const percentageSold = Math.min(100, (stockSold / stockLimit) * 100);
  const percentageAvailable = 100 - percentageSold;

  const isLowStock = stockAvailable <= 3 || percentageAvailable <= 20;
  const isSoldOut = stockAvailable === 0;

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      <div className="flex items-center justify-between text-caption font-medium">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'size-1.5 rounded-full',
            isSoldOut 
              ? 'bg-[var(--color-text-tertiary)]' 
              : isLowStock 
                ? 'bg-[var(--color-accent-hype)] animate-ping' 
                : 'bg-[var(--color-accent-success)]'
          )} />
          <Text variant="caption" color="secondary" className="font-semibold">
            {isSoldOut 
              ? 'Esgotado' 
              : isLowStock 
                ? `Estoque Crítico: restam ${stockAvailable} unidade${stockAvailable > 1 ? 's' : ''}!`
                : `Estoque: ${stockAvailable} disponível${stockAvailable > 1 ? 's' : ''}`
            }
          </Text>
        </div>
        <Text variant="caption" color="tertiary" className="font-mono">
          {stockSold} / {stockLimit} vendidos ({Math.round(percentageSold)}%)
        </Text>
      </div>

      {/* Container da barra */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-[var(--duration-slow)] ease-out',
            isSoldOut
              ? 'bg-[var(--color-text-tertiary)]'
              : isLowStock
                ? 'bg-gradient-to-r from-[var(--color-accent-hype)] to-[var(--color-accent-danger)] shadow-[0_0_8px_rgba(232,114,28,0.5)] animate-pulse'
                : 'bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)]'
          )}
          style={{ width: `${percentageSold}%` }}
        />
      </div>
    </div>
  );
}

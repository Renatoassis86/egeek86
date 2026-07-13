import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const skeletonVariants = cva('skeleton', {
  variants: {
    variant: {
      rect: 'rounded-[var(--radius-md)]',
      text: 'rounded-[var(--radius-xs)] h-3.5',
      circle: 'rounded-full',
      pill: 'rounded-[var(--radius-full)]',
    },
  },
  defaultVariants: { variant: 'rect' },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  width?: string | number;
  height?: string | number;
  /** Para variant="text", número de linhas. */
  lines?: number;
}

export function Skeleton({
  className,
  variant,
  width,
  height,
  lines,
  style,
  ...props
}: SkeletonProps) {
  if (variant === 'text' && lines && lines > 1) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-busy="true" aria-live="polite">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(skeletonVariants({ variant }))}
            style={{
              width: i === lines - 1 ? '70%' : '100%',
              ...style,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(skeletonVariants({ variant }), className)}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

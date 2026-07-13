import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 rounded-[var(--radius-full)]',
    'px-2.5 py-0.5 text-caption font-medium',
    'border whitespace-nowrap',
    'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
  ],
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border-default)]',
        primary: 'bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)] border-transparent',
        hype: 'bg-[var(--color-accent-hype-muted)] text-[var(--color-accent-hype)] border-transparent',
        success: 'bg-[rgb(16_185_129_/_0.12)] text-[var(--color-accent-success)] border-transparent',
        danger: 'bg-[rgb(239_68_68_/_0.12)] text-[var(--color-accent-danger)] border-transparent',
        info: 'bg-[rgb(59_130_246_/_0.12)] text-[var(--color-accent-info)] border-transparent',
        legend: 'border-transparent text-rank-legend bg-[var(--color-bg-elevated)]',
        outline: 'bg-transparent text-[var(--color-text-primary)] border-[var(--color-border-strong)]',
        solid: 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)] border-transparent',
      },
      size: {
        sm: 'px-2 py-0 text-[11px]',
        md: 'px-2.5 py-0.5 text-caption',
        lg: 'px-3 py-1 text-label',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const cardVariants = cva(
  [
    'rounded-[var(--radius-md)] bg-[var(--color-bg-surface)]',
    'border border-[var(--color-border-subtle)]',
    'shadow-[var(--shadow-sm)]',
    'transition-all duration-[var(--duration-base)] ease-[var(--ease-out)]',
  ],
  {
    variants: {
      variant: {
        default: '',
        elevated: 'bg-[var(--color-bg-elevated)] shadow-[var(--shadow-md)]',
        ghost: 'bg-transparent border-transparent shadow-none',
        outline: 'bg-transparent',
      },
      interactive: {
        true: 'cursor-pointer hover:border-[var(--color-border-default)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, interactive }), className)} {...props} />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-heading-md text-[var(--color-text-primary)]', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-body-sm text-[var(--color-text-secondary)]', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center justify-between gap-3 p-5 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

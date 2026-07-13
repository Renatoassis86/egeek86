'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const inputVariants = cva(
  [
    'flex w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)]',
    'border border-[var(--color-border-default)]',
    'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]',
    'transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
    'focus-visible:outline-none focus-visible:border-[var(--color-border-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary-muted)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
  ],
  {
    variants: {
      size: {
        sm: 'h-9 px-3 text-[14px]',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-13 px-4 text-[16px] min-h-touch',
      },
      invalid: {
        true: 'border-[var(--color-accent-danger)] focus-visible:border-[var(--color-accent-danger)] focus-visible:ring-[rgb(239_68_68_/_0.15)]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, invalid, leftAddon, rightAddon, type = 'text', ...props }, ref) => {
    if (leftAddon || rightAddon) {
      return (
        <div className={cn('relative flex items-center', className)}>
          {leftAddon && (
            <div className="absolute left-3 flex items-center text-[var(--color-text-tertiary)] pointer-events-none [&_svg]:size-[18px]">
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              inputVariants({ size, invalid }),
              leftAddon && 'pl-10',
              rightAddon && 'pr-10'
            )}
            aria-invalid={invalid || undefined}
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3 flex items-center text-[var(--color-text-tertiary)] [&_svg]:size-[18px]">
              {rightAddon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        className={cn(inputVariants({ size, invalid }), className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

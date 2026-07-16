'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] px-4 py-3 text-[15px]',
        'border border-[var(--color-border-default)]',
        'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]',
        'transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        'focus-visible:outline-none focus-visible:border-[var(--color-border-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary-muted)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        invalid && 'border-[var(--color-accent-danger)] focus-visible:border-[var(--color-accent-danger)] focus-visible:ring-[rgb(239_68_68_/_0.15)]',
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

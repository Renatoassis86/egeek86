'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap font-medium select-none',
    'transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)]',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.97]',
    '[&_svg]:shrink-0 [&_svg]:size-[1.1em]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]',
          'hover:bg-[var(--color-accent-primary-hover)]',
          'shadow-[var(--shadow-glow-primary)]',
        ],
        secondary: [
          'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]',
          'border border-[var(--color-border-default)]',
          'hover:bg-[var(--color-bg-surface)] hover:border-[var(--color-border-strong)]',
        ],
        ghost: [
          'bg-transparent text-[var(--color-text-primary)]',
          'hover:bg-[var(--color-bg-surface)]',
        ],
        outline: [
          'bg-transparent text-[var(--color-text-primary)]',
          'border border-[var(--color-border-strong)]',
          'hover:bg-[var(--color-bg-surface)]',
        ],
        danger: [
          'bg-[var(--color-accent-danger)] text-white',
          'hover:opacity-90',
        ],
        hype: [
          'bg-[var(--color-accent-hype)] text-[var(--color-text-inverse)]',
          'hover:bg-[var(--color-accent-hype-hover)]',
          'shadow-[var(--shadow-glow-hype)]',
        ],
        link: [
          'bg-transparent text-[var(--color-accent-primary)] underline-offset-4',
          'hover:underline px-0 h-auto',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-[14px] rounded-[var(--radius-sm)]',
        md: 'h-11 px-5 text-[15px] rounded-[var(--radius-sm)]',
        lg: 'h-13 px-6 text-[16px] rounded-[var(--radius-md)] min-h-touch',
        xl: 'h-14 px-8 text-[17px] rounded-[var(--radius-md)] min-h-touch',
        icon: 'size-11 rounded-[var(--radius-sm)] min-touch',
        'icon-sm': 'size-9 rounded-[var(--radius-sm)]',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, fullWidth, asChild, loading, disabled, leftIcon, rightIcon, children, ...props },
    ref
  ) => {
    if (asChild) {
      // Slot (Radix) requires exactly one React element child, so icons/loading
      // are injected into a clone of the caller's child instead of interleaved
      // as siblings (which would make Slot see an array and throw).
      const child = children as React.ReactElement<{ children?: React.ReactNode }>;
      const content = (
        <>
          {loading ? <Loader2 className="animate-spin" /> : leftIcon}
          {React.isValidElement(child) ? child.props.children : child}
          {!loading && rightIcon}
        </>
      );
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size, fullWidth }), className)}
          aria-disabled={disabled || loading || undefined}
          {...props}
        >
          {React.isValidElement(child) ? React.cloneElement(child, undefined, content) : children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };

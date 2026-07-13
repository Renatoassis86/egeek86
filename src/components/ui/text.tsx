import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const textVariants = cva('', {
  variants: {
    variant: {
      'display-2xl': 'text-display-2xl',
      'display-xl': 'text-display-xl',
      'display-lg': 'text-display-lg',
      'display-md': 'text-display-md',
      'heading-xl': 'text-heading-xl',
      'heading-lg': 'text-heading-lg',
      'heading-md': 'text-heading-md',
      'heading-sm': 'text-heading-sm',
      'body-lg': 'text-body-lg',
      'body-md': 'text-body-md',
      'body-sm': 'text-body-sm',
      label: 'text-label uppercase',
      caption: 'text-caption',
      'mono-lg': 'text-mono-lg font-mono tabular',
      'mono-md': 'text-mono-md font-mono tabular',
      'mono-sm': 'text-mono-sm font-mono tabular',
    },
    color: {
      primary: 'text-[var(--color-text-primary)]',
      secondary: 'text-[var(--color-text-secondary)]',
      tertiary: 'text-[var(--color-text-tertiary)]',
      inverse: 'text-[var(--color-text-inverse)]',
      accent: 'text-[var(--color-accent-primary)]',
      hype: 'text-[var(--color-accent-hype)]',
      success: 'text-[var(--color-accent-success)]',
      danger: 'text-[var(--color-accent-danger)]',
    },
  },
  defaultVariants: {
    variant: 'body-md',
    color: 'primary',
  },
});

type TextElement =
  | 'p'
  | 'span'
  | 'div'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'strong'
  | 'em'
  | 'small';

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'color'>,
    VariantProps<typeof textVariants> {
  as?: TextElement;
}

export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as: Tag = 'p', variant, color, className, ...props }, ref) => {
    const Component = Tag as React.ElementType;
    return (
      <Component
        ref={ref}
        className={cn(textVariants({ variant, color }), className)}
        {...props}
      />
    );
  }
);
Text.displayName = 'Text';

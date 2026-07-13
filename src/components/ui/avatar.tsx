'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden rounded-[var(--radius-full)]',
  {
    variants: {
      size: {
        xs: 'size-6 text-[10px]',
        sm: 'size-8 text-[11px]',
        md: 'size-10 text-[13px]',
        lg: 'size-14 text-[16px]',
        xl: 'size-20 text-[20px]',
        '2xl': 'size-28 text-[24px]',
      },
      rank: {
        iniciante: 'ring-2 ring-[var(--color-rank-iniciante)] ring-offset-2 ring-offset-[var(--color-bg-canvas)]',
        otaku: 'ring-2 ring-[var(--color-rank-otaku)] ring-offset-2 ring-offset-[var(--color-bg-canvas)]',
        colecionador: 'ring-2 ring-[var(--color-rank-colecionador)] ring-offset-2 ring-offset-[var(--color-bg-canvas)]',
        hunter: 'ring-2 ring-[var(--color-rank-hunter)] ring-offset-2 ring-offset-[var(--color-bg-canvas)] shadow-[var(--shadow-glow-hype)]',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, size, rank, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(avatarVariants({ size, rank }), className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

'use client';

import * as React from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { cn } from '@/lib/cn';

/**
 * Drawer (bottom sheet) baseado em Vaul.
 * Para mobile/touch — drag-to-dismiss + snap points.
 *
 * Para responsive (mobile drawer / desktop dialog), use <ResponsiveDialog> (futuro).
 */

export const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Root>) => (
  <VaulDrawer.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = 'Drawer';

export const DrawerTrigger = VaulDrawer.Trigger;
export const DrawerPortal = VaulDrawer.Portal;
export const DrawerClose = VaulDrawer.Close;

export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-40 bg-[var(--color-bg-overlay)] backdrop-blur-sm', className)}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <VaulDrawer.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col',
        'rounded-t-[var(--radius-xl)] border-t border-[var(--color-border-default)]',
        'bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]',
        'pb-safe',
        className
      )}
      {...props}
    >
      <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[var(--color-border-strong)]" />
      {children}
    </VaulDrawer.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

export const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1.5 p-5 text-left', className)} {...props} />
);

export const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-5', className)} {...props} />
);

export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Title>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Title
    ref={ref}
    className={cn('text-heading-md text-[var(--color-text-primary)]', className)}
    {...props}
  />
));
DrawerTitle.displayName = 'DrawerTitle';

export const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Description>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Description
    ref={ref}
    className={cn('text-body-sm text-[var(--color-text-secondary)]', className)}
    {...props}
  />
));
DrawerDescription.displayName = 'DrawerDescription';

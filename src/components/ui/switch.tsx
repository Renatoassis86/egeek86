'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

/**
 * Toggle estilizado sobre @radix-ui/react-switch — mesmo padrão de tokens de
 * select.tsx/dialog.tsx. Usado nas preferências de canal de notificação.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-10 shrink-0 items-center rounded-[var(--radius-full)]',
      'border border-transparent transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-[var(--color-accent-primary)] data-[state=unchecked]:bg-[var(--color-bg-inset)]',
      'data-[state=unchecked]:border-[var(--color-border-default)]',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-5 rounded-full bg-white shadow-[var(--shadow-sm)] ring-0',
        'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5'
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

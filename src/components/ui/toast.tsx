'use client';

import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

/**
 * Toaster — montado uma vez no root layout.
 * Use `toast.success(...)`, `toast.error(...)`, etc.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      theme="dark"
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'group !bg-[var(--color-bg-elevated)] !border-[var(--color-border-default)] !text-[var(--color-text-primary)] !rounded-[var(--radius-md)] !shadow-[var(--shadow-lg)]',
          description: '!text-[var(--color-text-secondary)]',
          actionButton:
            '!bg-[var(--color-accent-primary)] !text-[var(--color-text-inverse)]',
          cancelButton:
            '!bg-[var(--color-bg-surface)] !text-[var(--color-text-primary)]',
        },
      }}
    />
  );
}

export const toast = sonnerToast;

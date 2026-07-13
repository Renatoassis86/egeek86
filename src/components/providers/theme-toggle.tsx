'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/lib/stores/theme-store';
import { cn } from '@/lib/cn';

interface ThemeToggleProps {
  className?: string;
}

/**
 * Toggle visual de tema. Cicla dark → light → auto → dark.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark';
  const label =
    theme === 'dark'
      ? 'Tema claro'
      : theme === 'light'
        ? 'Tema automático'
        : 'Tema escuro';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={cn('text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]', className)}
    >
      {theme === 'dark' && <Moon className="size-5" />}
      {theme === 'light' && <Sun className="size-5" />}
      {theme === 'auto' && <Monitor className="size-5" />}
    </Button>
  );
}

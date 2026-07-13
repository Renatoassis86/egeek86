'use client';

import { useEffect } from 'react';
import { useThemeStore, type Theme, type ResolvedTheme } from '@/lib/stores/theme-store';

interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme: Theme;
  initialResolvedTheme: ResolvedTheme;
}

/**
 * ThemeProvider — sincroniza tema entre SSR (cookie) e client (matchMedia).
 *
 * Fluxo:
 * 1. Root layout lê cookie `theme` no servidor e injeta `data-theme` no <html>
 * 2. Este provider hidrata o Zustand store
 * 3. Listener de `prefers-color-scheme` re-resolve quando theme === 'auto'
 */
export function ThemeProvider({ children, initialTheme, initialResolvedTheme }: ThemeProviderProps) {
  useEffect(() => {
    useThemeStore.getState()._hydrate(initialTheme, initialResolvedTheme);

    if (initialTheme !== 'auto') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => useThemeStore.getState().setTheme('auto');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [initialTheme, initialResolvedTheme]);

  return <>{children}</>;
}

'use client';

import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'auto';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  _hydrate: (theme: Theme, resolved: ResolvedTheme) => void;
}

/**
 * Theme store — fonte de verdade client-side.
 * Hidratado via cookie no root layout (SSR-safe, zero FOUC).
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: (theme) => {
    const resolved: ResolvedTheme =
      theme === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;

    document.documentElement.dataset.theme = resolved;
    document.cookie = `theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    set({ theme, resolvedTheme: resolved });
  },
  _hydrate: (theme, resolved) => set({ theme, resolvedTheme: resolved }),
}));

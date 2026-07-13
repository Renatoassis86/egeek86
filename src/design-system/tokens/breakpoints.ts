/**
 * Breakpoints — mobile-first.
 * Compatíveis com defaults do Tailwind 4 (que herdamos).
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** Helpers para media queries em JS (hooks, matchMedia). */
export const mediaQuery = {
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
  xl: `(min-width: ${breakpoints.xl}px)`,
  '2xl': `(min-width: ${breakpoints['2xl']}px)`,
  mobile: `(max-width: ${breakpoints.md - 1}px)`,
  tabletPortrait: `(min-width: ${breakpoints.sm}px) and (max-width: ${breakpoints.lg - 1}px)`,
  desktop: `(min-width: ${breakpoints.lg}px)`,
  reduceMotion: '(prefers-reduced-motion: reduce)',
  dark: '(prefers-color-scheme: dark)',
  light: '(prefers-color-scheme: light)',
  saveData: '(prefers-reduced-data: reduce)',
} as const;

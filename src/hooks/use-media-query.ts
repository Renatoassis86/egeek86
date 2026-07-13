'use client';

import { useEffect, useState } from 'react';
import { mediaQuery } from '@/design-system/tokens/breakpoints';

/**
 * Hook genérico para matchMedia com hidratação segura.
 *
 * @example
 * const isDesktop = useMediaQuery(mediaQuery.desktop);
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export const useIsMobile = () => useMediaQuery(mediaQuery.mobile);
export const useIsDesktop = () => useMediaQuery(mediaQuery.desktop);
export const usePrefersReducedMotion = () => useMediaQuery(mediaQuery.reduceMotion);
export const useSaveData = () => useMediaQuery(mediaQuery.saveData);

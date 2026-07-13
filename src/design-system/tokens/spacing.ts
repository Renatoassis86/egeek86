/**
 * Spacing tokens — múltiplos de 4px.
 * Use SEMPRE tokens; nunca pixel arbitrário.
 */
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
} as const;

/** Touch target mínimo (WCAG + iOS HIG). */
export const touchTarget = '44px';

/** Alturas de elementos persistentes do shell. */
export const shellHeights = {
  headerMobile: '56px',
  headerDesktop: '72px',
  bottomTabBar: '64px',
} as const;

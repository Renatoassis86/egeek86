/**
 * Shadow tokens.
 * Em dark theme, sombras precisam ter mais opacidade + leve cor escura saturada.
 */
export const shadows = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.40)',
  md: '0 4px 12px rgb(0 0 0 / 0.45)',
  lg: '0 12px 32px rgb(0 0 0 / 0.55)',
  xl: '0 24px 56px rgb(0 0 0 / 0.65)',
  card: '0 4px 12px rgb(0 0 0 / 0.40)',
  cardHover: '0 12px 28px rgb(0 0 0 / 0.55)',
  glowPrimary: '0 0 24px rgb(168 85 247 / 0.35)',
  glowHype: '0 0 24px rgb(245 158 11 / 0.35)',
  glowSuccess: '0 0 20px rgb(16 185 129 / 0.30)',
  glowDanger: '0 0 20px rgb(239 68 68 / 0.30)',
  insetBorder: 'inset 0 0 0 1px rgb(255 255 255 / 0.04)',
} as const;

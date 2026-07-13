export const radii = {
  none: '0',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  full: '9999px',
} as const;

/** Aliases semânticos por uso. */
export const radiiSemantic = {
  card: radii.md,
  button: radii.sm,
  input: radii.sm,
  pill: radii.full,
  modal: radii.lg,
  badge: radii.full,
} as const;

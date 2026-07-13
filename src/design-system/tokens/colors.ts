/**
 * Color tokens — primitivos e semânticos.
 * Os primitivos são valores brutos; os semânticos são o que componentes usam.
 * Mudar tema = trocar semânticos. Mudar paleta = trocar primitivos.
 */

export const colorPrimitives = {
  zinc: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#0A0A0F',
  },
  violet: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7',
    600: '#9333EA',
    700: '#7E22CE',
    800: '#6B21A8',
    900: '#581C87',
  },
  amber: {
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
  },
  emerald: {
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
  },
  red: {
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
  },
  blue: {
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
  },
} as const;

export type ColorPrimitives = typeof colorPrimitives;

/**
 * Dark theme — padrão e principal.
 */
export const darkSemanticColors = {
  bg: {
    canvas: '#0A0A0F',
    surface: '#13131A',
    elevated: '#1C1C26',
    inset: '#08080C',
    overlay: 'rgba(10, 10, 15, 0.72)',
  },
  text: {
    primary: '#F5F5F7',
    secondary: '#A1A1AA',
    tertiary: '#71717A',
    inverse: '#0A0A0F',
    disabled: '#52525B',
  },
  border: {
    subtle: '#1F1F28',
    default: '#26262F',
    strong: '#3A3A47',
    focus: colorPrimitives.violet[500],
  },
  accent: {
    primary: colorPrimitives.violet[500],
    primaryHover: colorPrimitives.violet[600],
    primaryMuted: 'rgba(168, 85, 247, 0.12)',
    hype: colorPrimitives.amber[500],
    hypeHover: colorPrimitives.amber[600],
    hypeMuted: 'rgba(245, 158, 11, 0.12)',
    success: colorPrimitives.emerald[500],
    danger: colorPrimitives.red[500],
    info: colorPrimitives.blue[500],
  },
  rank: {
    iniciante: colorPrimitives.zinc[500],
    otaku: colorPrimitives.blue[500],
    colecionador: colorPrimitives.violet[500],
    hunter: colorPrimitives.amber[500],
    // legend = gradient definido em CSS
  },
} as const;

/**
 * Light theme — opt-in.
 */
export const lightSemanticColors = {
  bg: {
    canvas: '#FAFAFA',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    inset: '#F4F4F5',
    overlay: 'rgba(0, 0, 0, 0.4)',
  },
  text: {
    primary: '#0A0A0F',
    secondary: '#52525B',
    tertiary: '#71717A',
    inverse: '#FFFFFF',
    disabled: '#A1A1AA',
  },
  border: {
    subtle: '#F4F4F5',
    default: '#E4E4E7',
    strong: '#D4D4D8',
    focus: colorPrimitives.violet[600],
  },
  accent: {
    primary: colorPrimitives.violet[600],
    primaryHover: colorPrimitives.violet[700],
    primaryMuted: 'rgba(147, 51, 234, 0.08)',
    hype: colorPrimitives.amber[600],
    hypeHover: colorPrimitives.amber[500],
    hypeMuted: 'rgba(217, 119, 6, 0.08)',
    success: colorPrimitives.emerald[600],
    danger: colorPrimitives.red[600],
    info: colorPrimitives.blue[600],
  },
  rank: {
    iniciante: colorPrimitives.zinc[500],
    otaku: colorPrimitives.blue[600],
    colecionador: colorPrimitives.violet[600],
    hunter: colorPrimitives.amber[600],
  },
} as const;

export type SemanticColors = typeof darkSemanticColors;

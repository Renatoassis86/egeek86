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
    canvas: '#0B0908',
    surface: '#161311',
    elevated: '#201C18',
    inset: '#060504',
    overlay: 'rgba(6, 5, 4, 0.72)',
  },
  text: {
    primary: '#F2E9D8',
    secondary: '#B8AD98',
    tertiary: '#8A8072',
    inverse: '#0B0908',
    disabled: '#5C5347',
  },
  border: {
    subtle: '#221E19',
    default: '#2C2620',
    strong: '#453C31',
    focus: '#D4AF37',
  },
  accent: {
    primary: '#D4AF37',
    primaryHover: '#C29A2E',
    primaryMuted: 'rgba(212, 175, 55, 0.14)',
    hype: '#E8721C',
    hypeHover: '#C75F13',
    hypeMuted: 'rgba(232, 114, 28, 0.14)',
    success: '#10B981',
    danger: '#EF4444',
    info: '#3B82F6',
  },
  rank: {
    iniciante: '#71717A',
    otaku: '#3B82F6',
    colecionador: '#A855F7',
    hunter: '#F59E0B',
  },
} as const;

/**
 * Light theme — opt-in.
 */
export const lightSemanticColors = {
  bg: {
    canvas: '#FAF7F0',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    inset: '#F1ECE0',
    overlay: 'rgba(0, 0, 0, 0.40)',
  },
  text: {
    primary: '#1A1611',
    secondary: '#5C5347',
    tertiary: '#8A8072',
    inverse: '#FFFFFF',
    disabled: '#B8AD98',
  },
  border: {
    subtle: '#F1ECE0',
    default: '#E5DCC8',
    strong: '#D4C7A8',
    focus: '#B8901F',
  },
  accent: {
    primary: '#B8901F',
    primaryHover: '#9C7A1A',
    primaryMuted: 'rgba(184, 144, 31, 0.08)',
    hype: '#C75F13',
    hypeHover: '#A84E0F',
    hypeMuted: 'rgba(199, 95, 19, 0.08)',
    success: '#059669',
    danger: '#DC2626',
    info: '#2563EB',
  },
  rank: {
    iniciante: '#71717A',
    otaku: '#2563EB',
    colecionador: '#7E22CE',
    hunter: '#D97706',
  },
} as const;

export type SemanticColors = typeof darkSemanticColors;


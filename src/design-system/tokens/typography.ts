/**
 * Type scale. Cada entrada gera utilities Tailwind via @theme.
 * Família é variável CSS injetada via next/font no root layout.
 */

export const fontFamilies = {
  display: 'var(--font-display)',
  body: 'var(--font-body)',
  mono: 'var(--font-mono)',
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const typeScale = {
  'display-2xl': { size: 72, lineHeight: 76, tracking: -0.025, weight: 700 },
  'display-xl': { size: 56, lineHeight: 60, tracking: -0.022, weight: 700 },
  'display-lg': { size: 40, lineHeight: 44, tracking: -0.02, weight: 700 },
  'display-md': { size: 32, lineHeight: 36, tracking: -0.015, weight: 700 },
  'heading-xl': { size: 28, lineHeight: 34, tracking: -0.012, weight: 600 },
  'heading-lg': { size: 24, lineHeight: 30, tracking: -0.01, weight: 600 },
  'heading-md': { size: 20, lineHeight: 26, tracking: -0.005, weight: 600 },
  'heading-sm': { size: 18, lineHeight: 24, tracking: 0, weight: 600 },
  'body-lg': { size: 17, lineHeight: 26, tracking: 0, weight: 400 },
  'body-md': { size: 15, lineHeight: 22, tracking: 0, weight: 400 },
  'body-sm': { size: 14, lineHeight: 20, tracking: 0, weight: 400 },
  label: { size: 13, lineHeight: 18, tracking: 0.04, weight: 500 },
  caption: { size: 12, lineHeight: 16, tracking: 0.02, weight: 500 },
  'mono-lg': { size: 32, lineHeight: 36, tracking: -0.01, weight: 500, family: 'mono' as const },
  'mono-md': { size: 15, lineHeight: 22, tracking: 0, weight: 500, family: 'mono' as const },
  'mono-sm': { size: 13, lineHeight: 18, tracking: 0, weight: 500, family: 'mono' as const },
} as const;

export type TypeScale = keyof typeof typeScale;

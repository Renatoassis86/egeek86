/**
 * Motion tokens — durações + easings.
 * Consumidos por CSS (transition-*), Framer Motion e animações JS.
 *
 * Princípios:
 * - duração curta em microinterações (≤ 300ms)
 * - duração média em transições de layout (300-500ms)
 * - duração longa SOMENTE em celebrações deliberadas (>600ms)
 */

export const duration = {
  instant: 100,
  fast: 150,
  base: 250,
  medium: 400,
  slow: 600,
  cinematic: 800,
} as const;

/** Strings CSS (com 'ms'). */
export const durationCss = Object.fromEntries(
  Object.entries(duration).map(([k, v]) => [k, `${v}ms`])
) as Record<keyof typeof duration, string>;

/** Curvas easing (compatíveis CSS + Framer Motion como array). */
export const easing = {
  /** Suave e premium — padrão para UI. */
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Entra e sai com peso — bom para transições de página. */
  inOut: [0.83, 0, 0.17, 1] as [number, number, number, number],
  /** Acelera no início — bom para exit. */
  in: [0.7, 0, 0.84, 0] as [number, number, number, number],
  /** Linear — usar em loops contínuos. */
  linear: [0, 0, 1, 1] as [number, number, number, number],
} as const;

/** Strings CSS para `transition-timing-function`. */
export const easingCss = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.83, 0, 0.17, 1)',
  in: 'cubic-bezier(0.7, 0, 0.84, 0)',
  linear: 'linear',
} as const;

/** Spring presets prontos para Framer Motion. */
export const spring = {
  soft: { type: 'spring', stiffness: 260, damping: 30 } as const,
  bouncy: { type: 'spring', stiffness: 380, damping: 18 } as const,
  stiff: { type: 'spring', stiffness: 500, damping: 40 } as const,
} as const;

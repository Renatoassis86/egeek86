/**
 * Constantes hex espelhando o @theme de src/app/globals.css. lightweight-charts
 * pinta em canvas, não lê `var(--color-...)` diretamente — precisa do valor
 * resolvido em string. Manter manualmente em sincronia com globals.css (mesmo
 * acordo já usado pelas trincas RGB de src/components/motion/glow.tsx).
 */
export interface ChartPalette {
  background: string;
  grid: string;
  text: string;
  textMuted: string;
  line: string;
  areaTop: string;
  areaBottom: string;
  up: string;
  down: string;
  /** Linha de média móvel — precisa contrastar com o dourado da série principal. */
  movingAverage: string;
}

export const CHART_PALETTES: Record<'dark' | 'light', ChartPalette> = {
  dark: {
    background: '#0B0908',
    grid: '#221E19',
    text: '#8A8072',
    textMuted: '#5C5347',
    line: '#D4AF37',
    areaTop: 'rgba(212, 175, 55, 0.28)',
    areaBottom: 'rgba(212, 175, 55, 0.02)',
    up: '#10B981',
    down: '#EF4444',
    movingAverage: '#5B8DEF',
  },
  light: {
    background: '#FAF7F0',
    grid: '#F1ECE0',
    text: '#8A8072',
    textMuted: '#5C5347',
    line: '#B8901F',
    areaTop: 'rgba(184, 144, 31, 0.24)',
    areaBottom: 'rgba(184, 144, 31, 0.02)',
    up: '#10B981',
    down: '#EF4444',
    movingAverage: '#3B6FD6',
  },
};

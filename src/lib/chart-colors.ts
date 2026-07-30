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
  /** Linha de média móvel — precisa contrastar com o azul da série principal. */
  movingAverage: string;
}

export const CHART_PALETTES: Record<'dark' | 'light', ChartPalette> = {
  dark: {
    background: '#0B0908',
    grid: '#221E19',
    text: '#B8AD98',
    textMuted: '#8A8072',
    line: '#3B82F6',
    areaTop: 'rgba(59, 130, 246, 0.28)',
    areaBottom: 'rgba(59, 130, 246, 0.02)',
    up: '#10B981',
    down: '#EF4444',
    movingAverage: '#A855F7',
  },
  light: {
    background: '#FAF7F0',
    grid: '#DDD2B8',
    text: '#3D352B',
    textMuted: '#5E5344',
    line: '#2563EB',
    areaTop: 'rgba(37, 99, 235, 0.24)',
    areaBottom: 'rgba(37, 99, 235, 0.02)',
    up: '#10B981',
    down: '#EF4444',
    movingAverage: '#7C3AED',
  },
};

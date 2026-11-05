// Módulo PURO (sem banco): critério OBJETIVO do período contaminado pela colisão de escrita no placeholder do
// Mercado Livre (bug corrigido em 2026-11-05, commit 7e39b4b). Usado por scripts/reprocess-placeholder-collision.ts.
//
// Sintoma: a oferta-placeholder (sem vendedor, preço vindo do catálogo) recebia, no MESMO ciclo de coleta, preços de
// catálogos alheios; a série da oferta alternava entre 2 ou mais valores a cada ciclo. O preço verdadeiro da oferta
// nesse período NÃO é recuperável, então o período é EXCLUÍDO das métricas (nunca preenchido).
//
// Definições (ciclo = balde de 10 minutos, dia = civil America/Sao_Paulo):
//   dia "alternante" da oferta = tem >= 1 ciclo com >= 3 preços distintos
//                                 OU (>= 10 ciclos e >= 50 % deles com >= 2 preços distintos).
//   início  = primeiro dia alternante;  fim = instante do deploy da correção (exclusivo).
//   dias contaminados = do início até o dia do deploy (o dia do deploy só é contaminado ANTES do instante do deploy).

export interface DayCycleStats {
  day: string; // YYYY-MM-DD
  cycles: number;
  cyclesGe2: number;
  cyclesGe3: number;
}

export const MIN_CYCLES_FOR_RATIO = 10;
export const ALTERNATION_RATIO = 0.5;

export function isAlternatingDay(s: DayCycleStats): boolean {
  if (s.cyclesGe3 >= 1) return true;
  return s.cycles >= MIN_CYCLES_FOR_RATIO && s.cyclesGe2 / s.cycles >= ALTERNATION_RATIO;
}

/** Primeiro dia alternante (ou null se a oferta nunca alternou). */
export function contaminationStartDay(stats: DayCycleStats[]): string | null {
  const days = stats.filter(isAlternatingDay).map((s) => s.day).sort();
  return days[0] ?? null;
}

/** true se o instante de uma cotação cai dentro do período contaminado [início do dia `startDay`, deployAt). */
export function inContaminatedWindow(collectedAt: Date, startDayStart: Date, deployAt: Date): boolean {
  const t = collectedAt.getTime();
  return t >= startDayStart.getTime() && t < deployAt.getTime();
}

/** Dias (YYYY-MM-DD) estritamente anteriores ao dia do deploy que ficam inteiramente excluídos: de `startDay` até deployDay-1. */
export function fullyExcludedDays(startDay: string, deployDay: string, addDays: (d: string, n: number) => string): string[] {
  const out: string[] = [];
  for (let d = startDay; d < deployDay; d = addDays(d, 1)) out.push(d);
  return out;
}

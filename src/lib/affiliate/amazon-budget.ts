// Sem 'server-only': constantes e funções puras (orçamento do ciclo da coleta assistida da Amazon).
import { VERTICALS, type Vertical } from '../catalog/verticais';

/**
 * ORÇAMENTO DO CICLO (decisão do dono, 2026-11-11: coletar todas as frentes). A aba logada lê ~1 busca a cada 4-6 s;
 * medido: ~261 itens em ~28 min = 6,4 s por item incluindo o envio. Meta: ciclo fechando em até ~40 min = ~375 itens.
 *
 * Os pesos dividem o orçamento ENTRE departamentos em rodízio proporcional (intercalação: posição/peso). Se um departamento
 * tem menos itens que a cota, os demais ocupam a sobra; nada é fixo por departamento.
 * Pesos pensados no catálogo aprovado de 11/11 (masters aprovados com oferta: eletrodomesticos 120, livros 102, tecnologia 101,
 * esporte 83, eletroeletronicos 64, impressao3d 58; games ~221 já com Amazon).
 */
export const SECONDS_PER_SEARCH = 6.4;
export const DEFAULT_CYCLE_BUDGET = 375;
export const DEFAULT_REFRESH_CAP = 240;
export const MIN_DISCOVER = 60;
export const DEFAULT_DISCOVER_COOLDOWN_H = 72;

/** Atualização (masters que já têm oferta da Amazon). */
export const REFRESH_WEIGHT: Record<Vertical, number> = {
  games: 110, tecnologia: 25, eletroeletronicos: 15, eletrodomesticos: 25, livros: 20, esporte: 15, impressao3d: 10,
};
/** Descoberta (masters sem oferta da Amazon). */
export const DISCOVER_WEIGHT: Record<Vertical, number> = {
  games: 20, tecnologia: 25, eletroeletronicos: 20, eletrodomesticos: 30, livros: 25, esporte: 20, impressao3d: 15,
};

export type QueueMode = 'queue' | 'refresh' | 'discover';

export function weightsFor(mode: QueueMode): Record<Vertical, number> {
  if (mode === 'refresh') return REFRESH_WEIGHT;
  if (mode === 'discover') return DISCOVER_WEIGHT;
  const out = {} as Record<Vertical, number>;
  for (const v of VERTICALS) out[v] = REFRESH_WEIGHT[v] + DISCOVER_WEIGHT[v];
  return out;
}

const intEnv = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };

export function cycleBudget(env: Record<string, string | undefined> = process.env): number {
  return intEnv(env.AMAZON_CYCLE_BUDGET, DEFAULT_CYCLE_BUDGET);
}
export function discoverCooldownHours(env: Record<string, string | undefined> = process.env): number {
  return intEnv(env.AMAZON_DISCOVER_COOLDOWN_H, DEFAULT_DISCOVER_COOLDOWN_H);
}

/**
 * Teto de itens que a fila de cada modo entrega no ciclo. refresh: até REFRESH_CAP; discover: o que sobra do orçamento depois do
 * refresh real (mínimo MIN_DISCOVER); queue (legado, lista priorizada): o orçamento inteiro.
 */
export function capFor(mode: QueueMode, refreshTotal: number, env: Record<string, string | undefined> = process.env): number {
  const budget = cycleBudget(env);
  if (mode === 'queue') return budget;
  const refreshCap = Math.min(intEnv(env.AMAZON_REFRESH_CAP, DEFAULT_REFRESH_CAP), budget);
  if (mode === 'refresh') return refreshCap;
  return Math.max(MIN_DISCOVER, budget - Math.min(refreshTotal, refreshCap));
}

export function cycleMinutes(items: number): number {
  return (items * SECONDS_PER_SEARCH) / 60;
}

/** Fragmento SQL `CASE` com o peso do departamento (números de constantes locais, nunca de entrada externa). */
export function weightCaseSql(alias: string, mode: QueueMode): string {
  const w = weightsFor(mode);
  const a = alias.replace(/[^a-z0-9_]/gi, '');
  return `CASE ${a}.vertical ${VERTICALS.map((v) => `WHEN '${v}' THEN ${Math.max(1, Math.trunc(w[v]))}`).join(' ')} ELSE 1 END`;
}

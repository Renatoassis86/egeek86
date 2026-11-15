// #72: regra pura do "reaper" de collector_runs. Uma execucao 'running' que passou do maxDuration da rota + folga nao esta mais viva:
// a funcao da Vercel foi encerrada no teto e nenhum finally rodou. Aqui so ha a regra (testada em scripts/test-reaper-collector-runs.ts).

/** Folga sobre o maxDuration antes de dar a execucao por abandonada (o dono pediu maxDuration + 2 min). */
export const REAPER_FOLGA_S = 120;
/** Marca gravada em stopped_because (e em meta.reaper) nas linhas fechadas pelo reaper; o rollback procura por ela. */
export const REAPER_MOTIVO = 'timeout_reaper';

/** maxDuration (s) de cada rota, espelhando `export const maxDuration` em src/app/api/**. Chave exata ou prefixo ("job:"). */
const TETOS_S: ReadonlyArray<readonly [string, number]> = [
  ['collect-prices', 200],
  ['collect-shopee', 300],
  ['collect-vertical', 300],
  ['refresh-snapshots', 300],
  ['discover-products', 120],
  ['discover-shopee-esporte', 300],
  ['cobertura-shopee', 300],
  ['ampliar-amostra-shopee', 300],
  ['aprovacao-auto', 200],
  ['semear-vertical', 60],
  ['fila-api-oficial', 60],
  ['fila-classificacao', 60],
  ['group-messages', 60],
  ['amazon-assistida', 120],
  ['import-shopee-conversions', 120],
];
/** Job desconhecido: usa o maior teto (300 s), a escolha mais segura (fecha mais tarde, nunca uma execucao viva). */
export const TETO_PADRAO_S = 300;

export function tetoDoJobS(job: string): number {
  for (const [nome, teto] of TETOS_S) if (job === nome || job.startsWith(nome + ':')) return teto;
  return TETO_PADRAO_S;
}

export function limiteDeAbandonoS(job: string): number {
  return tetoDoJobS(job) + REAPER_FOLGA_S;
}

/** Menor limite de todos os jobs: o SELECT so precisa olhar linhas mais velhas que isto. */
export const LIMITE_MINIMO_S = Math.min(...TETOS_S.map(([, t]) => t)) + REAPER_FOLGA_S;

export function estaAbandonada(job: string, startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs > limiteDeAbandonoS(job) * 1000;
}

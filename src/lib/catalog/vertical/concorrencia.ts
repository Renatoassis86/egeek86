/**
 * E5 (#146, R-90): a medição de 2026-11-17 mostrou ~130 catálogos por execução de 4 min (eletroeletrônicos: 7,7 mil devidas, mais velha 80 h) com concorrência 3.
 * Padrão 4; VERTICAL_CATALOG_CONCURRENCY (1..8) ajusta sem deploy de código. A trava de HTTP 429 (rateLimited) continua parando a execução.
 */
export function catalogConcurrency(env: Record<string, string | undefined> = process.env): number {
  const n = Number((env.VERTICAL_CATALOG_CONCURRENCY ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 4;
}

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Qual pool do banco atende a consulta que está rodando agora.
 *  - 'live' (padrão): leituras da página, curtas; nunca ficam na fila atrás de recálculo pesado.
 *  - 'bg': recálculos do cache SWR (consultas pesadas de estatística/ranking). Rodam dentro de `runInBgPool`.
 * Pools separados evitam que uma consulta pesada legítima segure todas as conexões e faça a leitura curta
 * parecer "presa" (e, no sentido inverso, que reciclar um pool preso derrube trabalho legítimo do outro).
 */
export type PoolKind = 'live' | 'bg';

const G = globalThis as unknown as { __egeekPoolAls?: AsyncLocalStorage<PoolKind> };
const als = (G.__egeekPoolAls ??= new AsyncLocalStorage<PoolKind>());

export function currentPoolKind(): PoolKind {
  return als.getStore() ?? 'live';
}

export function runInBgPool<T>(fn: () => T): T {
  return als.run('bg', fn);
}

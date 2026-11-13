import { swr, detach } from '@/lib/cache/swr';
import { runInBgPool } from '@/lib/db/pool-context';
import { readShowcaseAged, writeShowcase, claimRefresh, stableStringify } from '@/server/queries/snapshot-store';

/** Espera máxima de uma página por consulta persistida SEM nenhum snapshot (a frio absoluto): nunca o SOCKET_TIMEOUT de 30 s. */
const PAGE_COLD_BUDGET_SECONDS = 5;
/** Quanto o último snapshot bom ainda pode ser servido (e recalculado por trás) quando o da janela fresca venceu. */
const DEFAULT_SNAPSHOT_STALE_SECONDS = 2 * 3600;

/**
 * Cache de queries pesadas da vitrine: stale-while-revalidate em memória
 * (src/lib/cache/swr.ts). O chamador NUNCA espera o recálculo de uma chave que
 * já teve valor: recebe o último valor bom e um único recálculo roda por trás.
 * `tags` ficou na assinatura por compatibilidade; nenhum ponto do código invoca
 * `revalidateTag`, então não há invalidação por tag.
 */
interface CacheOptions {
  /** Janela fresca em segundos (padrão: 60s) */
  revalidate?: number;
  /** Compatibilidade (sem efeito). */
  tags?: string[];
  /** Quanto o último valor bom pode ser servido depois de vencido, em segundos (padrão: 30 min). */
  maxStaleSeconds?: number;
  /** Espera máxima a frio, em segundos (padrão: 60). */
  coldTimeoutSeconds?: number;
  /** Ocupa vaga do semáforo global; só para consulta folha (ver swr.ts). */
  slot?: boolean;
  /** Teto duro da computação em segundos (padrão 90). */
  hardTimeoutSeconds?: number;
  /** Consulta curta de página: pool 'live' em vez de 'bg' (ver swr.ts). */
  live?: boolean;
  /**
   * Pré-cálculo persistido no banco (tabela `showcase_snapshot`; ver snapshot-store.ts). Ao (re)calcular,
   * a função primeiro procura o resultado pronto com idade <= maxAgeSeconds (escrito pelo cron
   * /api/cron/refresh-snapshots ou por outra instância); sem ele, calcula ao vivo como antes e grava o
   * resultado para as próximas instâncias frias. O cron chama `.refresh(...args)` para forçar o recálculo.
   */
  persist?: { maxAgeSeconds: number; /** teto para servir o último snapshot vencido enquanto recalcula por trás (padrão 2 h) */ maxStaleSeconds?: number };
}

/** Função em cache com `refresh`: recalcula SEM ler o snapshot e o grava (usado só pelo cron). */
export type PersistedQuery<T extends (...args: any[]) => Promise<any>> = T & {
  refresh: (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
  snapshotKeyFor: (...args: Parameters<T>) => string;
};

export function createCachedQuery<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: CacheOptions = {}
): T {
  const ttlMs = (options.revalidate ?? 60) * 1000;
  const keyFor = (args: unknown[]) => `${keyParts.join(':')}:${stableStringify(args)}`;
  const persist = options.persist;
  const compute = async (args: Parameters<T>, key: string): Promise<Awaited<ReturnType<T>>> => {
    if (persist) {
      // Último snapshot bom (qualquer idade até o teto): fresco serve direto; vencido serve NA HORA e UMA instância
      // recalcula por trás (single-flight entre instâncias via claimRefresh). A página nunca espera consulta pesada
      // quando existe um snapshot real anterior.
      const staleMs = Math.max(persist.maxStaleSeconds ?? DEFAULT_SNAPSHOT_STALE_SECONDS, persist.maxAgeSeconds) * 1000;
      const hit = await readShowcaseAged<Awaited<ReturnType<T>>>(key, staleMs);
      if (hit) {
        if (hit.ageMs > persist.maxAgeSeconds * 1000) {
          const bg = (async () => {
            if (!(await claimRefresh(key))) return;
            const t0 = Date.now();
            const v = await runInBgPool(() => fn(...args));
            await writeShowcase(key, v);
            if (Date.now() - t0 > 3000) console.warn(`[perf] recálculo em segundo plano de "${key.slice(0, 60)}" levou ${Date.now() - t0} ms`);
          })().catch((err) => console.error('[snapshot] recálculo em segundo plano falhou', key.slice(0, 60), err instanceof Error ? err.message : err));
          detach(bg);
        }
        return hit.value;
      }
    }
    const t0 = Date.now();
    const value = await fn(...args);
    if (persist) {
      const ms = Date.now() - t0;
      if (ms > 3000) console.warn(`[perf] consulta ao vivo sem snapshot "${key.slice(0, 60)}" levou ${ms} ms`);
      void writeShowcase(key, value);
    }
    return value;
  };
  const cached = (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const key = keyFor(args);
    return swr<Awaited<ReturnType<T>>>(key, () => compute(args, key), {
      ttlMs,
      maxStaleMs: options.maxStaleSeconds != null ? options.maxStaleSeconds * 1000 : undefined,
      coldTimeoutMs: options.coldTimeoutSeconds != null ? options.coldTimeoutSeconds * 1000 : persist ? PAGE_COLD_BUDGET_SECONDS * 1000 : undefined,
      slot: options.slot,
      hardTimeoutMs: options.hardTimeoutSeconds != null ? options.hardTimeoutSeconds * 1000 : undefined,
      live: options.live,
    });
  }) as T;
  if (!persist) return cached;
  const out = cached as PersistedQuery<T>;
  out.snapshotKeyFor = (...args) => keyFor(args);
  out.refresh = async (...args) => {
    const value = await fn(...args);
    await writeShowcase(keyFor(args), value);
    return value;
  };
  return out;
}

/** createCachedQuery com pré-cálculo persistido, tipado com `refresh` (para o cron). */
export function createPersistedQuery<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: CacheOptions & { persist: { maxAgeSeconds: number } }
): PersistedQuery<T> {
  return createCachedQuery(fn, keyParts, options) as PersistedQuery<T>;
}

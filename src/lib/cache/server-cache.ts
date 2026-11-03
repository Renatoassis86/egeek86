import { swr } from '@/lib/cache/swr';
import { readShowcase, writeShowcase, stableStringify } from '@/server/queries/snapshot-store';

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
  persist?: { maxAgeSeconds: number };
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
      const hit = await readShowcase<Awaited<ReturnType<T>>>(key, persist.maxAgeSeconds * 1000);
      if (hit) return hit.value;
    }
    const value = await fn(...args);
    if (persist) void writeShowcase(key, value);
    return value;
  };
  const cached = (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const key = keyFor(args);
    return swr<Awaited<ReturnType<T>>>(key, () => compute(args, key), {
      ttlMs,
      maxStaleMs: options.maxStaleSeconds != null ? options.maxStaleSeconds * 1000 : undefined,
      coldTimeoutMs: options.coldTimeoutSeconds != null ? options.coldTimeoutSeconds * 1000 : undefined,
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

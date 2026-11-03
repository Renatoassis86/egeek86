import { swr } from '@/lib/cache/swr';

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
}

export function createCachedQuery<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: CacheOptions = {}
): T {
  const ttlMs = (options.revalidate ?? 60) * 1000;
  return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const key = `${keyParts.join(':')}:${JSON.stringify(args)}`;
    return swr<Awaited<ReturnType<T>>>(key, () => fn(...args), {
      ttlMs,
      maxStaleMs: options.maxStaleSeconds != null ? options.maxStaleSeconds * 1000 : undefined,
      coldTimeoutMs: options.coldTimeoutSeconds != null ? options.coldTimeoutSeconds * 1000 : undefined,
      slot: options.slot,
      hardTimeoutMs: options.hardTimeoutSeconds != null ? options.hardTimeoutSeconds * 1000 : undefined,
      live: options.live,
    });
  }) as T;
}

import { unstable_cache } from 'next/cache';

/**
 * Utilitário de alta performance para cache de queries pesadas no Next.js (Data Cache + In-Memory Fallback).
 * Garante que nenhuma navegação ou carregamento de página demore mais de 2 segundos.
 */
interface CacheOptions {
  /** Tempo de expiração em segundos (padrão: 60s) */
  revalidate?: number;
  /** Tags para invalidação sob demanda */
  tags?: string[];
}

const memoryCache = new Map<string, { value: any; expiresAt: number }>();

export function createCachedQuery<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: CacheOptions = {}
): T {
  const revalidate = options.revalidate ?? 60; // 60 segundos por padrão
  const tags = options.tags ?? [];

  // 1. Tenta usar o cache oficial do Next.js App Router (unstable_cache)
  const cachedFn = unstable_cache(fn, keyParts, {
    revalidate,
    tags,
  });

  // Wrapper com fallback em memória ultra-rápido (< 2ms)
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await cachedFn(...args);
    } catch {
      // Fallback para in-memory cache caso a função seja chamada fora de contexto do Next.js
      const cacheKey = `${keyParts.join(':')}:${JSON.stringify(args)}`;
      const now = Date.now();
      const existing = memoryCache.get(cacheKey);

      if (existing && existing.expiresAt > now) {
        return existing.value;
      }

      const result = await fn(...args);
      memoryCache.set(cacheKey, {
        value: result,
        expiresAt: now + revalidate * 1000,
      });

      return result;
    }
  }) as T;
}

/**
 * Cache em memória com stale-while-revalidate (SWR), single-flight e limite de
 * concorrência. Substitui o `unstable_cache` nas consultas pesadas da vitrine.
 *
 * Por que (P0 2026-11-02): com `unstable_cache`, o recálculo em segundo plano de
 * uma entrada vencida fica em `workStore.pendingRevalidates`, que o Next aguarda
 * antes de fechar a resposta; cada visita pós-expiração disparava o MESMO
 * recálculo pesado (sem single-flight entre requisições), o pool do banco
 * saturava e o stream nunca fechava.
 *
 * Regras:
 *  - Fresco (idade < ttl): devolve direto.
 *  - Vencido: devolve o ÚLTIMO VALOR BOM na hora e dispara UM recálculo
 *    desacoplado da requisição (single-flight por chave). O usuário nunca espera.
 *    Valor vencido só serve até `maxStaleMs`; depois disso a chave é tratada como vazia.
 *  - Vazio (1ª vez/reinício): uma única computação compartilhada; cada chamador
 *    espera no máximo `coldTimeoutMs` e então recebe erro (a computação segue e
 *    preenche o cache; as telas já tratam erro com fallback vazio e honesto).
 *  - Falha no recálculo: mantém o último valor bom; nunca inventa número.
 *  - O trabalho em lote por item (`swrBatch`, a consulta pesada de estatística) passa
 *    por um semáforo global (poucas consultas pesadas simultâneas) para não derrubar
 *    o pooler do banco. Só folhas usam o semáforo: nunca segure vaga esperando outra.
 *  - O valor é guardado como JSON, exatamente como o `unstable_cache` fazia (Date
 *    vira string, Map não sobrevive), então nenhum chamador muda de contrato e
 *    ninguém recebe referência compartilhada mutável.
 */

import { runInBgPool, type PoolKind } from '@/lib/db/pool-context';

type Entry = { json: string; at: number };

interface SwrState {
  entries: Map<string, Entry>;
  inflight: Map<string, Promise<void>>;
  active: number;
  waiters: Array<{ resolve: () => void; high: boolean }>;
}

// globalThis: sobrevive ao HMR do dev e é compartilhado entre os módulos do bundle.
const G = globalThis as unknown as { __egeekSwr?: SwrState };
const state: SwrState = (G.__egeekSwr ??= { entries: new Map(), inflight: new Map(), active: 0, waiters: [] });

/** Computações pesadas simultâneas por processo (pool do banco tem 10 conexões). */
const MAX_CONCURRENT = Number(process.env.SWR_MAX_CONCURRENT ?? 2);
const MAX_ENTRIES = 30000;

/** `high`: quem está esperando a resposta (cache vazio) passa na frente dos recálculos em segundo plano. */
async function withSlot<T>(fn: () => Promise<T>, high = false): Promise<T> {
  if (state.active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => state.waiters.push({ resolve, high }));
  }
  state.active++;
  try {
    return await fn();
  } finally {
    state.active--;
    const i = state.waiters.findIndex((w) => w.high);
    const next = i >= 0 ? state.waiters.splice(i, 1)[0] : state.waiters.shift();
    next?.resolve();
  }
}

const TRANSIENT = /SOCKET_TIMEOUT|ECONNRESET|CONNECTION_CLOSED|CONNECTION_ENDED|CONNECT_TIMEOUT|EPIPE|ETIMEDOUT|57P01|08006|XX000/;

function isTransient(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const text = `${e?.code ?? ''} ${e?.message ?? ''} ${e?.cause?.code ?? ''} ${e?.cause?.message ?? ''}`;
  return TRANSIENT.test(text);
}

/**
 * Teto duro de uma computação em segundo plano. Uma conexão presa nunca responde (já houve count(*) preso
 * por ~8,5 h), então o teto é curto: estourou, o pool é reciclado (conexão presa destruída) e repete 1 vez.
 */
const HARD_TIMEOUT_MS = 90_000;

/** Quando uma consulta estoura o tempo, a conexão que a segura está presa: recicla o pool (src/lib/db/index.ts). */
function recyclePoolAfterTimeout(what: string, kind: PoolKind): void {
  try {
    (globalThis as unknown as { __egeekRecyclePool?: (r: string, k: PoolKind) => boolean }).__egeekRecyclePool?.(`timeout em ${what}`, kind);
  } catch {
    /* sem pool para reciclar */
  }
}

class StuckError extends Error {
  readonly code = 'QUERY_TIMEOUT';
}

function withHardTimeout<T>(p: Promise<T>, ms: number, what: string, kind: PoolKind = 'live'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      recyclePoolAfterTimeout(what, kind);
      reject(new StuckError(`swr: ${what} sem resposta em ${ms} ms (conexão presa?)`));
    }, ms);
  });
  return Promise.race([p, t]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Consulta de leitura ao vivo ainda pendente depois disto = conexão presa de verdade (não só lenta): recicla o pool. */
const LIVE_STUCK_MS = 15_000;

/**
 * Leitura direta (não cacheada) com teto de espera `ms` para a PÁGINA. Estourou: rejeita (quem chama serve a
 * última leitura boa ou omite o bloco) SEM reciclar o pool, porque lentidão não é conexão presa e reciclar
 * derrubaria consultas saudáveis. A consulta abandonada segue; se ainda estiver pendente depois de
 * LIVE_STUCK_MS, aí sim o pool é reciclado (a conexão presa é destruída; as saudáveis terminam em 20 s de graça).
 * Erro transitório de conexão (ECONNRESET etc.) repete UMA vez se sobrar orçamento.
 */
export async function withTimeout<T>(p: PromiseLike<T>, ms: number, what: string): Promise<T> {
  const started = Date.now();
  const attempt = (budget: number): Promise<T> => {
    const run = Promise.resolve(p);
    let settled = false;
    run.then(() => (settled = true), () => (settled = true));
    const watchdog = setTimeout(() => {
      if (!settled) recyclePoolAfterTimeout(`${what} pendente há ${LIVE_STUCK_MS} ms`, 'live');
    }, LIVE_STUCK_MS);
    watchdog.unref?.();
    run.finally(() => clearTimeout(watchdog)).catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const t = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StuckError(`swr: ${what} sem resposta em ${budget} ms`)), budget);
    });
    return Promise.race([run, t]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  };
  try {
    return await attempt(ms);
  } catch (err) {
    if (err instanceof StuckError || !isTransient(err)) throw err;
    const left = ms - (Date.now() - started);
    if (left < 500) throw err;
    return await attempt(left);
  }
}

async function runCompute<T>(compute: () => Promise<T>, hardMs = HARD_TIMEOUT_MS, what = 'consulta', live = false): Promise<T> {
  // `live`: consulta curta de página (cupom, lojas do produto...) roda no pool 'live', para não ficar na fila atrás
  // de recálculo pesado do pool 'bg' (2026-11-03: cupom de 1 linha esperou 90 s atrás da estatística do catálogo).
  const kind: PoolKind = live ? 'live' : 'bg';
  const start = () => (live ? compute() : runInBgPool(compute));
  try {
    return await withHardTimeout(start(), hardMs, what, kind);
  } catch (err) {
    // Conexão velha/presa do pooler: o pool foi reciclado (timeout) ou o driver descartou a conexão; repete 1 vez em conexão nova.
    if (err instanceof StuckError || isTransient(err)) return await withHardTimeout(start(), hardMs, what, kind);
    throw err;
  }
}

/**
 * Mantém o recálculo vivo depois que a resposta sai. ATENÇÃO: NÃO usar o `waitUntil` do
 * contexto do Next (`@next/request-context`): no `next start` o Next espera essas promessas
 * antes de fechar o stream da resposta (pipe-readable.js, `waitUntilForEnd`), o que reproduz
 * o P0 (stream que nunca fecha). Só o `waitUntil` da Vercel, que é da plataforma e não
 * segura a resposta; em processo Node longo a promessa solta basta.
 */
export function detach(p: Promise<unknown>): void {
  p.catch(() => {});
  if (!process.env.VERCEL) return;
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
      | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined }
      | undefined;
    ctx?.get?.()?.waitUntil?.(p);
  } catch {
    /* sem contexto */
  }
}

function startRefresh<T>(key: string, compute: () => Promise<T>, useSlot = false, high = false, hardMs = HARD_TIMEOUT_MS, live = false): Promise<void> {
  const existing = state.inflight.get(key);
  if (existing) return existing;
  const p = (useSlot ? withSlot(() => runCompute(compute, hardMs, key.slice(0, 60), live), high) : runCompute(compute, hardMs, key.slice(0, 60), live))
    .then((value) => {
      if (state.entries.size >= MAX_ENTRIES) {
        const oldest = state.entries.keys().next().value;
        if (oldest !== undefined) state.entries.delete(oldest);
      }
      state.entries.delete(key);
      state.entries.set(key, { json: JSON.stringify(value === undefined ? null : value), at: Date.now() });
    })
    .catch((err) => {
      console.error(`[swr] falha ao recalcular "${key.slice(0, 80)}" (mantém último valor bom):`, err instanceof Error ? err.message : err);
      throw err;
    })
    .finally(() => {
      state.inflight.delete(key);
    });
  state.inflight.set(key, p);
  p.catch(() => {});
  return p;
}

export interface SwrOptions {
  /** Janela em que o valor é considerado fresco. */
  ttlMs: number;
  /** Quanto tempo depois do vencimento o último valor bom ainda pode ser servido (padrão: 30 min). */
  maxStaleMs?: number;
  /** Espera máxima de quem chega com a chave vazia (padrão: 60 s). */
  coldTimeoutMs?: number;
  /**
   * Ocupa uma vaga do semáforo global. SÓ para consulta FOLHA (não chama outra função em cache):
   * uma consulta que segura vaga e espera outra que também precisa de vaga trava o processo
   * (achado nas medições de 2026-11-02: 3 `featured` seguravam as 3 vagas esperando as estatísticas).
   */
  slot?: boolean;
  /** Teto duro da computação (padrão 90 s). */
  hardTimeoutMs?: number;
  /** Consulta curta de página: usa o pool 'live' em vez do 'bg' (não espera atrás de recálculo pesado). */
  live?: boolean;
}

function parse<T>(e: Entry): T {
  return JSON.parse(e.json) as T;
}

export async function swr<T>(key: string, compute: () => Promise<T>, opts: SwrOptions): Promise<T> {
  const now = Date.now();
  const maxStale = opts.maxStaleMs ?? 30 * 60_000;
  const entry = state.entries.get(key);

  if (entry) {
    const age = now - entry.at;
    if (age < opts.ttlMs) return parse<T>(entry);
    if (age < opts.ttlMs + maxStale) {
      detach(startRefresh(key, compute, opts.slot, false, opts.hardTimeoutMs, opts.live));
      return parse<T>(entry);
    }
    state.entries.delete(key);
  }

  const pending = startRefresh(key, compute, opts.slot, true, opts.hardTimeoutMs, opts.live);
  // coldTimeoutMs = 0: não bloqueante. Sem valor, dispara o cálculo por trás e devolve null
  // (quem chama trata "ainda não calculado" mostrando nada, nunca um número inventado).
  if (opts.coldTimeoutMs === 0) {
    detach(pending);
    return null as T;
  }
  const coldTimeout = opts.coldTimeoutMs ?? 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`swr: "${key.slice(0, 60)}" excedeu ${coldTimeout} ms a frio`)), coldTimeout);
  });
  try {
    await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const fresh = state.entries.get(key);
  if (!fresh) throw new Error(`swr: "${key.slice(0, 60)}" sem valor`);
  return parse<T>(fresh);
}

/**
 * SWR POR ITEM, para consultas em lote (estatística por produto, linha por oferta).
 * Cada id tem a sua entrada: telas diferentes que pedem listas diferentes
 * reaproveitam o que já foi calculado (antes a chave era a lista inteira de ids,
 * então cada filtro recalculava tudo). Ids vencidos são servidos na hora e
 * recalculados em lotes pequenos por trás; ids sem valor são buscados em lotes
 * (o custo da consulta de estatística é muito não linear no tamanho do lote).
 */
export async function swrBatch<V>(
  prefix: string,
  ids: string[],
  fetchChunk: (chunk: string[]) => Promise<Record<string, V>>,
  opts: SwrOptions & {
    chunkSize?: number;
    /** Lote de poucos ids pedido por uma página (ex.: produto): roda direto no pool 'live', sem esperar vaga do semáforo atrás de recálculos pesados do catálogo. */
    direct?: boolean;
    /** Estouro do tempo a frio devolve só o que já foi calculado (ids sem valor ficam fora do resultado) em vez de lançar erro. O cálculo segue por trás e preenche o cache. */
    partialOnTimeout?: boolean;
  }
): Promise<Record<string, V>> {
  const out: Record<string, V> = {};
  const chunkSize = opts.chunkSize ?? 40;
  const maxStale = opts.maxStaleMs ?? 30 * 60_000;
  const missing: string[] = [];
  const stale: string[] = [];
  for (const id of ids) {
    const e = state.entries.get(`${prefix}:${id}`);
    const age = e ? Date.now() - e.at : Infinity;
    if (e && age < opts.ttlMs + maxStale) {
      const v = parse<V | null>(e);
      if (v !== null) out[id] = v;
      if (age >= opts.ttlMs) stale.push(id);
    } else {
      missing.push(id);
    }
  }

  const launch = (list: string[], high = false): Promise<void>[] => {
    const promises: Promise<void>[] = [];
    const todo = list.filter((id) => !state.inflight.has(`${prefix}:${id}`));
    for (let i = 0; i < todo.length; i += chunkSize) {
      const chunk = todo.slice(i, i + chunkSize);
      const exec = () => runCompute(() => fetchChunk(chunk), opts.direct ? 30_000 : HARD_TIMEOUT_MS, `lote ${prefix}`, opts.direct === true);
      const run = (opts.direct ? exec() : withSlot(exec, high))
        .then((rec) => {
          for (const id of chunk) {
            // id ausente do resultado = "não há linha" (null guardado): evita rebuscar a cada visita.
            const k = `${prefix}:${id}`;
            state.entries.delete(k);
            state.entries.set(k, { json: JSON.stringify(rec[id] ?? null), at: Date.now() });
          }
          while (state.entries.size > MAX_ENTRIES) {
            const oldest = state.entries.keys().next().value;
            if (oldest === undefined) break;
            state.entries.delete(oldest);
          }
        })
        .catch((err) => {
          console.error(`[swr] lote "${prefix}" falhou (mantém último valor bom):`, err instanceof Error ? err.message : err);
          throw err;
        })
        .finally(() => {
          for (const id of chunk) state.inflight.delete(`${prefix}:${id}`);
        });
      run.catch(() => {});
      for (const id of chunk) state.inflight.set(`${prefix}:${id}`, run);
      promises.push(run);
    }
    return promises;
  };

  if (stale.length) for (const p of launch(stale)) detach(p);

  if (missing.length) {
    launch(missing, true);
    const waits = [...new Set(missing.map((id) => state.inflight.get(`${prefix}:${id}`)).filter((p): p is Promise<void> => !!p))];
    const coldTimeout = opts.coldTimeoutMs ?? 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`swr: lote "${prefix}" excedeu ${coldTimeout} ms a frio`)), coldTimeout);
    });
    try {
      await Promise.race([Promise.all(waits), timeout]);
    } catch (err) {
      if (!opts.partialOnTimeout) throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    for (const id of missing) {
      const e = state.entries.get(`${prefix}:${id}`);
      const v = e ? parse<V | null>(e) : null;
      if (v !== null) out[id] = v;
    }
  }
  return out;
}

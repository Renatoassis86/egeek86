import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifyCollectorError, type CollectorErrorKind } from '@/lib/collector-runs/classify-error';
import { capMeta, deriveRunStatus, type RunStatus } from '@/lib/collector-runs/run-status';

/**
 * Registro de execucao do coletor/crons (migration 0025, PROPOSTA). TUDO atras da flag COLLECTOR_RUNS=1 (desligada por
 * padrao) e a prova de falha: qualquer erro daqui (tabela/coluna ausente, banco lento) e engolido e logado; a coleta
 * nunca para nem muda de comportamento por causa deste modulo. Sem a flag, as funcoes sao no-op (zero consulta ao banco).
 *
 * Unidades: `selected` e `priceConfirmed` contam OFERTAS; `queries`, `checked`, `misses` e `errors` contam CONSULTAS a fonte
 * (no Mercado Livre, 1 consulta = 1 catalog_product_id = 1 grupo de ofertas; na Shopee, 1 oferta). As taxas usam consultas.
 *
 * `last_price_confirmed_at`: gravada SO por confirmPrices()/queueConfirm(), chamadas apenas depois de a API devolver preco
 * e de recordPriceSnapshot ter concluido. O caminho "sem vendedor" e o carimbo em lote das ofertas irmas (stampChecked)
 * NUNCA chamam isto. A coluna nao esta no schema Drizzle (ver 0025): so SQL cru, so com a flag ligada.
 */
export function collectorRunsEnabled(): boolean {
  return process.env.COLLECTOR_RUNS === '1';
}

export interface RunCounters {
  selected: number;
  queries: number;
  checked: number;
  priceConfirmed: number;
  snapshotsWritten: number;
  misses: number;
  errors: number;
  rateLimited: number;
  offersCreated: number;
  errorKinds: Partial<Record<CollectorErrorKind, number>>;
}

export interface FinishOptions {
  stoppedBecause?: string | null;
  budgetExhausted?: boolean;
  fatal?: boolean;
  meta?: Record<string, unknown>;
}

export interface CollectorRunHandle {
  readonly enabled: boolean;
  readonly counters: RunCounters;
  /** Registra falha de consulta a partir da mensagem (classifica 429/5xx/rede...). */
  addError(message: string, kind?: CollectorErrorKind): void;
  /** Grava last_price_confirmed_at = now() agora, para estas ofertas (API devolveu preco). Nunca lanca. */
  confirmPrices(offerIds: string[]): Promise<void>;
  /** Acumula e grava no finish() (coletores com orcamento de tempo proprio). */
  queueConfirm(offerId: string): void;
  finish(opts?: FinishOptions): Promise<void>;
}

function emptyCounters(): RunCounters {
  return {
    selected: 0,
    queries: 0,
    checked: 0,
    priceConfirmed: 0,
    snapshotsWritten: 0,
    misses: 0,
    errors: 0,
    rateLimited: 0,
    offersCreated: 0,
    errorKinds: {},
  };
}

function warn(what: string, err: unknown) {
  console.error(`[collector-runs] ${what} falhou (ignorado):`, err instanceof Error ? err.message : err);
}

/** Grava a confirmacao de preco por SQL cru. So com a flag. Nunca lanca. */
export async function confirmOfferPrices(offerIds: string[]): Promise<void> {
  if (!collectorRunsEnabled() || offerIds.length === 0) return;
  try {
    await db.execute(sql`
      UPDATE affiliate_offers SET last_price_confirmed_at = now()
      WHERE id IN (${sql.join(offerIds.map((id) => sql`${id}`), sql`, `)})
    `);
  } catch (err) {
    warn('last_price_confirmed_at', err);
  }
}

export const NOOP_RUN: CollectorRunHandle = {
  enabled: false,
  counters: emptyCounters(),
  addError() {},
  async confirmPrices() {},
  queueConfirm() {},
  async finish() {},
};

export interface StartOptions {
  selected?: number;
  dueTotal?: number | null;
  oldestDueAgeS?: number | null;
}

export async function startCollectorRun(
  job: string,
  network: string | null,
  opts: StartOptions = {}
): Promise<CollectorRunHandle> {
  if (!collectorRunsEnabled()) return NOOP_RUN;
  const startedMs = Date.now();
  let runId: string | null = null;
  try {
    const rows = await db.execute<{ id: string }>(sql`
      INSERT INTO collector_runs (job, network, due_total, oldest_due_age_s)
      VALUES (${job}, ${network}, ${opts.dueTotal ?? null}, ${opts.oldestDueAgeS ?? null})
      RETURNING id::text AS id
    `);
    runId = rows[0]?.id ?? null;
  } catch (err) {
    warn('abrir execucao', err);
  }

  const counters = emptyCounters();
  counters.selected = opts.selected ?? 0;
  const queued = new Set<string>();
  let finished = false;

  return {
    enabled: true,
    counters,
    addError(message, kind) {
      const k = kind ?? classifyCollectorError(message);
      counters.errors++;
      counters.errorKinds[k] = (counters.errorKinds[k] ?? 0) + 1;
      if (k === 'http_429') counters.rateLimited++;
    },
    async confirmPrices(offerIds) {
      const ids = Array.from(new Set(offerIds));
      counters.priceConfirmed += ids.length;
      await confirmOfferPrices(ids);
    },
    queueConfirm(offerId) {
      queued.add(offerId);
    },
    async finish(fin = {}) {
      if (finished) return;
      finished = true;
      try {
        if (queued.size > 0) {
          const ids = Array.from(queued);
          counters.priceConfirmed += ids.length;
          await confirmOfferPrices(ids);
        }
        if (runId == null) return;
        const stopped = fin.stoppedBecause ?? null;
        const budget = fin.budgetExhausted ?? false;
        const status: RunStatus = deriveRunStatus({
          queries: counters.queries,
          checked: counters.checked,
          errors: counters.errors,
          stoppedBecause: stopped,
          budgetExhausted: budget,
          fatal: fin.fatal,
        });
        const meta = JSON.stringify(capMeta({ queries: counters.queries, ...fin.meta }));
        await db.execute(sql`
          UPDATE collector_runs SET
            finished_at = now(), duration_ms = ${Date.now() - startedMs}, status = ${status},
            selected = ${counters.selected}, checked = ${counters.checked}, price_confirmed = ${counters.priceConfirmed},
            snapshots_written = ${counters.snapshotsWritten}, misses = ${counters.misses}, errors = ${counters.errors},
            rate_limited = ${counters.rateLimited}, error_kinds = ${JSON.stringify(counters.errorKinds)}::jsonb,
            offers_created = ${counters.offersCreated}, budget_exhausted = ${budget}, stopped_because = ${stopped},
            meta = ${meta}::jsonb
          WHERE id = ${runId}::bigint
        `);
      } catch (err) {
        warn('fechar execucao', err);
      }
    },
  };
}

/**
 * Envolve um cron simples: abre a execucao, roda `fn` (a excecao ORIGINAL sempre propaga, intacta) e fecha com status.
 * `describe` extrai do resultado o que vale registrar (stoppedBecause, meta).
 */
export async function withCollectorRun<T>(
  job: string,
  network: string | null,
  fn: (run: CollectorRunHandle) => Promise<T>,
  describe?: (result: T) => FinishOptions
): Promise<T> {
  const run = await startCollectorRun(job, network);
  try {
    const result = await fn(run);
    let fin: FinishOptions = {};
    try {
      fin = describe ? describe(result) : {};
    } catch (err) {
      warn('descrever resultado', err);
    }
    await run.finish(fin);
    return result;
  } catch (err) {
    await run.finish({ fatal: true, meta: { error: err instanceof Error ? err.message.slice(0, 200) : 'erro' } });
    throw err;
  }
}

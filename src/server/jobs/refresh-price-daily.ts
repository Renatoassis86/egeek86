import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runInBgPool } from '@/lib/db/pool-context';
import { PRICE_DAILY_REGIME_START, addDays, computeLiveMin, nextMinEvent, spDay } from '@/lib/pricing/daily-state';
import { computeStatesForBatch, syncMinEvent, upsertOfferDays, upsertStates } from '@/server/pricing/price-daily';
import { summarizeAmazonShadow, type AmazonShadowDiff, type AmazonShadowSummary } from '@/lib/pricing/amazon-shadow';
import { getAmazonMode } from '@/lib/pricing/amazon-mode';

/**
 * Job `refresh-price-daily` (SOMBRA; ata 2026-11-05, ADR 0004). Idempotente. A cada ciclo:
 *  1. dias a tratar = (último dia FECHADO + 1) até hoje, no máximo 7 dias (catch-up se o cron ficou parado);
 *  2. reagrega price_daily_offer SÓ desses dias (dias fechados não são tocados);
 *  3. recalcula price_daily_state desses dias em lotes de produtos; dias anteriores a hoje são gravados com
 *     closed=true (congelados: o UPSERT nunca reescreve linha fechada); hoje fica aberto;
 *  4. fallback dos eventos do menor preço: produto cujo menor preço vigente difere do último evento recebe evento.
 * Exige o backfill feito (linhas oferta-dia anteriores) para o carry-forward estar correto; senão não faz nada.
 * Só escreve nas três tabelas derivadas. Roda no pool 'bg'.
 */
export interface PriceDailySummary {
  skipped?: string;
  days: string[];
  offerDayRows: number;
  products: number;
  stateRows: number;
  eventsWritten: number;
  failedChunks: number;
  elapsedMs: number;
  budgetExhausted: boolean;
  /** Modo da flag PRICE_AMAZON_MODE neste ciclo. */
  amazonMode?: string;
  /** Só no modo `shadow`: comparação de HOJE entre a média pública (sem Amazon) e a média COM Amazon. Vai para collector_runs.meta via cron. */
  amazonShadow?: AmazonShadowSummary;
}

export function priceDailyShadowEnabled(): boolean {
  return process.env.PRICE_DAILY_SHADOW === '1';
}

export async function refreshPriceDaily(opts: { budgetMs: number; chunkSize?: number; now?: Date }): Promise<PriceDailySummary> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const today = spDay(now);
  const chunkSize = opts.chunkSize ?? 250;
  const mode = getAmazonMode();
  const sum: PriceDailySummary = { days: [], offerDayRows: 0, products: 0, stateRows: 0, eventsWritten: 0, failedChunks: 0, elapsedMs: 0, budgetExhausted: false, amazonMode: mode };
  const shadowAll: AmazonShadowDiff[] = [];

  const lastClosedRows = await db.execute<{ d: string | null }>(sql`SELECT max(day)::text AS d FROM price_daily_state WHERE closed`);
  const lastClosed = lastClosedRows[0]?.d ?? null;
  let first = lastClosed ? addDays(lastClosed, 1) : today;
  if (first < addDays(today, -7)) first = addDays(today, -7);
  if (first < PRICE_DAILY_REGIME_START) first = PRICE_DAILY_REGIME_START;

  const pre = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM price_daily_offer WHERE day < ${first}::date`);
  if (!Number(pre[0]?.n ?? 0)) {
    sum.skipped = 'backfill_required';
    sum.elapsedMs = Date.now() - started;
    return sum;
  }
  for (let d = first; d <= today; d = addDays(d, 1)) sum.days.push(d);

  sum.offerDayRows = await runInBgPool(() => upsertOfferDays(db, first, today));

  const prodRows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT master_product_id AS id FROM price_daily_offer WHERE day >= ${addDays(first, -7)}::date
  `);
  const productIds = prodRows.map((r) => String(r.id));
  sum.products = productIds.length;
  for (let i = 0; i < productIds.length; i += chunkSize) {
    if (Date.now() - started > opts.budgetMs) {
      sum.budgetExhausted = true;
      break;
    }
    const chunk = productIds.slice(i, i + chunkSize);
    try {
      await runInBgPool(async () => {
        const { rows, offersByProduct, shadow } = await computeStatesForBatch(db, chunk, first, today, now, { mode });
        shadowAll.push(...shadow);
        sum.stateRows += await upsertStates(db, rows);
        // Fallback dos eventos: só produtos cujo menor preço vigente difere do último evento.
        const lastEv = await db.execute<{ master_product_id: string; at: string; min_cents: string }>(sql`
          SELECT DISTINCT ON (master_product_id) master_product_id, at, min_cents FROM price_min_events
          WHERE master_product_id IN (${sql.join(chunk.map((c) => sql`${c}`), sql`, `)})
          ORDER BY master_product_id, at DESC, id DESC
        `);
        const lastBy = new Map(lastEv.map((e) => [String(e.master_product_id), { at: new Date(e.at), minCents: Number(e.min_cents) }]));
        for (const [pid, offers] of offersByProduct) {
          const ev = nextMinEvent(lastBy.get(pid) ?? null, computeLiveMin(offers, now), now);
          if (ev && (await syncMinEvent(pid, now))) sum.eventsWritten++;
        }
      });
    } catch (err) {
      sum.failedChunks++;
      console.error('[refresh-price-daily] lote falhou:', err instanceof Error ? err.message : err);
    }
  }
  if (mode === 'shadow') sum.amazonShadow = summarizeAmazonShadow(shadowAll);
  sum.elapsedMs = Date.now() - started;
  return sum;
}

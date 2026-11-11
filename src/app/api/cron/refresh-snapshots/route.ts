import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { refreshProductStats, refreshShowcase } from '@/server/jobs/refresh-snapshots';
import { startCollectorRun } from '@/server/collector/collector-runs';
import { gravarSnapshotInventario } from '@/server/jobs/catalog-inventory-snapshot';
import { priceDailyShadowEnabled, refreshPriceDaily } from '@/server/jobs/refresh-price-daily';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Pré-cálculo persistido da vitrine (Fase 2, ata 2026-11-03-fase2-precalculo.md). Vercel Cron (vercel.json):
 *   ?part=stats     a cada 15 min  -> product_price_stats (estatística canônica por produto)
 *   ?part=showcase  4 min depois   -> showcase_snapshot (contadores, rankings, tabela), que lê as estatísticas prontas
 *   ?part=inventory  (1x por hora; upsert de 1 linha por loja por dia) -> catalog_inventory_snapshots (inventário do catálogo, migração 0040)
 *   ?part=daily     (SOMBRA, só com PRICE_DAILY_SHADOW=1) -> price_daily_offer/state/min_events (ata 2026-11-05)
 * Mesma autenticação das demais /api/cron/* (CRON_SECRET, falha fechada). `force=1` recalcula tudo, mesmo o recente.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  const part = request.nextUrl.searchParams.get('part') ?? 'all';
  const force = request.nextUrl.searchParams.get('force') === '1';
  const started = Date.now();
  const BUDGET_MS = 240_000;
  const out: Record<string, unknown> = { part };
  // Registro de execucao (flag COLLECTOR_RUNS=1; no-op sem a flag; nunca lanca).
  const run = await startCollectorRun(`refresh-snapshots:${part}`, null);

  try {
    if (part === 'stats' || part === 'all') {
      out.stats = await refreshProductStats({ budgetMs: BUDGET_MS, minAgeMs: force ? 0 : undefined });
    }
    if (part === 'showcase' || part === 'all') {
      out.showcase = await refreshShowcase({ budgetMs: Math.max(20_000, BUDGET_MS - (Date.now() - started)), force });
    }
    if (part === 'daily') {
      out.daily = priceDailyShadowEnabled()
        ? await refreshPriceDaily({ budgetMs: Math.max(20_000, BUDGET_MS - (Date.now() - started)) })
        : { skipped: 'PRICE_DAILY_SHADOW desligada' };
    }
    // Inventário do catálogo: tolerante a falha por construção (nunca lança; erro vai no retorno).
    if (part === 'inventory' || part === 'all') {
      out.inventory = await gravarSnapshotInventario();
    }
  } catch (err) {
    console.error('[cron refresh-snapshots] falhou:', err);
    await run.finish({ fatal: true, meta: { part, error: err instanceof Error ? err.message.slice(0, 200) : 'erro' } });
    return NextResponse.json({ ...out, error: err instanceof Error ? err.message : 'erro' }, { status: 500 });
  }
  out.elapsedMs = Date.now() - started;
  await run.finish({ meta: out });
  return NextResponse.json(out);
}

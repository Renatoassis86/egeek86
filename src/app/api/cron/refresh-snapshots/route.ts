import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { refreshProductStats, refreshShowcase } from '@/server/jobs/refresh-snapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Pré-cálculo persistido da vitrine (Fase 2, ata 2026-11-03-fase2-precalculo.md). Vercel Cron (vercel.json):
 *   ?part=stats     a cada 15 min  -> product_price_stats (estatística canônica por produto)
 *   ?part=showcase  4 min depois   -> showcase_snapshot (contadores, rankings, tabela), que lê as estatísticas prontas
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

  try {
    if (part === 'stats' || part === 'all') {
      out.stats = await refreshProductStats({ budgetMs: BUDGET_MS, minAgeMs: force ? 0 : undefined });
    }
    if (part === 'showcase' || part === 'all') {
      out.showcase = await refreshShowcase({ budgetMs: Math.max(20_000, BUDGET_MS - (Date.now() - started)), force });
    }
  } catch (err) {
    console.error('[cron refresh-snapshots] falhou:', err);
    return NextResponse.json({ ...out, error: err instanceof Error ? err.message : 'erro' }, { status: 500 });
  }
  out.elapsedMs = Date.now() - started;
  return NextResponse.json(out);
}

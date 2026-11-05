import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { startCollectorRun } from '@/server/collector/collector-runs';
import { discoverNewProducts } from '@/server/collector/discover-products';
import { discoverShopeeProducts } from '@/server/collector/discover-shopee-products';
import { discoverMagaluProducts } from '@/server/collector/discover-magalu-products';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Descoberta de produtos. Religada de forma CONSERVADORA (2026-11-03):
 *  - por padrão roda SÓ o Mercado Livre (API oficial de catálogo); Shopee e Magalu só com ?source=shopee|all;
 *  - lote pequeno e teto de masters novos por execução (ver discover-policy.ts: DEFAULT_LIMITS);
 *  - tudo novo com qualquer dúvida nasce em `review` (invisível ao público até conferência);
 *  - ?dry=1 simula sem gravar (preview no corpo); ?maxNew= ?terms= ?probes= ajustam os limites (com teto duro).
 * Desligar: remover a entrada do vercel.json (ver docs/descoberta-religamento-2026-11-03.md).
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const source = sp.get('source') ?? 'meli'; // meli | shopee | all
  const dryRun = sp.get('dry') === '1';
  const limits = {
    maxNewMasters: sp.get('maxNew') ?? undefined,
    termsPerRun: sp.get('terms') ?? undefined,
    probesPerTerm: sp.get('probes') ?? undefined,
  } as Record<string, unknown>;

  const wantMeli = source === 'meli' || source === 'all';
  const wantShopee = source === 'shopee' || source === 'all';
  const wantMagalu = source === 'all';

  // Registro de execução (flag COLLECTOR_RUNS=1; no-op sem a flag; nunca lança). Só a descoberta real, não o dry-run.
  const run = dryRun ? null : await startCollectorRun('discover-products', source);

  // Mercado Livre, Shopee e Magalu são serviços externos separados, cada um com seu limite: rodam em paralelo.
  // Shopee e Magalu NÃO têm modo dry-run; com ?dry=1 ficam de fora.
  let discoverySummary, shopeeSummary, magaluSummary;
  try {
    [discoverySummary, shopeeSummary, magaluSummary] = await Promise.all([
      wantMeli ? discoverNewProducts({ dryRun, limits }) : Promise.resolve(null),
      wantShopee && !dryRun ? discoverShopeeProducts() : Promise.resolve(null),
      wantMagalu && !dryRun ? discoverMagaluProducts() : Promise.resolve(null),
    ]);
  } catch (err) {
    await run?.finish({ fatal: true, meta: { error: err instanceof Error ? err.message.slice(0, 200) : 'erro' } });
    throw err;
  }
  if (run) {
    const stopped = discoverySummary?.stoppedReason ?? null;
    if (stopped && /429/.test(stopped)) run.counters.rateLimited++;
    await run.finish({ stoppedBecause: stopped, meta: { source, discoverySummary, shopeeSummary, magaluSummary } });
  }

  return NextResponse.json({
    discoverySummary,
    shopeeSummary,
    magaluSummary,
    source,
    dryRun,
    status: 'success',
    timestamp: new Date().toISOString(),
  });
}

import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { collectShopeePrices } from '@/server/collector/collect-shopee-prices';

export const dynamic = 'force-dynamic';
// Plano Pro: até 300 s. O coletor para sozinho em 240 s (budgetMs) e continua
// no próximo tick, em lotes ordenados por last_checked_at.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  const summary = await collectShopeePrices({ budgetMs: 240_000 });
  return NextResponse.json(summary);
}

import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { refreshPublicOffersMat } from '@/server/jobs/public-offers-mat';
import { acquireCycleLock } from '@/server/messaging/cycle-lock';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Refresco incremental das ofertas públicas materializadas (migration 0069). Vercel Cron a cada 3 min; `full=1` força a reconciliação completa. */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const lock = await acquireCycleLock('public-offers-mat');
  if (!lock.acquired) return NextResponse.json({ skipped: 'rodada anterior ainda em andamento' });
  try {
    const r = await refreshPublicOffersMat({ forceFull: request.nextUrl.searchParams.get('full') === '1' });
    console.log('[public-offers-mat]', JSON.stringify(r));
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } finally {
    lock.release();
  }
}

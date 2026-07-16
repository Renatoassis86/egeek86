import { NextResponse, type NextRequest } from 'next/server';
import { runDailyDigest } from '@/server/notifications/send-daily-digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Disparado diariamente por um agendador externo (Supabase pg_cron + pg_net
 * — ver docs/pg-cron-setup.md), não por um usuário. Mesmo padrão de auth de
 * /api/cron/collect-prices.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await runDailyDigest();
  return NextResponse.json(summary);
}

import { NextResponse, type NextRequest } from 'next/server';
import { collectPrices } from '@/server/collector/collect-prices';

export const dynamic = 'force-dynamic';
// 120s (era 60s) — projeto está no plano Pro da Vercel (suporta até 300s).
// Com processamento em paralelo (ver GROUP_CONCURRENCY em collect-prices.ts)
// e lote maior por execução, 60s ficava justo demais como margem de segurança.
export const maxDuration = 120;

/**
 * Disparado periodicamente por um agendador externo (Vercel Cron ou
 * Supabase pg_cron + pg_net) — não por um usuário. Protegido por CRON_SECRET
 * via header Authorization: Bearer <secret>.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await collectPrices();
  return NextResponse.json(summary);
}

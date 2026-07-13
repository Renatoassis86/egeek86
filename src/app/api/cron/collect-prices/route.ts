import { NextResponse, type NextRequest } from 'next/server';
import { collectPrices } from '@/server/collector/collect-prices';

export const dynamic = 'force-dynamic';

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

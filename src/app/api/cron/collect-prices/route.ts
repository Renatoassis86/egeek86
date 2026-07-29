import { NextResponse, type NextRequest } from 'next/server';
import { collectPrices } from '@/server/collector/collect-prices';

export const dynamic = 'force-dynamic';
// 200s (era 120s) — MAX_OFFERS_PER_RUN subiu de 40 pra 150 (ver
// collect-prices.ts, achado real 2026-07-29: 88% das ofertas ativas nunca
// recebiam um segundo preço com o teto antigo). Plano Pro da Vercel suporta
// até 300s; o timeout_milliseconds do job pg_cron (net.http_get) também
// precisa ficar >= esse valor, senão o pg_net desiste antes da função
// terminar — ver migração/ajuste do job 'geek-deals-collect-prices'.
export const maxDuration = 200;

/**
 * Disparado periodicamente por um agendador externo (Vercel Cron ou
 * Supabase pg_cron + pg_net) — não por um usuário. Protegido por CRON_SECRET
 * via header Authorization: Bearer <secret>.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const secretParam = request.nextUrl.searchParams.get('key');
    if (secretParam !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const summary = await collectPrices();
  return NextResponse.json(summary);
}

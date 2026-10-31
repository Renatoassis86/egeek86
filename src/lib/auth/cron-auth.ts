import { NextResponse, type NextRequest } from 'next/server';

/**
 * Autorização de rotas /api/cron/*. Falha FECHADA: sem CRON_SECRET configurado
 * a rota recusa tudo (antes, sem a variável, a coleta ficava aberta ao mundo e
 * notify-price-drops aceitava o texto "Bearer undefined").
 * Aceita `Authorization: Bearer <secret>` (Vercel Cron e pg_cron) e, por
 * compatibilidade com o job pg_net existente, `?key=<secret>`.
 * Devolve uma NextResponse 401/500 quando negado, ou null quando autorizado.
 */
export function rejectUnlessCronAuthorized(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 500 });
  }
  const bearer = request.headers.get('authorization');
  if (bearer === `Bearer ${secret}`) return null;
  if (request.nextUrl.searchParams.get('key') === secret) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

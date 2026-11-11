import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { collectShopeePrices } from '@/server/collector/collect-shopee-prices';
import { isVertical, type Vertical } from '@/lib/catalog/verticais';

export const dynamic = 'force-dynamic';
// Plano Pro: até 300 s. O coletor para sozinho em 240 s (budgetMs) e continua
// no próximo tick, em lotes ordenados por last_checked_at.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  // Sem parâmetro = fila GAMER (comportamento de sempre). ?v=esporte = ofertas Shopee do esporte (descoberta de 2026-11-11), que o
  // collect-vertical (só Mercado Livre) não recoleta. Sem este tick as ofertas passam de 6 h e deixam de ser "clicáveis" na aprovação.
  const v = request.nextUrl.searchParams.get('v');
  if (v && !(isVertical(v) && v !== 'games')) return NextResponse.json({ error: 'vertical_invalida' }, { status: 400 });
  const summary = await collectShopeePrices({ budgetMs: 240_000, ...(v ? { vertical: v as Vertical } : {}) });
  // Observabilidade: o corpo da resposta do cron nao fica nos logs da Vercel; sem esta linha nao ha como saber
  // quantas ofertas cada tick cobriu nem por que parou (rate limit, orcamento de tempo). Sem segredos: so contagens.
  console.log(
    '[collect-shopee]',
    JSON.stringify({ ...summary, errors: summary.errors.slice(0, 5), errorCount: summary.errors.length })
  );
  return NextResponse.json(summary);
}

import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { collectVertical } from '@/server/collector/vertical/collect-vertical';

export const dynamic = 'force-dynamic';
// Mesmo teto do plano Pro usado por collect-shopee: o coletor para sozinho em 240 s (budgetMs) e continua no próximo tick.
export const maxDuration = 300;

/**
 * Coleta recorrente de UM departamento: GET /api/cron/collect-vertical?v=<tecnologia|eletroeletronicos|livros|eletrodomesticos|esporte>
 * (`&dry=1` só seleciona e conta, sem chamar a API). Protegida por CRON_SECRET (Bearer). Kill-switch por env
 * VERTICAL_<NOME>_ENABLED (desligado por padrão => {skipped:'disabled'}). NÃO está no vercel.json: o agendamento é decisão do dono.
 * Não toca a fila nem o estado do collect-prices gamer.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  const v = request.nextUrl.searchParams.get('v');
  if (!v) return NextResponse.json({ error: 'parametro_v_obrigatorio' }, { status: 400 });
  const dry = request.nextUrl.searchParams.get('dry') === '1';

  const summary = await collectVertical(v, { dryRun: dry, budgetMs: 240_000 });
  if (summary.skipped === 'invalid_vertical') return NextResponse.json(summary, { status: 400 });
  // Observabilidade: o corpo da resposta do cron não fica nos logs da Vercel. Só contagens, sem segredos.
  console.log('[collect-vertical]', JSON.stringify({ ...summary, errors: summary.errors.slice(0, 5), errorCount: summary.errors.length }));
  return NextResponse.json(summary);
}

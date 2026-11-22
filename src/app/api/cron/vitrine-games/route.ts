import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { rodarVitrineGames } from '@/server/messaging/vitrine-games';

export const dynamic = 'force-dynamic';
export const maxDuration = 150;

/**
 * VITRINE DE JOGOS ATE R$ 250 (dono, 2026-11-17): a cada 30 min, UMA mensagem no canal de games com a capa dos 10 principais e o diagnostico curto de cada um.
 *   VITRINE_GAMES=off   desliga (nao toca o banco nem o Telegram)
 *   ?dry=1              monta a legenda e a capa e responde so o resumo (nada e enviado)
 *   ?force=1            ignora a trava de 27 min (reenvio manual)
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const q = request.nextUrl.searchParams;
  try {
    const r = await rodarVitrineGames({ dry: q.get('dry') === '1', force: q.get('force') === '1' });
    const { capa, legenda, top, ...resto } = r as typeof r & { plataformas?: unknown };
    return NextResponse.json({ ...resto, jogos: top?.map((j) => ({ t: j.titulo.slice(0, 40), p: j.precoCentavos })), legendaChars: legenda?.length, capaBytes: capa?.length });
  } catch (e) {
    console.error('[cron vitrine-games] falhou:', e instanceof Error ? e.message.slice(0, 60) : e, '| causa:', String((e as { cause?: { message?: string; code?: string } })?.cause?.code ?? ''), String((e as { cause?: { message?: string } })?.cause?.message ?? '').slice(0, 200));
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}

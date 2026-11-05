import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { runCollectorHealth } from '@/server/observability/collector-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Avaliação de saúde do coletor (PROPOSTA, ata 2026-11-05). NÃO está no vercel.json: só passa a rodar quando o dono
 * adicionar a entrada (sugestão: a cada 10 min). Atrás de flags:
 *  - COLLECTOR_RUNS=1 (e migration 0025 aplicada), senão responde { skipped };
 *  - COLLECTOR_ALERTS=1 + TELEGRAM_ALERT_CHAT_ID para ENVIAR; sem isso é dry-run (só devolve o que enviaria; não escreve nada).
 * Mesma autenticação das demais /api/cron/* (CRON_SECRET, falha fechada).
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await runCollectorHealth());
  } catch (err) {
    console.error('[cron collector-health] falhou:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'falha ao avaliar' }, { status: 500 });
  }
}

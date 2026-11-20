import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { canaisSombra } from '@/lib/pistas/admissao';
import { startCollectorRun } from '@/server/collector/collector-runs';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * R-112, Fase 1 (SOMBRA): avalia as propostas recentes dos canais piloto (PISTA_SOMBRA='livros,impressao3d') com a admissao das pistas e grava
 * o que ENVIARIA/DESCARTARIA em pista_decisao. NAO ENVIA NADA. Flag desligada (padrao) = responde sem tocar o banco. Falha nunca vira 5xx do ciclo
 * de envio (rota propria, independente de /api/cron/group-messages). Mesma autenticacao das demais /api/cron/* (CRON_SECRET, falha fechada).
 * Cada chamada ligada deixa um registro em collector_runs (job 'pista-sombra', meta com o resumo ou o erro): a sombra nunca falha em silencio.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const canais = canaisSombra();
  const run = await startCollectorRun('pista-sombra', null);
  if (!canais.length) {
    await run.finish({ meta: { ligado: false } });
    return NextResponse.json({ ligado: false });
  }
  try {
    const { rodarSombra } = await import('@/server/pistas/sombra');
    const r = await rodarSombra();
    await run.finish({ meta: { ...r }, stoppedBecause: r.erro ?? r.parou ?? null });
    return NextResponse.json(r);
  } catch (e) {
    const erro = String((e as Error)?.message ?? e).slice(0, 200);
    await run.finish({ meta: { ligado: true, erro }, stoppedBecause: erro, fatal: true }).catch(() => undefined);
    return NextResponse.json({ ligado: true, erro });
  }
}

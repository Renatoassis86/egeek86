import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { canaisSombra } from '@/lib/pistas/admissao';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * R-112, Fase 1 (SOMBRA): avalia as propostas recentes dos canais piloto (PISTA_SOMBRA='livros,impressao3d') com a admissao das pistas e grava
 * o que ENVIARIA/DESCARTARIA em pista_decisao. NAO ENVIA NADA. Flag desligada (padrao) = responde sem tocar o banco. Falha nunca vira 5xx do ciclo
 * de envio (rota propria, independente de /api/cron/group-messages). Mesma autenticacao das demais /api/cron/* (CRON_SECRET, falha fechada).
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  if (!canaisSombra().length) return NextResponse.json({ ligado: false });
  try {
    const { rodarSombra } = await import('@/server/pistas/sombra');
    return NextResponse.json(await rodarSombra());
  } catch (e) {
    return NextResponse.json({ ligado: true, erro: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

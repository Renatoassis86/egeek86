import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db';
import { runQueueGeneration } from '@/server/identity-queue/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Geracao automatica da fila de classificacao de identidade (mesma funcao do botao "Atualizar fila").
 * Idempotente (1 item por oferta+eixo), com lock contra execucao simultanea e limite de tempo (40 s; o resto fica para a proxima rodada).
 * Mesma autenticacao das demais /api/cron/* (CRON_SECRET, falha fechada). So le ofertas e grava itens da fila; nao altera oferta
 * (salvo titulo ja decidido pelo dono, resolvido pela regra aprendida, como no botao).
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await runQueueGeneration(db, { budgetMs: 40_000 }));
  } catch (err) {
    console.error('[cron fila-classificacao] falhou:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'falha ao gerar a fila' }, { status: 500 });
  }
}

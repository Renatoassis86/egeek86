import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db';
import { aprovacaoAutoLigada, rodarAprovacaoAuto } from '@/server/aprovacao/auto';

export const dynamic = 'force-dynamic';
export const maxDuration = 200;

/**
 * APROVACAO CONTINUA AUTOMATICA (dono, 2026-11-12). Libera os cartoes obvios da Amazon (produto novo/rascunho/cobertura/fronteira) pelo MESMO
 * caminho de decidir() da /admin/aprovacao. Midia, modelo, armazenamento e preco ficam para o dono. Lote pequeno, uma transacao curta por cartao.
 *   APROVACAO_AUTO=off   desliga (responde {desligado:true}, nao toca o banco)
 *   ?dry=1               simula (cada cartao numa transacao revertida)      ?lote=40 (1..100)
 * Reversao: /admin/aprovacao (historico, "desfazer") com os decisionIds guardados em collector_runs.meta do job 'aprovacao-auto'.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  if (!aprovacaoAutoLigada()) return NextResponse.json({ desligado: true, como_ligar: 'remover APROVACAO_AUTO=off' });
  const q = request.nextUrl.searchParams;
  const lote = /^\d{1,3}$/.test(q.get('lote') ?? '') ? Number(q.get('lote')) : 40;
  try {
    const r = await rodarAprovacaoAuto(db, { lote, dry: q.get('dry') === '1' });
    console.log('[aprovacao-auto]', JSON.stringify({ cand: r.candidatos, tent: r.tentados, lib: r.liberadas, mast: r.masters, err: r.erros, ms: r.duracaoMs }));
    return NextResponse.json({ ...r, decisionIds: r.decisionIds.length });
  } catch (e) {
    console.error('[cron aprovacao-auto] falhou:', (e as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}

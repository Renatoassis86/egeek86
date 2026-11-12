import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized, rejectUnlessCronOrTestKeyDryRun } from '@/lib/auth/cron-auth';
import { runSeedVertical } from '@/server/collector/vertical/seed-vertical';

export const dynamic = 'force-dynamic';
// Limite do request: a fatia trabalha no máximo ~48 s (DEFAULT_BUDGET_MS) e grava o estado antes dos 60 s.
export const maxDuration = 60;

/**
 * Semeadura por departamento NO SERVIDOR (piloto aprovado pelo dono em 2026-11-12: só a loja Eletrônicos, 24 h). Uma FATIA da fila por execução.
 *
 *   GET /api/cron/semear-vertical            -> dry-run (lê a API oficial do ML e o banco; não cria master/oferta; não avança o cursor)
 *   GET /api/cron/semear-vertical?apply=1    -> grava (exige também SEMEADURA_TERMOS_APROVADOS=1)
 *   &lojas=eletroeletronicos                 -> sobrepõe SEMEADURA_LOJAS, SÓ em dry-run (teste manual antes de ligar o cron)
 *   &maxCalls=60                             -> reduz o teto de chamadas da fatia (nunca aumenta além de SEMEADURA_MAX_CALLS / 120)
 *
 * DESLIGADA por padrão: sem a env SEMEADURA_LOJAS (ex.: `eletroeletronicos`) a rota responde {skipped:'desligada'} sem tocar banco nem API.
 * Protegida por CRON_SECRET (Bearer). Para no primeiro 429 e recua 15, 30, 60, 120 min. Teto diário de segurança: 12.000 chamadas.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronOrTestKeyDryRun(request);
  if (denied) return denied;

  const q = request.nextUrl.searchParams;
  const apply = q.get('apply') === '1';
  const override = q.get('lojas');
  const lojas = !apply && override ? override : process.env.SEMEADURA_LOJAS;
  const mc = Number(q.get('maxCalls'));
  const envCap = Number(process.env.SEMEADURA_MAX_CALLS);
  const cap = Number.isFinite(envCap) && envCap > 0 ? Math.floor(envCap) : 120;
  const runCap = Number.isFinite(mc) && mc > 0 ? Math.min(Math.floor(mc), cap) : undefined;

  try {
    const summary = await runSeedVertical({ lojas, apply, runCap });
    // Observabilidade: o corpo do cron não fica nos logs da Vercel. Só contagens, sem segredos.
    console.log('[semear-vertical]', JSON.stringify({ ...summary, errors: summary.errors.slice(0, 3) }));
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[semear-vertical] falhou:', (err as Error).message.slice(0, 200));
    return NextResponse.json({ error: 'falha_na_semeadura', message: (err as Error).message.slice(0, 200) }, { status: 500 });
  }
}

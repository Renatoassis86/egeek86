import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/** Comparação em tempo constante (não vaza o tamanho/prefixo do segredo por tempo de resposta). */
function iguais(a: string | null, b: string): boolean {
  if (a == null) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

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
  if (iguais(bearer, `Bearer ${secret}`)) return null;
  if (iguais(request.nextUrl.searchParams.get('key'), secret)) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * Para rotas de coleta que o dono precisa AUDITAR em dry-run: além do CRON_SECRET, aceita a chave de teste (TESTE_LOJA_KEY,
 * Bearer) SOMENTE quando a chamada não grava (sem apply=1 e sem rollback). Qualquer escrita continua exigindo o CRON_SECRET.
 */
export function rejectUnlessCronOrTestKeyDryRun(request: NextRequest): NextResponse | null {
  const cron = rejectUnlessCronAuthorized(request);
  if (!cron) return null;
  const testKey = process.env.TESTE_LOJA_KEY;
  const q = request.nextUrl.searchParams;
  const grava = q.get('apply') === '1' || q.has('rollback');
  if (testKey && testKey.length >= 16 && !grava && request.headers.get('authorization') === `Bearer ${testKey}`) return null;
  return cron;
}

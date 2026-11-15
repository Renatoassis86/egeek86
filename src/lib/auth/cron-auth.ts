import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/** Comparação em tempo constante (não vaza o tamanho/prefixo do segredo por tempo de resposta). */
function iguais(a: string | null, b: string): boolean {
  if (a == null) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** CRON_ACEITA_KEY_NA_URL=off desliga o ?key= (padrao: aceita, ate confirmar que nenhum disparador externo ainda usa). */
export function keyNaUrlAceita(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CRON_ACEITA_KEY_NA_URL ?? '').toLowerCase() !== 'off';
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
  // ?key= na URL e LEGADO (o segredo vaza em logs). R2-9 (dono, 2026-11-14): cada uso e REGISTRADO (so a rota, nunca o segredo) para achar o disparador externo
  // (o banco nao tem pg_cron/pg_net); com CRON_ACEITA_KEY_NA_URL=off a URL deixa de valer. Remover so depois de zero usos no log.
  if (keyNaUrlAceita() && iguais(request.nextUrl.searchParams.get('key'), secret)) {
    console.warn('[cron-auth] autorizado por ?key= (legado):', request.nextUrl.pathname);
    return null;
  }
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

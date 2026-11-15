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
 * #73: descreve QUEM chamou (so metadados nao secretos: user-agent e IP de borda) para achar o disparador externo do collect-prices.
 * O cron da Vercel manda `user-agent: vercel-cron/1.0`; qualquer outro chamador autorizado e logado em [cron-auth] disparo externo.
 */
export function origemDoDisparo(headers: Pick<Headers, 'get'>): { vercelCron: boolean; ua: string; ip: string } {
  const ua = (headers.get('user-agent') ?? '').slice(0, 80);
  const ip = (headers.get('x-forwarded-for') ?? headers.get('x-real-ip') ?? '').split(',')[0]!.trim().slice(0, 45);
  return { vercelCron: ua.toLowerCase().startsWith('vercel-cron'), ua, ip };
}

/** CRON_BLOQUEIA_PG_NET=1: recusa (410) chamadas do pg_net do Supabase (UA `pg_net/x`), o 2o disparador achado em 2026-11-15. Padrao: desligado. */
export function bloqueiaPgNet(headers: Pick<Headers, 'get'>, env: Record<string, string | undefined> = process.env): boolean {
  return env.CRON_BLOQUEIA_PG_NET === '1' && (headers.get('user-agent') ?? '').toLowerCase().startsWith('pg_net');
}

function registraOrigem(request: NextRequest, via: 'bearer'): void {
  const o = origemDoDisparo(request.headers);
  if (!o.vercelCron) console.warn('[cron-auth] disparo externo:', request.nextUrl.pathname, `via=${via}`, `ua="${o.ua}"`, `ip=${o.ip}`, `host=${request.headers.get('host') ?? ''}`);
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
  if (iguais(bearer, `Bearer ${secret}`)) {
    if (bloqueiaPgNet(request.headers)) {
      console.warn('[cron-auth] pg_net recusado (CRON_BLOQUEIA_PG_NET=1):', request.nextUrl.pathname);
      return NextResponse.json({ error: 'disparador_pg_net_desligado' }, { status: 410 });
    }
    registraOrigem(request, 'bearer');
    return null;
  }
  // ?key= na URL e LEGADO (o segredo vaza em logs). R2-9 (dono, 2026-11-14): cada uso e REGISTRADO (so a rota, nunca o segredo) para achar o disparador externo
  // (o banco nao tem pg_cron/pg_net); com CRON_ACEITA_KEY_NA_URL=off a URL deixa de valer. Remover so depois de zero usos no log.
  if (keyNaUrlAceita() && iguais(request.nextUrl.searchParams.get('key'), secret)) {
    const o = origemDoDisparo(request.headers);
    console.warn('[cron-auth] autorizado por ?key= (legado):', request.nextUrl.pathname, `ua="${o.ua}"`, `ip=${o.ip}`);
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

import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { DEFAULT_LIMIT, MAX_LIMIT, runFilaApiOficial } from '@/server/identity-queue/api-oficial';
import type { FetchLike } from '@/lib/identity-queue/api-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * R4 da fila de classificacao: confirma na API OFICIAL do Mercado Livre (GET /items/{id}) os atributos das ofertas com identidade incerta.
 * Protegida como as demais /api/cron/* (CRON_SECRET, falha fechada). DRY-RUN por padrao: consulta a API e mostra o que faria, sem gravar nada na fila;
 * `?apply=1` grava a evidencia no item e aplica a decisao 'api_oficial' apenas quando a prova e inequivoca (reversivel pelo "Desfazer" da fila).
 *   ?limit=10   itens por execucao (padrao 10, maximo 40)
 * Quota: para no primeiro 429 (e fica 60 min sem consultar), teto de chamadas em 24 h (IDENTITY_API_DAILY_CAP, padrao 1200) e registro em collector_runs.
 * Amazon: sem API configurada (PA-API 5.0 nao credenciada); nao e consultada. Sem scraping.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const q = request.nextUrl.searchParams;
  const apply = q.get('apply') === '1';
  const limitRaw = q.get('limit');
  const limit = limitRaw == null ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return NextResponse.json({ error: 'limit_invalido', maximo: MAX_LIMIT }, { status: 400 });
  try {
    const out = await runFilaApiOficial(
      db,
      { fetchImpl: fetch as unknown as FetchLike, token: getValidAccessToken },
      { apply, limit }
    );
    return NextResponse.json({ modo: apply ? 'apply' : 'dry-run', ...out }, { status: out.skipped === 'migracao_0043_pendente' ? 409 : 200 });
  } catch (err) {
    console.error('[cron fila-api-oficial] falhou:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'falha ao consultar a API oficial' }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { amazonQueue, amazonQueueTotal, ingestAmazonRows, type AmzRow } from '@/server/collector/amazon-assisted';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Ingestão da coleta ASSISTIDA da Amazon (ata 2026-11-10-integracao-amazon-aliexpress.md). Chamada só pela aba logada do dono em
 * www.amazon.com.br (CORS restrito a essa origem), com token dedicado (AMAZON_INGEST_TOKEN). Sem o token na Vercel a rota
 * responde 503: é o kill-switch. O token só autoriza esta rota. Nenhum segredo da Amazon passa por aqui.
 */
const ALLOWED_ORIGINS = new Set(['https://www.amazon.com.br', 'https://amazon.com.br']);
const MAX_BODY = 400_000;
const MAX_ROWS = 40;

function cors(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

function authorized(request: NextRequest): 'ok' | 'sem_token_configurado' | 'negado' {
  const expected = process.env.AMAZON_INGEST_TOKEN;
  if (!expected || expected.length < 32) return 'sem_token_configurado';
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'negado';
}

function guard(request: NextRequest): NextResponse | null {
  const headers = cors(request);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') ?? '')) return NextResponse.json({ error: 'origem_nao_permitida' }, { status: 403, headers });
  const auth = authorized(request);
  if (auth === 'sem_token_configurado') return NextResponse.json({ error: 'desligado' }, { status: 503, headers });
  if (auth === 'negado') return NextResponse.json({ error: 'nao_autorizado' }, { status: 401, headers });
  return null;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

/** Fila de buscas: ?offset=0&n=40. Devolve {total, items:[{id,q}]}. */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const offset = Number(url.searchParams.get('offset') ?? 0) || 0;
  const n = Number(url.searchParams.get('n') ?? 40) || 40;
  const [items, total] = await Promise.all([amazonQueue(offset, n), amazonQueueTotal()]);
  return NextResponse.json({ total, items }, { headers: cors(request) });
}

/** Resultados de buscas: { rows: [{ id, r:[{a,t,p,l,s}] }] } (até 40 por chamada). */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: AmzRow[]; round?: string };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS).filter((r) => r && typeof r.id === 'string' && /^[0-9a-f-]{36}$/i.test(r.id) && Array.isArray(r.r)) : [];
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas' }, { status: 400, headers });

  const started = Date.now();
  const tag = process.env.AMAZON_ASSOCIATE_TAG || 'manusmonteiro-20';
  try {
    const { stats } = await ingestAmazonRows(rows, { tag, apply: true });
    const ms = Date.now() - started;
    try {
      await db.execute(sql`
        INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, price_confirmed, snapshots_written, errors, offers_created, meta)
        VALUES ('amazon-assistida', 'amazon', ${new Date(started).toISOString()}::timestamptz, now(), ${ms}, 'ok', ${rows.length}, ${stats.buscas}, ${stats.aceitos}, ${stats.novos + stats.atualizados}, 0, ${stats.novos}, ${JSON.stringify({ stats, round: body.round ?? null })}::jsonb)`);
    } catch (e) { console.error('[amazon-assistida] falha ao registrar collector_runs', e); }
    return NextResponse.json({ ok: true, stats }, { headers });
  } catch (e) {
    console.error('[amazon-assistida] erro', e);
    try {
      await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, status, selected, errors, meta) VALUES ('amazon-assistida', 'amazon', ${new Date(started).toISOString()}::timestamptz, now(), 'error', ${rows.length}, 1, ${JSON.stringify({ erro: e instanceof Error ? e.message : String(e) })}::jsonb)`);
    } catch { /* observabilidade nunca derruba a rota */ }
    return NextResponse.json({ error: 'falha_interna' }, { status: 500, headers });
  }
}

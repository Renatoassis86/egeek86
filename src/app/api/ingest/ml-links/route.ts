import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Links OFICIAIS de afiliado do Mercado Livre (gerados no Gerador de links do programa de afiliados pela aba logada do dono,
 * um por vez, para o par URL -> link ser exato). Decisão do dono em 2026-11-10. O link `meli.la/...` abre a página de afiliado
 * do dono (EGeek 86) com o produto em destaque, e o botão "Ir para produto" leva ao anúncio com o rastreio completo
 * (matt_tool_id, matt_tracing_id, source=affiliate-profile). Mesma proteção da rota da Amazon: origem fixa, token dedicado
 * (sem token = 503 = kill-switch). Cada gravação guarda o link antigo em collector_runs.meta (reversível).
 */
const ALLOWED_ORIGINS = new Set(['https://www.mercadolivre.com.br', 'https://mercadolivre.com.br']);
const MAX_ROWS = 100;
const LINK_RE = /^https:\/\/meli\.la\/[A-Za-z0-9]{4,20}$/;

function cors(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

function authorized(request: NextRequest): 'ok' | 'desligado' | 'negado' {
  const expected = process.env.ASSISTED_INGEST_TOKEN || process.env.AMAZON_INGEST_TOKEN;
  if (!expected || expected.length < 32) return 'desligado';
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'negado';
}

function guard(request: NextRequest): NextResponse | null {
  const headers = cors(request);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') ?? '')) return NextResponse.json({ error: 'origem_nao_permitida' }, { status: 403, headers });
  const auth = authorized(request);
  if (auth === 'desligado') return NextResponse.json({ error: 'desligado' }, { status: 503, headers });
  if (auth === 'negado') return NextResponse.json({ error: 'nao_autorizado' }, { status: 401, headers });
  return null;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

/** Fila: ofertas ativas do ML (games, visíveis) cujo affiliate_url ainda NÃO é meli.la. A mais barata de cada produto vem primeiro. ?n=40 */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const n = Math.min(Math.max(1, Number(new URL(request.url).searchParams.get('n') ?? 40) || 40), MAX_ROWS);
  const rows = await db.execute<{ id: string; url: string }>(sql`
    SELECT t.id, t.url FROM (
      SELECT o.id::text AS id, split_part(split_part(o.affiliate_url, '?', 1), '#', 1) AS url,
             row_number() OVER (PARTITION BY o.master_product_id ORDER BY o.current_price_cents ASC, o.id) AS rn, o.master_product_id
      FROM affiliate_offers o
      JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
      JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = 'games' AND m.vertical = 'games'
        AND o.current_price_cents > 0 AND o.affiliate_url NOT LIKE 'https://meli.la/%'
        AND o.affiliate_url ~ '^https://(produto|www)\\.mercadolivre\\.com\\.br/'
        AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'
    ) t ORDER BY t.rn ASC, t.master_product_id LIMIT ${n}`);
  const [tot] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = 'games' AND o.affiliate_url NOT LIKE 'https://meli.la/%'`);
  return NextResponse.json({ pendentes: tot?.n ?? 0, items: rows }, { headers: cors(request) });
}

/** { rows: [{ id, link }] } — link = https://meli.la/xxxx gerado para a URL daquela oferta. */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > 60_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: { id: string; link: string }[] };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, MAX_ROWS).filter((r) => r && /^[0-9a-f-]{36}$/i.test(String(r.id)) && LINK_RE.test(String(r.link)));
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas_validas' }, { status: 400, headers });

  const started = Date.now();
  const changed: { id: string; old: string; link: string }[] = [];
  for (const r of rows) {
    // Atualiza só oferta ativa do ML que ainda não tem meli.la; devolve o link antigo para o registro de reversão.
    const res = await db.execute<{ old: string }>(sql`
      UPDATE affiliate_offers o SET affiliate_url = ${r.link}, affiliate_link_pending = false, updated_at = now()
      FROM affiliate_offers prev, affiliate_networks nn
      WHERE o.id = ${r.id}::uuid AND prev.id = o.id AND nn.id = o.network_id AND nn.slug = 'mercado-livre'
        AND o.status = 'active' AND o.affiliate_url NOT LIKE 'https://meli.la/%'
      RETURNING prev.affiliate_url AS old`);
    if (res[0]) changed.push({ id: r.id, old: res[0].old, link: r.link });
  }
  try {
    await db.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, offers_created, errors, meta)
      VALUES ('ml-links-assistida', 'mercado-livre', ${new Date(started).toISOString()}::timestamptz, now(), ${Date.now() - started}, 'ok', ${rows.length}, ${rows.length}, 0, 0, ${JSON.stringify({ trocas: changed })}::jsonb)`);
  } catch (e) { console.error('[ml-links] falha ao registrar collector_runs', e); }
  return NextResponse.json({ ok: true, recebidos: rows.length, gravados: changed.length }, { headers });
}

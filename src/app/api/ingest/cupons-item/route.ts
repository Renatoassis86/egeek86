import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * [cupons-item] reaproveita a proteção da rota de links; o texto abaixo é do arquivo original.
 * Links OFICIAIS de afiliado do Mercado Livre (gerados no Gerador de links do programa de afiliados pela aba logada do dono,
 * um por vez, para o par URL -> link ser exato). Decisão do dono em 2026-11-10. O link `meli.la/...` abre a página de afiliado
 * do dono (EGeek 86) com o produto em destaque, e o botão "Ir para produto" leva ao anúncio com o rastreio completo
 * (matt_tool_id, matt_tracing_id, source=affiliate-profile). Mesma proteção da rota da Amazon: origem fixa, token dedicado
 * (sem token = 503 = kill-switch). Cada gravação guarda o link antigo em collector_runs.meta (reversível).
 */
const ALLOWED_ORIGINS = new Set(['https://www.mercadolivre.com.br', 'https://mercadolivre.com.br']);
const MAX_ROWS = 100;

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

/**
 * CUPOM POR ANÚNCIO (dono, 2026-11-11): a página do item do Mercado Livre embute o cupom aplicável ("R$ 315,46 com Cupom", campaign_id).
 * A aba logada do dono lê só os itens da fila (o mais barato de cada produto, com link oficial, sem leitura recente) e envia aqui.
 * O servidor só guarda (offer_coupon_reads) e valida: preço com cupom precisa ser menor que o preço atual da oferta.
 * Mesma proteção das outras rotas assistidas (origem fixa, token; sem token = 503).
 */
/** Fila: ofertas ativas do ML com link oficial cuja leitura de cupom está velha (> 90 min). ?n=40 */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const n = Math.min(Math.max(1, Number(new URL(request.url).searchParams.get('n') ?? 40) || 40), MAX_ROWS);
  const rows = await db.execute<{ id: string; url: string }>(sql`
    SELECT t.id, t.url FROM (
      SELECT o.id::text AS id, 'https://produto.mercadolivre.com.br/MLB-' || substr(o.external_item_id, 4) AS url,
             row_number() OVER (PARTITION BY o.master_product_id ORDER BY o.current_price_cents ASC, o.id) AS rn,
             (SELECT max(r.read_at) FROM offer_coupon_reads r WHERE r.offer_id = o.id) AS last_read
      FROM affiliate_offers o
      JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
      JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = m.vertical AND o.current_price_cents > 0
        AND o.affiliate_url LIKE 'https://meli.la/%' AND o.external_item_id ~ '^MLB[0-9]+$'
        AND (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved')
    ) t
    WHERE t.rn = 1 AND (t.last_read IS NULL OR t.last_read < now() - interval '90 minutes')
    ORDER BY t.last_read NULLS FIRST LIMIT ${n}`);
  return NextResponse.json({ items: rows }, { headers: cors(request) });
}

interface CouponRow { campaign_id?: string; label?: string; status?: string }

/** "R$ 315,46 com Cupom" -> 31546; null se não bate com o formato. */
function centsFromLabel(label: string): number | null {
  const m = label.match(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/);
  if (!m) return null;
  const v = parseInt(m[1].replace(/\./g, ''), 10) * 100 + (m[2] ? parseInt(m[2], 10) : 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** { rows: [{ id, coupons: [{ campaign_id, label, status }] }] } — coupons vazio = lido e sem cupom. */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > 120_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: { id: string; coupons?: CouponRow[] }[] };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, MAX_ROWS).filter((r) => r && /^[0-9a-f-]{36}$/i.test(String(r.id)));
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas_validas' }, { status: 400, headers });

  let lidas = 0;
  let comCupom = 0;
  for (const r of rows) {
    const offer = await db.execute<{ price: string }>(sql`
      SELECT o.current_price_cents::text AS price FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE o.id = ${r.id}::uuid AND nn.slug = 'mercado-livre' AND o.status = 'active' LIMIT 1`);
    if (!offer[0]) continue;
    const price = Number(offer[0].price);
    const valid = (Array.isArray(r.coupons) ? r.coupons : [])
      .map((c) => ({ campaign: /^\d{3,12}$/.test(String(c.campaign_id ?? '')) ? String(c.campaign_id) : null, label: String(c.label ?? '').slice(0, 120), status: String(c.status ?? '').slice(0, 40) }))
      .map((c) => ({ ...c, cents: centsFromLabel(c.label) }))
      .filter((c) => c.cents != null && c.cents > 0 && c.cents < price && /cupom/i.test(c.label));
    if (!valid.length) {
      await db.execute(sql`INSERT INTO offer_coupon_reads (offer_id, status, price_seen_cents) VALUES (${r.id}::uuid, 'sem_cupom', ${price}::int)`);
      lidas++;
      continue;
    }
    for (const c of valid) {
      await db.execute(sql`
        INSERT INTO offer_coupon_reads (offer_id, campaign_id, status, label, price_with_coupon_cents, price_seen_cents)
        VALUES (${r.id}::uuid, ${c.campaign}, ${c.status || null}, ${c.label}, ${c.cents}::int, ${price}::int)`);
      comCupom++;
    }
    lidas++;
  }
  return NextResponse.json({ ok: true, recebidos: rows.length, lidas, com_cupom: comCupom }, { headers });
}

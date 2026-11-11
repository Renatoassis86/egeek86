import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { listActiveCoupons, ingestCouponBatch, isMissingCouponTable, recordCouponRun } from '@/server/coupons/store';
import { isNetwork, validateBatch } from '@/server/coupons/normalize';
import type { CouponNetwork } from '@/server/coupons/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ingestão da varredura ASSISTIDA de cupons (ata 2026-11-10, seção 3; ADR 0009 e decisão do dono de 2026-11-10). Chamada só pela
 * aba logada do dono em mercadolivre.com.br ou shopee.com.br (CORS fixo), SOMENTE LEITURA. Mesma proteção das rotas da Amazon e
 * dos links do ML: token dedicado (ASSISTED_INGEST_TOKEN, com fallback AMAZON_INGEST_TOKEN); sem token = 503 = kill-switch.
 * Quem decide o estado do cupom é o servidor (src/server/coupons/vigencia.ts), nunca a aba. Nada é gerado nem completado:
 * leitura sem fonte, texto bruto ou valor coerente é rejeitada com o motivo.
 */
const ALLOWED_ORIGINS = new Map<string, CouponNetwork>([
  ['https://www.mercadolivre.com.br', 'mercado-livre'],
  ['https://mercadolivre.com.br', 'mercado-livre'],
  ['https://shopee.com.br', 'shopee'],
  ['https://www.shopee.com.br', 'shopee'],
]);
const MAX_BODY_BYTES = 400_000;

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

/** Cupons ativos já conhecidos (não vencidos), para a rotina reverificar. ?rede=mercado-livre|shopee&n=200 (padrão: a rede da origem). */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const originNet = ALLOWED_ORIGINS.get(request.headers.get('origin') ?? '')!;
  const q = new URL(request.url).searchParams;
  const redeParam = q.get('rede');
  if (redeParam && (!isNetwork(redeParam) || redeParam !== originNet)) return NextResponse.json({ error: 'rede_diferente_da_origem' }, { status: 400, headers });
  const n = Math.min(Math.max(1, Number(q.get('n') ?? 200) || 200), 500);
  try {
    const items = await listActiveCoupons(originNet, n);
    return NextResponse.json(
      {
        rede: originNet,
        total: items.length,
        items: items.map((c) => ({
          id: c.id, codigo: c.code, tipo: c.kind, valor: c.valueNum, valor_unidade: c.valueUnit, estado: c.state,
          fonte_url: c.sourceUrl, escopo: c.scopeKind, validade_fim: c.validUntil, ultima_leitura: c.lastSeenAt, verificado_em: c.verifiedAt,
        })),
      },
      { headers }
    );
  } catch (e) {
    if (isMissingCouponTable(e)) return NextResponse.json({ error: 'migration_0029_nao_aplicada' }, { status: 503, headers });
    console.error('[cupons] GET falhou', e);
    return NextResponse.json({ error: 'erro_interno' }, { status: 500, headers });
  }
}

/** { rede, fonte_url, lidos_em, leitura_completa?, conta_lida?, cupons: [...] } — contrato em docs/cupons-2026-11-10.md. */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const originNet = ALLOWED_ORIGINS.get(request.headers.get('origin') ?? '')!;
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }

  const v = validateBatch(body, new Date());
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers });
  // A rede do lote tem que ser a do portal de onde a aba fala (aba da Shopee não grava cupom do Mercado Livre).
  if (v.context.network !== originNet) return NextResponse.json({ error: 'rede_diferente_da_origem' }, { status: 400, headers });
  if (!v.coupons.length && !v.complete) {
    return NextResponse.json({ error: 'sem_cupons_validos', rejeitados: v.rejected.slice(0, 20) }, { status: 400, headers });
  }

  const started = Date.now();
  try {
    const summary = await ingestCouponBatch(v);
    await recordCouponRun(v.context.network, started, summary, {
      fonte_url: v.context.batchSourceUrl, lidos_em: v.context.readAt, leitura_completa: v.complete, conta_lida: v.context.readAccount,
    });
    return NextResponse.json({ ok: true, ...summary, rejeitados: summary.rejeitados.slice(0, 50) }, { headers });
  } catch (e) {
    if (isMissingCouponTable(e)) return NextResponse.json({ error: 'migration_0029_nao_aplicada' }, { status: 503, headers });
    console.error('[cupons] POST falhou', e);
    return NextResponse.json({ error: 'erro_interno' }, { status: 500, headers });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { COUPON_ORIGINS_BY_NETWORK, originAllowedForNetwork } from '@/lib/coupons/page-read';

/**
 * Proteção das rotas de ingestão assistida de cupom (aba logada do dono): origem fixa POR REDE + token. Sem token configurado = 503 (kill-switch).
 * Token: COUPON_INGEST_TOKEN (dedicado, preferido); enquanto não existir, vale o das outras rotas assistidas (ASSISTED_INGEST_TOKEN /
 * AMAZON_INGEST_TOKEN), para o Chrome continuar funcionando sem troca. O token nunca é logado nem devolvido.
 * Origem por rede: a aba do Mercado Livre só lê/grava a rede mercado-livre; a da Amazon só amazon; a da Shopee só shopee (originAllowedForNetwork).
 */
export const COUPON_ALLOWED_ORIGINS = new Set(Object.values(COUPON_ORIGINS_BY_NETWORK).flat());

export function couponCors(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return COUPON_ALLOWED_ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

export function couponAuthorized(request: NextRequest, env: Record<string, string | undefined> = process.env): 'ok' | 'desligado' | 'negado' {
  const expected = env.COUPON_INGEST_TOKEN || env.ASSISTED_INGEST_TOKEN || env.AMAZON_INGEST_TOKEN;
  if (!expected || expected.length < 32) return 'desligado';
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'negado';
}

/** null = liberado; senão a resposta de recusa. `rede` padrão = Mercado Livre (rotas antigas). A origem tem de ser a da rede pedida. */
export function couponGuard(request: NextRequest, rede: string = 'mercado-livre'): NextResponse | null {
  const headers = couponCors(request);
  if (!originAllowedForNetwork(request.headers.get('origin') ?? '', rede)) return NextResponse.json({ error: 'origem_nao_permitida' }, { status: 403, headers });
  const auth = couponAuthorized(request);
  if (auth === 'desligado') return NextResponse.json({ error: 'desligado' }, { status: 503, headers });
  if (auth === 'negado') return NextResponse.json({ error: 'nao_autorizado' }, { status: 401, headers });
  return null;
}

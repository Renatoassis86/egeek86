import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { isShopeeAffiliateConfigured } from '@/server/collector/sources/shopee-auth';
import { fetchShopeeConversions } from '@/server/affiliate-reports/shopee-api';
import { upsertConversions } from '@/server/affiliate-reports/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Importa conversões da Shopee Affiliate Open API (conversionReport) numa janela
 * móvel (?days=7, máx. 90). NÃO está agendada em vercel.json (decisão: só depois
 * de validar credenciais e a migration 0021). Protegida por CRON_SECRET.
 * Falha fechada: sem credenciais devolve 503 e não grava nada.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  if (!isShopeeAffiliateConfigured()) {
    return NextResponse.json({ error: 'shopee_credentials_missing' }, { status: 503 });
  }
  const days = Number(request.nextUrl.searchParams.get('days') ?? 7);
  try {
    const rows = await fetchShopeeConversions(Number.isFinite(days) ? days : 7);
    const summary = await upsertConversions(rows, { batch: `shopee:${new Date().toISOString()}` });
    return NextResponse.json({ ok: true, ...summary, rejected: summary.rejected.length });
  } catch (e) {
    console.error('[cron import-shopee-conversions] falhou:', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'falha' }, { status: 502 });
  }
}

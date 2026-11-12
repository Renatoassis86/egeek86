import { NextResponse, type NextRequest } from 'next/server';
import { couponCors, couponGuard } from '@/server/coupons/ingest-guard';
import { PAGE_NETWORKS, type PageNetwork } from '@/lib/coupons/page-read';
import { parseHeartbeat } from '@/lib/coupons/heartbeat';
import { gravarBatimento } from '@/server/coupons/heartbeat-store';

export const dynamic = 'force-dynamic';

/**
 * BATIMENTO do loop de leitura de cupom 24 h (scripts/chrome/cupons-24h.js), um por ciclo e a cada pausa/parada.
 *
 *   POST /api/ingest/cupons-heartbeat?rede=amazon|shopee
 *     { estado: 'ok'|'pausado'|'parado', motivo?, ciclo, fila, lidas, enviadas, descartadas, erros, versao? }  -> { ok: true }
 *
 * Mesma proteção das rotas de cupom (origem fixa POR REDE + token; sem token = 503), corpo até 2 KB. Só números e códigos curtos são
 * gravados (collector_runs, job 'cupons-batimento'). O vigia (agente de cupons) avisa se uma rede ficar mais de 60 min sem batimento ok.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: couponCors(request) });
}

export async function POST(request: NextRequest) {
  const rede = new URL(request.url).searchParams.get('rede') ?? '';
  const denied = couponGuard(request, rede); // origem da rede + token, antes de ler o corpo
  if (denied) return denied;
  const headers = couponCors(request);
  if (!(PAGE_NETWORKS as readonly string[]).includes(rede)) return NextResponse.json({ error: 'rede_invalida' }, { status: 400, headers });
  const text = await request.text();
  if (text.length > 2_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const parsed = parseHeartbeat(rede as PageNetwork, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400, headers });
  const gravado = await gravarBatimento(parsed.value);
  return NextResponse.json({ ok: true, gravado }, { headers });
}

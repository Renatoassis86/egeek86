import { NextResponse, type NextRequest } from 'next/server';
import { couponCors, couponGuard } from '@/server/coupons/ingest-guard';
import { listarFilaRevalidacao, listasDeCupons, resolverUrlsLeitura } from '@/server/coupons/revalidation-queue';
import { AGULHA } from '@/lib/coupons/agulha';
import { adapterFor } from '@/lib/coupons/network-adapters';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * FILA DE REVALIDAÇÃO de cupom (Agente de Cupons, cupom na agulha). Mesma proteção das rotas assistidas (origem fixa + token; sem token = 503).
 *
 *   GET /api/ingest/cupons-revalidar?n=20[&rede=mercado-livre]
 *     -> { rede, status_rede, meta_releitura_min, items: [{ id, url, prioridade, motivo, ultima_leitura_min }], listas: [{ rede, fonte_url, ultima_leitura_min, devida, cupons_vivos }] }
 *   items vêm na ordem em que devem ser lidos (cupom já divulgado -> mensagem pronta -> cupom visto há pouco -> ...; ver revalidation-queue.ts).
 *   Para cada item a aba abre `url`, lê o "preço com cupom" e envia o resultado para POST /api/ingest/cupons-item (contrato inalterado).
 *   listas com devida = true: reler a lista de cupons do portal (leitura completa: o que sumiu é baixado como vencido).
 *
 * Só o Mercado Livre tem leitura autorizada. Amazon e Shopee respondem 200 com items vazios e o motivo (decisão do dono pendente).
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: couponCors(request) });
}

export async function GET(request: NextRequest) {
  const denied = couponGuard(request);
  if (denied) return denied;
  const headers = couponCors(request);
  const params = new URL(request.url).searchParams;
  const rede = params.get('rede') ?? 'mercado-livre';
  const adapter = adapterFor(rede);
  if (!adapter) return NextResponse.json({ error: 'rede_desconhecida' }, { status: 400, headers });
  if (adapter.itemRead !== 'ativo') {
    return NextResponse.json({ rede, status_rede: adapter.itemRead, meta_releitura_min: AGULHA.REREAD_TARGET_MIN, items: [], listas: [], falta: adapter.falta }, { headers });
  }
  const n = Math.min(Math.max(1, Number(params.get('n') ?? 20) || 20), 40);
  const [fila, listas] = await Promise.all([listarFilaRevalidacao(n), listasDeCupons()]);
  const items = await resolverUrlsLeitura(fila);
  return NextResponse.json({ rede, status_rede: 'ativo', meta_releitura_min: AGULHA.REREAD_TARGET_MIN, items, listas: listas.filter((l) => l.rede === rede) }, { headers });
}

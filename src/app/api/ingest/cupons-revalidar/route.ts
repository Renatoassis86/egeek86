import { NextResponse, type NextRequest } from 'next/server';
import { couponCors, couponGuard } from '@/server/coupons/ingest-guard';
import { listarFilaRevalidacao, listasDeCupons, resolverUrlsLeitura, resolverUrlsLeituraRede } from '@/server/coupons/revalidation-queue';
import { ingestPageReads } from '@/server/coupons/page-reads';
import { PAGE_NETWORKS, type PageNetwork } from '@/lib/coupons/page-read';
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
 * Amazon e Shopee (autorizadas pelo dono em 2026-11-11): mesma fila por ?rede=amazon|shopee. items: [{ id, url, ref, preco_cents, prioridade, motivo, ultima_leitura_min }].
 * A aba logada da própria rede (origem fixa por rede) abre `url` SEM raspagem em massa: só a fila, no ritmo da meta de releitura.
 *
 *   POST /api/ingest/cupons-revalidar?rede=amazon|shopee   { rows: [{ id, ref, price_seen_cents, coupons: [{ label, price_with_cents?, name?, code? }] }] }
 *     -> { ok, rede, recebidos, lidas, com_cupom, recusadas: { motivo: n } }
 *   `name` (título da promoção como a página escreve, até 80) e `code` (código digitável, 4 a 20) são opcionais, validados no servidor e nunca inventados: a mensagem mostra o nome do cupom com prioridade.
 *   `ref` = ASIN / itemId lido na página (confere que abriu o item certo); `price_seen_cents` = preço do item lido na página;
 *   `coupons` vazio = lido e sem cupom. Preço com cupom: o que a página mostra (`price_with_cents`) ou, sem ele, o servidor deriva da regra
 *   escrita no selo; selo sem regra legível é descartado. Grava offer_coupon_reads com source amazon-pagina / shopee-pagina.
 *   Mercado Livre continua em POST /api/ingest/cupons-item (contrato inalterado). Mesmas proteções: origem fixa por rede, token, sem token = 503.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: couponCors(request) });
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const rede = params.get('rede') ?? 'mercado-livre';
  const denied = couponGuard(request, rede);
  if (denied) return denied;
  const headers = couponCors(request);
  const adapter = adapterFor(rede);
  if (!adapter) return NextResponse.json({ error: 'rede_desconhecida' }, { status: 400, headers });
  if (adapter.itemRead !== 'ativo') {
    return NextResponse.json({ rede, status_rede: adapter.itemRead, meta_releitura_min: AGULHA.REREAD_TARGET_MIN, items: [], listas: [], falta: adapter.falta }, { headers });
  }
  const n = Math.min(Math.max(1, Number(params.get('n') ?? 20) || 20), 40);
  if ((PAGE_NETWORKS as readonly string[]).includes(rede)) {
    const fila = await listarFilaRevalidacao(n, rede);
    return NextResponse.json({ rede, status_rede: 'ativo', meta_releitura_min: AGULHA.REREAD_TARGET_MIN, items: resolverUrlsLeituraRede(fila, rede as PageNetwork), listas: [] }, { headers });
  }
  const [fila, listas] = await Promise.all([listarFilaRevalidacao(n), listasDeCupons()]);
  const items = await resolverUrlsLeitura(fila);
  return NextResponse.json({ rede, status_rede: 'ativo', meta_releitura_min: AGULHA.REREAD_TARGET_MIN, items, listas: listas.filter((l) => l.rede === rede) }, { headers });
}

/** Leituras de cupom da página do item (Amazon/Shopee). Corpo até 120 KB, até 40 linhas. */
export async function POST(request: NextRequest) {
  const rede = new URL(request.url).searchParams.get('rede') ?? '';
  const denied = couponGuard(request, rede); // origem da rede + token, antes de ler o corpo
  if (denied) return denied;
  const headers = couponCors(request);
  if (!(PAGE_NETWORKS as readonly string[]).includes(rede)) return NextResponse.json({ error: 'rede_invalida' }, { status: 400, headers });
  const adapter = adapterFor(rede);
  if (!adapter || adapter.itemRead !== 'ativo') return NextResponse.json({ error: 'rede_sem_leitura_ativa' }, { status: 409, headers });
  const text = await request.text();
  if (text.length > 120_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = (Array.isArray(body?.rows) ? body.rows : []).slice(0, 40).filter((r: unknown) => r && typeof r === 'object' && /^[0-9a-f-]{36}$/i.test(String((r as { id?: unknown }).id)));
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas_validas' }, { status: 400, headers });
  const stats = await ingestPageReads(rede as PageNetwork, rows as Parameters<typeof ingestPageReads>[1]);
  return NextResponse.json({ ok: true, rede, ...stats }, { headers });
}

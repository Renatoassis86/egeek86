// Reconferência de preço AO VIVO antes do envio (onda 2, 2026-11-11). Sem server-only, sem banco: toda a rede e toda a
// gravação entram por injeção (`LiveDeps`), então o teste roda com fetch injetado e nada sai da máquina.
//
// Por que existe: o Mercado Livre é reconferido a cada 30 a 60 min pelo coletor, então boa parte das ofertas tinha o último
// preço com mais de 30 min na hora de enviar e morria na revalidação (medido). Agora, se o preço gravado está velho, consulta-se
// a API OFICIAL da loja da oferta (Mercado Livre: itens; Shopee: lookup do item), grava-se o snapshot como o coletor faria e só
// segue se o preço vivo estiver dentro de 2% do detectado e o item continuar ativo e com estoque. Amazon NÃO consulta ao vivo
// (segue a regra de frescor da coleta assistida). Limite de 8 s por consulta; falha de rede = expirar sem enviar.

import { RULES, netKind, type NetKind } from '@/lib/messaging/group-rules';
import type { FetchLike } from '@/lib/messaging/telegram-send';
import { avaliarOscilacao, motivoOscilacao, type PricePoint } from '@/lib/messaging/price-guard';

export interface LiveTarget {
  offerId: string;
  /** Oferta do candidato ('original') ou concorrente mais barata com preço velho ('competitor'). */
  role: 'original' | 'competitor';
  masterProductId?: string;
  networkSlug: string;
  networkName?: string;
  /** affiliate_offers.external_ref (ML: id do catálogo; Shopee: `shopee-<itemId>`). */
  externalRef: string | null;
  /** id do anúncio (affiliate_offers.external_item_id, ex.: MLB123...). Preferido sobre o id extraído da URL (que pode ser meli.la). */
  externalItemId?: string | null;
  /** URL do anúncio (ML: contém o id do item, ex.: produto.mercadolivre.com.br/MLB-123456). */
  affiliateUrl: string | null;
  /** Vendedor da oferta (ML: seller_id) para conferir que o anúncio é o mesmo. */
  sellerExternalId: string | null;
  storedPriceCents: number;
  confirmedAt: Date | null;
  /** Preço detectado do candidato (originais). null = só conferir disponibilidade. */
  detectedPriceCents: number | null;
  /**
   * Anúncio identificado de forma confiável (external_item_id ou id MLB na URL)? `false` = oferta casada só por vendedor + catálogo:
   * a reconferência ao vivo nunca é pulada e a falha vira `link_sem_conferencia` (2026-11-14). `undefined` = comportamento antigo.
   */
  listingIdTrusted?: boolean;
  /** Snapshots de preço das últimas 24 h (mais o último anterior à janela): base do bloqueio `preco_oscilando`. */
  priceHistory?: PricePoint[];
}

export type LiveQuote =
  | { ok: true; priceCents: number }
  | { ok: false; kind: 'unavailable' | 'error' | 'unsupported'; reason: string };

export interface LiveDeps {
  fetchImpl?: FetchLike;
  /** Token OAuth do Mercado Livre (a fonte de coleta existente, mercado-livre-auth). */
  meliToken?: () => Promise<string>;
  /** Lookup oficial do item Shopee (sources/shopee.ts lookupShopeeItem). Lança em falha de API. */
  shopeeLookup?: (itemId: string) => Promise<{ status: 'ok'; priceCents: number } | { status: 'unavailable'; reason: string }>;
  /** Grava o snapshot como o coletor (recordPriceSnapshot source 'api' + last_price_confirmed_at). */
  record?: (t: LiveTarget, priceCents: number) => Promise<void>;
  timeoutMs?: number;
}

// Mesma base e mesmo caminho da coleta (src/server/collector/sources/mercado-livre.ts): /products/{catalog}/items.
const ML_PRODUCTS = 'https://api.mercadolibre.com/products';

/** Id do anúncio (MLB123...) tirado da URL do anúncio. URL de catálogo (/p/MLB...) não é anúncio: null. */
export function meliItemIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)mercadolivre\.com\.br$|(^|\.)mercadolibre\.com$/i.test(u.hostname)) return null;
  if (/\/p\/MLB/i.test(u.pathname)) return null;
  const m = /\/(MLB)-?(\d{6,})/i.exec(u.pathname);
  return m ? `MLB${m[2]}` : null;
}

export function shopeeItemIdFromRef(externalRef: string | null | undefined): string | null {
  const m = /^shopee-(\d{1,19})$/.exec(externalRef ?? '');
  return m ? m[1] : null;
}

const asKind = (t: Pick<LiveTarget, 'networkSlug' | 'networkName'>): NetKind => netKind({ networkSlug: t.networkSlug, networkName: t.networkName ?? t.networkSlug });

/** O preço gravado está velho (ou não existe) para o envio? */
export function isStale(confirmedAt: Date | null, now: Date): boolean {
  return !confirmedAt || (now.getTime() - confirmedAt.getTime()) / 60_000 > RULES.LIVE_STALE_AFTER_MIN;
}

/** Precisa de consulta ao vivo? ML: preço velho. Shopee: sempre nas originais do envio automático, senão preço velho. Amazon/outras: nunca. */
export function needsLive(t: LiveTarget, now: Date, humanApproved: boolean): boolean {
  const k = asKind(t);
  // Anúncio não identificado (só vendedor + catálogo): o preço gravado pode ser de um anúncio irmão; nunca confiar no frescor.
  if (k === 'ml' && t.role === 'original' && t.listingIdTrusted === false) return true;
  if (k === 'ml') return isStale(t.confirmedAt, now);
  if (k === 'shopee') return t.role === 'original' && !humanApproved ? true : isStale(t.confirmedAt, now);
  return false;
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;

async function meliQuote(t: LiveTarget, deps: LiveDeps): Promise<LiveQuote> {
  // Terceiros: /items?ids= devolve 403. O caminho que funciona é o da coleta: /products/{catalog_product_id}/items (vencedores).
  const catalogId = t.externalRef && /^MLB\d+$/.test(t.externalRef) ? t.externalRef : null;
  if (!catalogId) return { ok: false, kind: 'unsupported', reason: 'ml_sem_catalogo' };
  const itemId = t.externalItemId ?? meliItemIdFromUrl(t.affiliateUrl);
  if (!itemId && !t.sellerExternalId) return { ok: false, kind: 'unsupported', reason: 'ml_sem_id_do_anuncio' };
  if (!deps.meliToken) return { ok: false, kind: 'error', reason: 'ml_sem_token' };
  const token = await deps.meliToken();
  const res = await (deps.fetchImpl ?? defaultFetch)(`${ML_PRODUCTS}/${catalogId}/items?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
  // "No winners found" (404) = sem vendedor ativo agora (mesma semântica da coleta), não erro.
  if (res.status === 404) return { ok: false, kind: 'unavailable', reason: 'ml_sem_vencedores' };
  if (res.status !== 200) return { ok: false, kind: 'error', reason: `ml_http_${res.status}` };
  const data = (await res.json()) as { results?: Array<{ item_id?: string; price?: number; condition?: string | null; seller_id?: number | string }> };
  const rows = Array.isArray(data?.results) ? data.results : null;
  if (!rows) return { ok: false, kind: 'error', reason: 'ml_resposta_invalida' };
  const bySeller = itemId ? [] : rows.filter((r) => r.seller_id != null && String(r.seller_id) === t.sellerExternalId);
  // Vários anúncios do mesmo vendedor no catálogo com preços diferentes e sem id do anúncio: não dá para saber qual é o da oferta.
  if (!itemId && new Set(bySeller.map((r) => Math.round(Number(r.price) * 100))).size > 1) return { ok: false, kind: 'unavailable', reason: 'ml_vendedor_com_varios_anuncios' };
  const row = itemId ? rows.find((r) => r.item_id === itemId) : bySeller[0];
  if (!row) return { ok: false, kind: 'unavailable', reason: 'ml_anuncio_fora_dos_vencedores' };
  if (row.condition !== 'new') return { ok: false, kind: 'unavailable', reason: 'ml_condicao_nao_nova' };
  const cents = Math.round(Number(row.price) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, kind: 'error', reason: 'ml_preco_invalido' };
  return { ok: true, priceCents: cents };
}

async function shopeeQuote(t: LiveTarget, deps: LiveDeps): Promise<LiveQuote> {
  const itemId = shopeeItemIdFromRef(t.externalRef);
  if (!itemId) return { ok: false, kind: 'unsupported', reason: 'shopee_sem_id_do_item' };
  if (!deps.shopeeLookup) return { ok: false, kind: 'error', reason: 'shopee_sem_credenciais' };
  const r = await deps.shopeeLookup(itemId);
  if (r.status === 'unavailable') return { ok: false, kind: 'unavailable', reason: `shopee_${r.reason}` };
  return { ok: true, priceCents: r.priceCents };
}

/** Consulta ao vivo de UMA oferta, com limite de 8 s. Qualquer exceção ou estouro vira `error` (nunca lança). */
export async function fetchLiveQuote(t: LiveTarget, deps: LiveDeps): Promise<LiveQuote> {
  const k = asKind(t);
  if (k === 'amazon') return { ok: false, kind: 'unsupported', reason: 'amazon_sem_consulta_ao_vivo' };
  if (k !== 'ml' && k !== 'shopee') return { ok: false, kind: 'unsupported', reason: 'rede_sem_consulta_ao_vivo' };
  const ms = deps.timeoutMs ?? RULES.LIVE_CHECK_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<LiveQuote>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, kind: 'error', reason: `timeout_${Math.round(ms / 1000)}s` }), ms);
  });
  try {
    return await Promise.race([k === 'ml' ? meliQuote(t, deps) : shopeeQuote(t, deps), timeout]);
  } catch (e) {
    return { ok: false, kind: 'error', reason: `rede: ${e instanceof Error ? e.message.slice(0, 80) : 'erro'}` };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface LiveCheckLog {
  offerId: string;
  role: LiveTarget['role'];
  checked: boolean;
  storedCents: number;
  liveCents?: number;
  divergencePct?: number;
  recorded?: boolean;
  verdict: 'ok' | 'fail' | 'skipped' | 'ignored';
  reason?: string;
}

export interface LivePhaseInput {
  now: Date;
  targets: LiveTarget[];
  /** 'radar': falha de um item tira o item (e não derruba tudo). */
  mode: 'single' | 'radar';
  /** Linha aprovada por um humano: Shopee só consulta se o preço estiver velho. */
  humanApproved: boolean;
  deps: LiveDeps;
}

export interface LivePhaseResult {
  ok: boolean;
  reason?: string;
  /** Ofertas cujo preço foi confirmado ao vivo (e gravado). */
  verified: string[];
  /** Radar: ofertas originais que falharam e saem do radar. */
  droppedOfferIds: string[];
  /** O preço vivo difere do que estava gravado em alguma oferta. */
  changed: boolean;
  logs: LiveCheckLog[];
}

const pct = (x: number) => x.toFixed(1).replace('.', ',');

/**
 * Fase de reconferência ao vivo. Regras:
 *  - original que precisa de consulta e falha (rede, API, sem estoque, inativo, outro vendedor) expira a mensagem;
 *  - original com preço vivo fora de 2% do detectado expira;
 *  - concorrente mais barata com preço velho: indisponível é ignorada (deixa de ser concorrência), erro de rede expira (não dá
 *    para afirmar "menor preço" sem saber);
 *  - consulta OK grava o snapshot (como o coletor) antes de qualquer decisão.
 */
export async function runLivePhase(input: LivePhaseInput): Promise<LivePhaseResult> {
  const { now, targets, deps } = input;
  const out: LivePhaseResult = { ok: true, verified: [], droppedOfferIds: [], changed: false, logs: [] };
  const tasks = targets.map(async (t) => {
    const log: LiveCheckLog = { offerId: t.offerId, role: t.role, checked: false, storedCents: t.storedPriceCents, verdict: 'skipped' };
    // Porta 1 (2026-11-14): oferta que oscila de preço não sai em mensagem até estabilizar, mesmo com preço gravado fresco.
    if (t.role === 'original' && t.priceHistory?.length) {
      const osc = avaliarOscilacao(t.priceHistory, now);
      if (osc.oscilando) {
        log.verdict = 'fail';
        log.reason = motivoOscilacao(osc);
        return log;
      }
    }
    if (!needsLive(t, now, input.humanApproved)) {
      if (t.role === 'original' && asKind(t) === 'amazon') log.reason = 'amazon_segue_a_regra_de_frescor_da_coleta_assistida';
      return log;
    }
    log.checked = true;
    const q = await fetchLiveQuote(t, deps);
    if (!q.ok) {
      // Porta 4: sem identificação do anúncio, a falha da conferência ao vivo é `link_sem_conferencia`.
      log.reason = t.role === 'original' && t.listingIdTrusted === false ? `link_sem_conferencia: ${q.reason}` : q.reason;
      if (t.role === 'original') log.verdict = 'fail';
      else log.verdict = q.kind === 'error' ? 'fail' : 'ignored';
      return log;
    }
    log.liveCents = q.priceCents;
    if (deps.record) {
      try {
        await deps.record(t, q.priceCents);
        log.recorded = true;
      } catch (e) {
        log.recorded = false;
        log.verdict = 'fail';
        log.reason = `falha ao gravar o snapshot: ${e instanceof Error ? e.message.slice(0, 80) : 'erro'}`;
        return log;
      }
    }
    if (t.role === 'original' && t.detectedPriceCents != null && t.detectedPriceCents > 0) {
      const div = (Math.abs(q.priceCents - t.detectedPriceCents) / t.detectedPriceCents) * 100;
      log.divergencePct = Math.round(div * 100) / 100;
      if (div > RULES.SEND_PRICE_TOLERANCE_PCT) {
        log.verdict = 'fail';
        log.reason = `preço ao vivo divergiu ${pct(div)}% do detectado (${t.detectedPriceCents} para ${q.priceCents} centavos)`;
        return log;
      }
    }
    log.verdict = 'ok';
    return log;
  });
  out.logs = await Promise.all(tasks);
  for (const log of out.logs) {
    if (log.verdict === 'ok') {
      out.verified.push(log.offerId);
      if (log.liveCents != null && log.liveCents !== log.storedCents) out.changed = true;
    }
    if (log.verdict !== 'fail') continue;
    if (log.role === 'original' && input.mode === 'radar') {
      out.droppedOfferIds.push(log.offerId);
      continue;
    }
    if (out.ok) {
      out.ok = false;
      const what = log.role === 'competitor' ? 'oferta concorrente mais barata' : 'oferta';
      out.reason = `reconferência ao vivo: ${what} ${log.reason ?? 'falhou'}`;
    }
  }
  return out;
}

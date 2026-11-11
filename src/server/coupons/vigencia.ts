import type { CouponState, NormalizedCoupon, StoredCoupon } from './types';
import { canonText } from './normalize';

/**
 * Regras PURAS de vigencia, estado e escopo (ata 2026-11-10, secoes 3.3 e 3.5).
 * - Vencido: prazo LIDO ja passou, ou o cupom sumiu de uma releitura completa.
 * - Verificado: visto em leituras separadas por >= 30 min (sequencia sem sumir) OU visto na pagina do item com o preco com cupom
 *   exibido pela propria loja. Ausencia nunca prova validade.
 * - Entra em mensagem: verificado, verified_at dentro de maxAgeMinutes (2 h), prazo LIDO no futuro, escopo casa com a oferta.
 */

export const MIN_CONFIRM_GAP_MS = 30 * 60_000;
/** Se o cupom ficou mais que isto sem ser lido, a "sequencia" nao vale como duas leituras consecutivas. */
export const MAX_STREAK_GAP_MS = 6 * 3_600_000;
export const DEFAULT_MAX_AGE_MINUTES = 120;
export const VERIFIED_BY = 'cupons-assistida';

export interface ExistingState {
  state: CouponState;
  streakStartedAt: string;
  lastSeenAt: string;
}

export interface StateDecision {
  state: CouponState;
  reason: string;
  verifiedAt: string | null;
  streakStartedAt: string;
  /** false = leitura anterior a ultima ja registrada (fora de ordem): nao altera o cupom. */
  applies: boolean;
}

/** Decide o novo estado a partir de UMA leitura. Pura: quem chama grava. */
export function decideState(existing: ExistingState | null, c: NormalizedCoupon): StateDecision {
  const readMs = Date.parse(c.readAt);
  const lastSeenMs = existing ? Date.parse(existing.lastSeenAt) : -Infinity;
  if (existing && readMs < lastSeenMs) {
    return { state: existing.state, reason: 'leitura_fora_de_ordem', verifiedAt: null, streakStartedAt: existing.streakStartedAt, applies: false };
  }
  if (existing?.state === 'invalido') {
    return { state: 'invalido', reason: 'marcado_invalido_manualmente', verifiedAt: null, streakStartedAt: existing.streakStartedAt, applies: true };
  }
  if (c.validUntil && Date.parse(c.validUntil) <= readMs) {
    return { state: 'vencido', reason: 'prazo_lido_vencido', verifiedAt: null, streakStartedAt: existing?.streakStartedAt ?? c.readAt, applies: true };
  }
  const reappeared = existing?.state === 'vencido';
  const gapTooLong = existing ? readMs - lastSeenMs > MAX_STREAK_GAP_MS : false;
  const streak = !existing || reappeared || gapTooLong ? c.readAt : existing.streakStartedAt;

  if (c.validFrom && Date.parse(c.validFrom) > readMs) {
    return { state: 'nao_verificado', reason: 'ainda_nao_comecou', verifiedAt: null, streakStartedAt: streak, applies: true };
  }
  if (c.sourceKind === 'pagina_do_item' && c.pagePriceCents !== null) {
    return { state: 'verificado', reason: 'preco_com_cupom_exibido_pela_loja', verifiedAt: c.readAt, streakStartedAt: streak, applies: true };
  }
  if (readMs - Date.parse(streak) >= MIN_CONFIRM_GAP_MS) {
    return { state: 'verificado', reason: 'duas_leituras_separadas_por_30min', verifiedAt: c.readAt, streakStartedAt: streak, applies: true };
  }
  return { state: 'nao_verificado', reason: existing ? 'aguardando_segunda_leitura' : 'primeira_leitura', verifiedAt: null, streakStartedAt: streak, applies: true };
}

/** Prazo LIDO ja passou? (sem prazo lido nao ha como afirmar vencimento por data) */
export function isExpiredByDate(c: Pick<StoredCoupon, 'validUntil'>, now: Date): boolean {
  return c.validUntil !== null && Date.parse(c.validUntil) <= now.getTime();
}

export interface UsableOptions {
  now: Date;
  maxAgeMinutes: number;
  /** Padrao false: cupom sem prazo lido NUNCA entra em mensagem. */
  allowNoExpiry?: boolean;
}

/** Pode entrar em uma linha de mensagem agora? (estado, regra das 2 h, prazo, inicio e elegibilidade da conta lida) */
export function isUsableForMessage(c: StoredCoupon, o: UsableOptions): boolean {
  const nowMs = o.now.getTime();
  if (c.state !== 'verificado' || !c.verifiedAt) return false;
  const v = Date.parse(c.verifiedAt);
  if (!Number.isFinite(v) || v > nowMs + 5 * 60_000) return false;
  if (nowMs - v > o.maxAgeMinutes * 60_000) return false;
  if (c.validUntil === null) {
    if (!o.allowNoExpiry) return false;
  } else if (Date.parse(c.validUntil) <= nowMs) return false;
  if (c.validFrom && Date.parse(c.validFrom) > nowMs) return false;
  if (c.eligibleOnReadAccount === false) return false;
  return true;
}

export interface ScopeTarget {
  offerId?: string;
  masterProductId?: string;
  /** Id do anuncio na loja (ex.: MLB123...). */
  externalItemId?: string;
  /** Id do vendedor na loja. */
  sellerId?: string;
  category?: string;
  url?: string;
}

function stripUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.hostname.toLowerCase()}${x.pathname.replace(/\/+$/, '')}`;
  } catch {
    return canonText(u);
  }
}

/**
 * Escopo: loja_inteira vale para QUALQUER oferta da rede; categoria so se a categoria da oferta for informada e constar;
 * produto/lista_itens so se ALGUMA referencia do cupom bater com a oferta (id da oferta, produto, anuncio, vendedor ou URL).
 * Alvo sem informacao suficiente = NAO casa (nunca presume).
 */
export function matchesScope(c: Pick<StoredCoupon, 'scopeKind' | 'scope'>, t: ScopeTarget): boolean {
  const s = c.scope;
  if (c.scopeKind === 'loja_inteira') return true;
  const has = (list: string[] | undefined, v: string | undefined) => !!v && !!list?.some((x) => canonText(x) === canonText(v));
  if (c.scopeKind === 'categoria') return has(s.categorias, t.category);
  if (has(s.offer_ids, t.offerId) || has(s.master_product_ids, t.masterProductId) || has(s.item_ids, t.externalItemId) || has(s.vendedores, t.sellerId)) return true;
  if (t.url && s.urls?.some((u) => stripUrl(u) === stripUrl(t.url!))) return true;
  return false;
}

/** Piso do valor minimo: o cupom so se aplica se o preco da oferta alcanca o minimo de compra lido. */
export function meetsMinimum(c: Pick<StoredCoupon, 'minOrderCents'>, priceCents: number | undefined): boolean {
  if (c.minOrderCents === null) return true;
  return priceCents !== undefined && priceCents >= c.minOrderCents;
}

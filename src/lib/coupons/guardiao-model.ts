// Regras PURAS do Guardião de Cupons (Agente de Cupons). Sem server-only, sem banco, sem rede: testável.
// Decide se um cupom que JÁ DIVULGAMOS segue válido, por que encerrou e se isso merece um card nos grupos.

export const ANN_KINDS = ['anuncio', 'campanha', 'loja', 'categoria'] as const;
export type AnnKind = (typeof ANN_KINDS)[number];

export const END_REASONS = ['sumiu_da_pagina', 'venceu', 'cancelado_pelo_dono', 'sem_leitura_recente', 'oferta_inativa'] as const;
export type EndReason = (typeof END_REASONS)[number];

/** Janela de validade de uma leitura de cupom de anúncio (a aba relê a cada ~2 h). */
export const ITEM_WINDOW_MIN = 120;
/** Sem NENHUMA leitura por tanto tempo, o guardião desiste de acompanhar (e não afirma que acabou). */
export const NO_READ_GIVE_UP_MIN = 6 * 60;
/** Limites do card de encerramento. */
export const ENDED_CARD_MAX_PER_HOUR = 3;
/** Card pendente que não coube no limite some depois disso (cupom velho demais para avisar). */
export const ENDED_CARD_STALE_MIN = 6 * 60;

/** Identificação do cupom que a consulta devolve junto do CouponInfo (para registrar a divulgação e o guardião acompanhar). */
export interface CouponRefMeta {
  couponRef?: string;
  annKind?: AnnKind;
}

export interface Announcement {
  id: string;
  networkSlug: string;
  kind: AnnKind;
  couponRef: string;
  label: string;
  offerId: string | null;
  vertical: string;
  storeId: string | null;
  firstSentAt: Date;
  lastSentAt: Date;
}

/** O que a fonte diz hoje sobre o cupom de ANÚNCIO (última leitura da aba logada na página do item). */
export interface ItemEvidence {
  kind: 'anuncio';
  offerActive: boolean;
  currentPriceCents: number | null;
  /** Leitura mais recente de qualquer tipo (com ou sem cupom). */
  lastRead: { readAt: Date; priceWithCents: number | null } | null;
  /** Leitura mais recente que trouxe o cupom. */
  lastPositive: { readAt: Date; priceWithCents: number } | null;
}

/** O que o cadastro diz hoje sobre um cupom de campanha do dono / loja / categoria (coupon_items). */
export interface RowEvidence {
  kind: 'campanha' | 'loja' | 'categoria';
  row: { state: string; stateReason: string | null; validUntil: Date | null; lastSeenAt: Date } | null;
}
export type Evidence = ItemEvidence | RowEvidence;

export type Decision = { end: false; note?: string } | { end: true; reason: EndReason };

const min = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60_000;

/** Decide se o cupom divulgado segue válido. Não escreve nada. */
export function decideEnd(ann: Pick<Announcement, 'kind' | 'lastSentAt'>, ev: Evidence, now: Date): Decision {
  if (ev.kind === 'anuncio') {
    if (!ev.offerActive) return { end: true, reason: 'oferta_inativa' };
    const last = ev.lastRead;
    // Leitura mais nova que a divulgação e sem o cupom: a página deixou de mostrar.
    if (last && last.readAt.getTime() > ann.lastSentAt.getTime() && last.priceWithCents == null) return { end: true, reason: 'sumiu_da_pagina' };
    const pos = ev.lastPositive;
    if (pos && min(now, pos.readAt) <= ITEM_WINDOW_MIN) {
      // O cupom só vale se o preço com cupom ainda fica abaixo do preço atual da oferta.
      if (ev.currentPriceCents != null && pos.priceWithCents < ev.currentPriceCents) return { end: false };
      return { end: true, reason: 'sumiu_da_pagina' };
    }
    const lastAt = last?.readAt ?? ann.lastSentAt;
    if (min(now, lastAt) >= NO_READ_GIVE_UP_MIN) return { end: true, reason: 'sem_leitura_recente' };
    // Passou a janela de 2 h sem nova leitura positiva: o anúncio de item vence junto (silencioso).
    return { end: true, reason: 'venceu' };
  }

  const r = ev.row;
  if (!r) return { end: true, reason: ev.kind === 'campanha' ? 'cancelado_pelo_dono' : 'sumiu_da_pagina' };
  if (r.state === 'vencido' && r.stateReason === 'encerrado_pelo_dono') return { end: true, reason: 'cancelado_pelo_dono' };
  if (r.validUntil && r.validUntil.getTime() <= now.getTime()) return { end: true, reason: 'venceu' };
  if (r.state === 'vencido' || r.state === 'invalido') return { end: true, reason: ev.kind === 'campanha' ? 'cancelado_pelo_dono' : 'sumiu_da_pagina' };
  if (ev.kind === 'campanha') return { end: false }; // ativo com validade futura (a confirmação de 24 h só tira das mensagens, não encerra)
  // Loja/categoria: precisa estar verificado e visto na varredura recente.
  if (min(now, r.lastSeenAt) >= NO_READ_GIVE_UP_MIN) return { end: true, reason: 'sem_leitura_recente' };
  if (r.state !== 'verificado') return { end: false, note: 'nao_verificado' };
  return { end: false };
}

/**
 * Card só quando há prova de que acabou: a página deixou de mostrar, venceu o prazo lido, o dono cancelou.
 * Anúncio de item que só expirou a janela de 2 h, falta de leitura e oferta inativa são ruído (ou incerteza): sem card.
 */
export function shouldNotifyEnd(kind: AnnKind, reason: EndReason): boolean {
  if (reason === 'sumiu_da_pagina' || reason === 'cancelado_pelo_dono') return true;
  if (reason === 'venceu') return kind !== 'anuncio';
  return false;
}

/** Rótulo do card: sem preço (o card não promete valor). Cupom de anúncio vira texto genérico. */
export function cardLabel(kind: AnnKind, label: string): string {
  if (kind === 'anuncio') return 'Cupom no anúncio';
  const l = label.replace(/\s+/g, ' ').trim().slice(0, 60);
  return l || 'Cupom';
}

export const NETWORK_NAMES: Record<string, string> = { 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };

/** Legenda HTML do Telegram (curta, sem a palavra proibida, com a marcação de publicidade quando houver). */
export function endedCaption(input: { kind: AnnKind; label: string; networkSlug: string; adTag: string }, esc: (s: string) => string): string {
  const net = NETWORK_NAMES[input.networkSlug] ?? 'a loja';
  const lbl = cardLabel(input.kind, input.label);
  const head = `<b>Cupom encerrado</b>`;
  const body = input.kind === 'anuncio' ? `O cupom que aparecia no anúncio do ${esc(net)} não vale mais.` : `O cupom <b>${esc(lbl)}</b> do ${esc(net)} não vale mais.`;
  const tag = input.adTag.trim() ? `\n\n${esc(input.adTag.trim())}` : '';
  return `${head}\n${body}${tag}`;
}

/** Quantos cards ainda cabem na hora (3 por hora por grupo). */
export function endedCardsLeft(sentLastHour: number): number {
  return Math.max(0, ENDED_CARD_MAX_PER_HOUR - sentLastHour);
}

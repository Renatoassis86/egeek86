// Máquina de estados da AUTOMAÇÃO das mensagens para grupos (ata 2026-11-10 §1.3 e §1.4). Funções PURAS: sem banco, sem relógio, sem env.
//
// Estado lido de UMA linha de `feature_flags` (key = 'group_messages_auto'):
//   enabled = false (ou linha ausente)  -> 'off'
//   enabled = true e rules.state        -> 'shadow' | 'on' (qualquer outro valor cai em 'off': falha fechada)
//   rules.maxMemberDropPct              -> limite do freio por saída de inscritos (padrão 5, em 24 h)
// 'off'    = a automação não decide nada; o fluxo manual (propostas aprovadas na tela) segue como antes.
// 'shadow' = o cron decide e REGISTRA em group_messages com status 'simulada'; NÃO envia nada.
// 'on'     = envia sozinho as classes seguras; as de risco ficam 'proposta' (aprovação humana) e as retidas ficam 'retida'.

import type { Candidate } from '@/lib/messaging/group-rules';

export const AUTOMATION_FLAG_KEY = 'group_messages_auto';
export const DEFAULT_MAX_MEMBER_DROP_PCT = 5;
/** Cache do estado lido do banco: o kill-switch pela linha vale em até 30 s. */
export const AUTOMATION_CACHE_TTL_MS = 30_000;

export type AutomationState = 'off' | 'shadow' | 'on';
export const AUTOMATION_STATES: readonly AutomationState[] = ['off', 'shadow', 'on'];

export interface AutomationConfig {
  state: AutomationState;
  maxMemberDropPct: number;
  /** A linha existe no banco? (false = padrão 'off'). */
  rowExists: boolean;
  updatedAt: string | null;
}

export interface FlagRow {
  enabled: boolean;
  rules: unknown;
  updated_at?: string | Date | null;
}

export function isAutomationState(v: unknown): v is AutomationState {
  return v === 'off' || v === 'shadow' || v === 'on';
}

/** Lê a linha de feature_flags. Linha ausente, desligada ou ilegível = 'off'. */
export function parseAutomation(row: FlagRow | null | undefined): AutomationConfig {
  if (!row) return { state: 'off', maxMemberDropPct: DEFAULT_MAX_MEMBER_DROP_PCT, rowExists: false, updatedAt: null };
  const rules = row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules) ? (row.rules as Record<string, unknown>) : {};
  const drop = Number(rules.maxMemberDropPct);
  return {
    state: row.enabled === true && isAutomationState(rules.state) ? rules.state : 'off',
    maxMemberDropPct: Number.isFinite(drop) && drop > 0 && drop <= 100 ? drop : DEFAULT_MAX_MEMBER_DROP_PCT,
    rowExists: true,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/** Valores a gravar na linha para um estado (usado pela ação do admin). */
export function automationRowValues(state: AutomationState, maxMemberDropPct = DEFAULT_MAX_MEMBER_DROP_PCT): { enabled: boolean; rules: { state: AutomationState; maxMemberDropPct: number } } {
  return { enabled: state !== 'off', rules: { state, maxMemberDropPct } };
}

// ---------------------------------------------------------------------------
// Decisão por candidato
// ---------------------------------------------------------------------------
export type Disposition = 'auto' | 'approval' | 'held';

/**
 * Seguro (envio automático), exige aprovação humana ou retido:
 *  - retido: desconto > 40% contra a média, queda > 45%, preço < 0,5x a mediana (nunca sai sozinho);
 *  - aprovação: Shopee, desconto > 25%, vendedor sem reputação/poucas vendas, Amazon acima de 30% de queda (nicho novo deixou de exigir aprovação em 2026-11-11: todas as lojas estão liberadas);
 *  - o resto (ML nas condições seguras, Amazon dentro dos limites) é automático.
 */
export function dispositionOf(c: Pick<Candidate, 'held' | 'status' | 'vertical' | 'reviewReasons'>): { disposition: Disposition; reasons: string[] } {
  if (c.held) return { disposition: 'held', reasons: [] };
  const reasons = [...c.reviewReasons];
  if (c.status === 'review' || reasons.length) return { disposition: 'approval', reasons };
  return { disposition: 'auto', reasons: [] };
}

export type QueueStatus = 'proposta' | 'proposta_auto' | 'simulada' | 'retida';

/** Status com que a decisão é gravada em group_messages (canal Telegram) para cada estado da automação. */
export function rowStatusFor(disposition: Disposition, state: AutomationState): QueueStatus {
  if (disposition === 'held') return 'retida';
  if (disposition === 'approval') return 'proposta';
  if (state === 'on') return 'proposta_auto';
  if (state === 'shadow') return 'simulada';
  return 'proposta';
}

/** O cron pode enviar sozinho? Só no estado 'on', sem freio de inscritos e com as travas de ambiente ok (passadas pelo chamador). */
export function canAutoSend(state: AutomationState, brake: { paused: boolean }, envGateOk: boolean): { ok: boolean; reason?: string } {
  if (state !== 'on') return { ok: false, reason: `automação em '${state}'` };
  if (!envGateOk) return { ok: false, reason: 'travas de ambiente (GROUP_MESSAGES_ENABLED/MODE/token/chat id)' };
  if (brake.paused) return { ok: false, reason: 'freio por saída de inscritos' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Freio por saída de inscritos (getChatMemberCount a cada hora)
// ---------------------------------------------------------------------------
export interface MemberPoint {
  at: Date;
  count: number;
}

export const MEMBER_COUNT_EVERY_MIN = 55;
export const MEMBER_WINDOW_HOURS = 24;
/** Sem leitura nesse tempo o freio não pode afirmar nada; o admin vê o aviso. */
export const MEMBER_STALE_HOURS = 3;

export function shouldCountMembers(lastAt: Date | null, now: Date): boolean {
  return !lastAt || (now.getTime() - lastAt.getTime()) / 60_000 >= MEMBER_COUNT_EVERY_MIN;
}

export interface MemberBrake {
  paused: boolean;
  /** Queda do pico das últimas 24 h até a leitura mais recente, em %. null = menos de 2 leituras. */
  dropPct: number | null;
  peak: number | null;
  current: number | null;
  stale: boolean;
  points: number;
}

/**
 * Pausa o envio automático se a contagem de inscritos caiu mais que `limitPct` (padrão 5%) em 24 h.
 * Base: o maior valor lido nas últimas 24 h contra a leitura mais recente. Nunca "melhora" sozinho dentro da janela:
 * a pausa só termina quando o pico sai das 24 h ou o número se recupera.
 */
export function memberBrake(points: MemberPoint[], now: Date, limitPct = DEFAULT_MAX_MEMBER_DROP_PCT): MemberBrake {
  const since = now.getTime() - MEMBER_WINDOW_HOURS * 3600_000;
  const win = points.filter((p) => p.at.getTime() >= since && p.at.getTime() <= now.getTime() + 60_000 && Number.isFinite(p.count) && p.count >= 0).sort((a, b) => a.at.getTime() - b.at.getTime());
  const latest = win[win.length - 1];
  const stale = !latest || (now.getTime() - latest.at.getTime()) / 3600_000 > MEMBER_STALE_HOURS;
  if (win.length < 2) return { paused: false, dropPct: null, peak: latest?.count ?? null, current: latest?.count ?? null, stale, points: win.length };
  const peak = Math.max(...win.map((p) => p.count));
  const drop = peak > 0 ? ((peak - latest.count) / peak) * 100 : 0;
  return { paused: drop > limitPct, dropPct: Math.round(drop * 100) / 100, peak, current: latest.count, stale, points: win.length };
}

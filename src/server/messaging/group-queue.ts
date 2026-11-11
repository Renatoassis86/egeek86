import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { canSendTelegram, getAdTag } from '@/lib/messaging/group-config';
import { dispositionOf, rowStatusFor, type AutomationState } from '@/lib/messaging/group-automation';
import { withCouponBlock, type CouponInfo } from '@/lib/messaging/group-messages';
import {
  RULES,
  applyLimits,
  cardAllowed,
  composeRadar,
  netKind,
  priceWithinTolerance,
  type Candidate,
  type MessageClass,
} from '@/lib/messaging/group-rules';
import { sendTelegramGroupMessage, type FetchLike } from '@/lib/messaging/telegram-send';
import { setAutomationState } from '@/server/messaging/group-automation-store';
import { detectGroupCandidates, groupMessagesTableExists, groupMessagesV2Ready, loadSentHistory, type DetectionResult } from '@/server/messaging/group-offers';

type Row = Record<string, unknown>;
export type GroupChannelDb = 'tg' | 'wa';
export type GroupStatus =
  | 'proposta'
  | 'aprovada'
  | 'enviada'
  | 'rejeitada'
  | 'expirada'
  | 'erro'
  | 'proposta_auto'
  | 'simulada'
  | 'retida'
  | 'enviando';

export interface QueueRow {
  id: string;
  messageKey: string;
  trigger: string;
  channel: GroupChannelDb;
  masterProductId: string | null;
  priceCentsDetected: number | null;
  needsReview: boolean;
  textBody: string;
  status: GroupStatus;
  createdAt: string;
  sentAt: string | null;
  error: string | null;
  candidate: Candidate;
  cls: MessageClass | null;
  isSound: boolean;
  simState: string | null;
  automationState: string | null;
  recheckAt: string | null;
  recheckDivergencePct: number | null;
  recheckNote: string | null;
}

function mapRow(r: Row): QueueRow {
  const cand = typeof r.candidate === 'string' ? JSON.parse(r.candidate) : r.candidate;
  return {
    id: String(r.id),
    messageKey: String(r.message_key),
    trigger: String(r.trigger),
    channel: r.channel as GroupChannelDb,
    masterProductId: (r.master_product_id as string | null) ?? null,
    priceCentsDetected: r.price_cents_detected == null ? null : Number(r.price_cents_detected),
    needsReview: r.needs_review === true,
    textBody: String(r.text_body),
    status: r.status as GroupStatus,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    sentAt: r.sent_at ? new Date(r.sent_at as string | Date).toISOString() : null,
    error: (r.error as string | null) ?? null,
    candidate: cand as Candidate,
    cls: (r.msg_class as MessageClass | null) ?? null,
    isSound: r.is_sound === true,
    simState: (r.sim_state as string | null) ?? null,
    automationState: (r.automation_state as string | null) ?? null,
    recheckAt: r.recheck_at ? new Date(r.recheck_at as string | Date).toISOString() : null,
    recheckDivergencePct: r.recheck_divergence_pct == null ? null : Number(r.recheck_divergence_pct),
    recheckNote: (r.recheck_note as string | null) ?? null,
  };
}

const n = (res: unknown) => Number((res as { count?: number }).count ?? 0);

/** Fila persistida (propostas, retidas, decisões do modo sombra e histórico recente). [] se a tabela não existe. */
export async function listQueue(limit = 120): Promise<QueueRow[]> {
  if (!(await groupMessagesTableExists())) return [];
  const rows = await db.execute<Row>(sql`
    SELECT * FROM group_messages ORDER BY
      CASE status WHEN 'proposta' THEN 0 WHEN 'retida' THEN 1 WHEN 'aprovada' THEN 2 WHEN 'proposta_auto' THEN 3 WHEN 'simulada' THEN 4 WHEN 'enviando' THEN 5 ELSE 6 END,
      created_at DESC
    LIMIT ${limit}::int
  `);
  return rows.map(mapRow);
}

/** Linhas do Telegram prontas para o cron escolher (reivindicáveis: sem trava, com tentativas sobrando). */
export async function listPendingForSend(statuses: GroupStatus[], limit = 40): Promise<QueueRow[]> {
  if (!statuses.length || !(await groupMessagesV2Ready())) return [];
  const rows = await db.execute<Row>(sql`
    SELECT * FROM group_messages
    WHERE channel = 'tg' AND status IN (${sql.join(statuses.map((x) => sql`${x}`), sql`, `)}) AND claimed_at IS NULL AND attempts < 3
    ORDER BY created_at LIMIT ${limit}::int
  `);
  return rows.map(mapRow);
}

export interface PersistOptions {
  state: AutomationState;
  /** Modo sombra: só o vencedor do plano é gravado como decisão simulada (os demais ficam só no resumo do ciclo). */
  shadowWinner?: { messageKey: string; sound: boolean } | null;
}

export interface PersistResult {
  inserted: number;
  skipped: number;
  byStatus: Record<string, number>;
}

const LEGACY_TRIGGERS = new Set(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);

/**
 * Grava as decisões do ciclo (dois canais por candidato: 'tg' recebe o status da automação; 'wa' segue assistido).
 *  - segura ('auto'): 'proposta_auto' no estado on; 'simulada' no sombra (só o vencedor); 'proposta' no off;
 *  - exige aprovação: 'proposta'; retida: 'retida' (nos dois canais).
 * Ignora o que já existe (dedup_key + canal) e produto que já tem proposta aberta nas últimas 48 h no mesmo canal.
 * Candidato não enviável nunca é gravado. Radar: só a mensagem composta (os itens avulsos não são gravados).
 * Sem a migration 0030, só os gatilhos G1 a G6 são gravados, como na 0028.
 */
export async function persistProposals(result: DetectionResult, opts: PersistOptions = { state: 'off' }): Promise<PersistResult> {
  const out: PersistResult = { inserted: 0, skipped: 0, byStatus: {} };
  if (!(await groupMessagesTableExists())) return out;
  const v2 = await groupMessagesV2Ready();
  for (const c of result.candidates) {
    if (!c.sendable) {
      out.skipped++;
      continue;
    }
    if (c.cls === 'radar' && c.trigger !== 'RADAR') continue; // item avulso: entra no radar composto
    if (!v2 && !LEGACY_TRIGGERS.has(c.trigger)) {
      out.skipped++;
      continue;
    }
    const disp = dispositionOf(c);
    let tgStatus = v2 ? rowStatusFor(disp.disposition, opts.state) : 'proposta';
    let simState: string | null = null;
    if (v2 && tgStatus === 'simulada') {
      if (!opts.shadowWinner || opts.shadowWinner.messageKey !== c.messageKey) {
        out.skipped++;
        continue;
      }
      simState = opts.shadowWinner.sound ? 'enviaria_som' : 'enviaria_silenciosa';
    }
    const waStatus = disp.disposition === 'held' && v2 ? 'retida' : 'proposta';
    const productId = c.trigger === 'G4' || c.trigger === 'RADAR' ? null : c.masterProductId;
    for (const ch of ['tg', 'wa'] as const) {
      const text = ch === 'tg' ? c.texts.telegram : c.texts.whatsapp;
      const status = ch === 'tg' ? tgStatus : waStatus;
      const needsReview = disp.disposition !== 'auto';
      const res = v2
        ? await db.execute(sql`
        INSERT INTO group_messages (message_key, trigger, channel, vertical, master_product_id, offer_id, price_cents_detected, avg_cents, needs_review, candidate, text_body, dedup_key,
                                    status, msg_class, sim_state, automation_state)
        SELECT ${c.messageKey}, ${c.trigger}, ${ch}, ${c.vertical}, ${productId}::uuid, ${c.offerIds[0]}::uuid,
               ${c.priceCents}::bigint, ${c.avgCents}::bigint, ${needsReview}, ${JSON.stringify(c)}::jsonb, ${text}, ${c.dedupKey},
               ${status}, ${c.cls}, ${ch === 'tg' ? simState : null}, ${opts.state}
        WHERE NOT EXISTS (
          SELECT 1 FROM group_messages g
          WHERE g.channel = ${ch} AND g.master_product_id = ${productId}::uuid
            AND g.status IN ('proposta', 'aprovada', 'proposta_auto', 'retida', 'enviando') AND g.created_at >= now() - interval '48 hours'
        )
        ON CONFLICT (dedup_key, channel) DO NOTHING
      `)
        : await db.execute(sql`
        INSERT INTO group_messages (message_key, trigger, channel, vertical, master_product_id, offer_id, price_cents_detected, avg_cents, needs_review, candidate, text_body, dedup_key)
        SELECT ${c.messageKey}, ${c.trigger}, ${ch}, ${c.vertical}, ${productId}::uuid, ${c.offerIds[0]}::uuid,
               ${c.priceCents}::bigint, ${c.avgCents}::bigint, ${c.status === 'review'}, ${JSON.stringify(c)}::jsonb, ${text}, ${c.dedupKey}
        WHERE NOT EXISTS (
          SELECT 1 FROM group_messages g
          WHERE g.channel = ${ch} AND g.master_product_id = ${productId}::uuid
            AND g.status IN ('proposta', 'aprovada') AND g.created_at >= now() - interval '48 hours'
        )
        ON CONFLICT (dedup_key, channel) DO NOTHING
      `);
      if (n(res) > 0) {
        out.inserted++;
        out.byStatus[status] = (out.byStatus[status] ?? 0) + 1;
      } else out.skipped++;
    }
  }
  return out;
}

/**
 * Validade das linhas: proposta e proposta_auto em 3 h (radar automático em 20 min: só vale na hora cheia), aprovada em 12 h,
 * retida em 24 h. Linha 'enviando' parada há mais de 10 min NUNCA volta para a fila (poderia duplicar a mensagem no canal):
 * vira 'erro' com o aviso para conferir o canal. Mensagem já enviada ao canal nunca é apagada.
 */
export async function expireStale(): Promise<number> {
  if (!(await groupMessagesTableExists())) return 0;
  const v2 = await groupMessagesV2Ready();
  if (!v2) {
    const res = await db.execute(sql`
      UPDATE group_messages SET status = 'expirada', updated_at = now(), error = COALESCE(error, 'expirada sem envio')
      WHERE (status = 'proposta' AND created_at < now() - interval '3 hours') OR (status = 'aprovada' AND created_at < now() - interval '12 hours')
    `);
    return n(res);
  }
  const res = await db.execute(sql`
    UPDATE group_messages SET status = 'expirada', claimed_at = NULL, updated_at = now(), error = COALESCE(error, 'expirada sem envio')
    WHERE (status IN ('proposta', 'proposta_auto') AND created_at < now() - (CASE WHEN msg_class = 'radar' AND status = 'proposta_auto' THEN interval '20 minutes' ELSE interval '3 hours' END))
       OR (status = 'aprovada' AND created_at < now() - interval '12 hours')
       OR (status = 'retida' AND created_at < now() - interval '24 hours')
  `);
  const stuck = await db.execute(sql`
    UPDATE group_messages SET status = 'erro', claimed_at = NULL, updated_at = now(),
      error = 'envio interrompido: confira o canal antes de reenviar (a mensagem pode ter saído)'
    WHERE status = 'enviando' AND claimed_at < now() - interval '10 minutes'
  `);
  return n(res) + n(stuck);
}

/** Aprova ou rejeita a proposta nos dois canais (mesmo message_key). Retida também pode ser aprovada por um humano. */
export async function setStatusByKey(messageKey: string, status: 'aprovada' | 'rejeitada', adminId: string | null): Promise<boolean> {
  const v2 = await groupMessagesV2Ready();
  const open = v2 ? sql`('proposta', 'aprovada', 'retida', 'proposta_auto')` : sql`('proposta', 'aprovada')`;
  const res = await db.execute(sql`
    UPDATE group_messages SET status = ${status}, updated_at = now(),
      approved_at = ${status === 'aprovada' ? sql`now()` : sql`approved_at`}, approved_by = ${status === 'aprovada' ? adminId : null}::uuid
    WHERE message_key = ${messageKey} AND status IN ${open}
  `);
  return n(res) > 0;
}

/** WhatsApp assistido: o admin enviou/colou manualmente. Registra como enviada no canal 'wa' (conta nos limites do canal). */
export async function markWhatsappSentByKey(messageKey: string): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE group_messages SET status = 'enviada', sent_at = now(), updated_at = now()
    WHERE message_key = ${messageKey} AND channel = 'wa' AND status IN ('proposta', 'aprovada')
  `);
  return n(res) > 0;
}

export async function telegramRowIdByKey(messageKey: string): Promise<string | null> {
  const rows = await db.execute<Row>(sql`SELECT id FROM group_messages WHERE message_key = ${messageKey} AND channel = 'tg' LIMIT 1`);
  return rows[0] ? String(rows[0].id) : null;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
export interface SendOutcome {
  ok: boolean;
  /** sent | deferred (volta à fila) | expired | failed | blocked */
  outcome: 'sent' | 'deferred' | 'expired' | 'failed' | 'blocked';
  reason?: string;
  messageId?: string;
  sound?: boolean;
  card?: boolean;
  coupon?: boolean;
}

/** Cartão de histórico em PNG (ponto de ligação com o módulo do cartão; ainda não existe). Devolve null se não houver série suficiente. */
export type RenderCardFn = (masterProductId: string) => Promise<Buffer | null>;
/** Cupom verificado da oferta (ponto de ligação com o módulo de cupons; ainda não existe). null = sem cupom válido. */
export type CouponLookupFn = (offerId: string) => Promise<CouponInfo | null>;

export interface SendDeps {
  now?: Date;
  fetchImpl?: FetchLike;
  renderCard?: RenderCardFn;
  couponLookup?: CouponLookupFn;
  /** Só para teste/ambiente; padrão: variáveis de ambiente. */
  token?: string;
  chatId?: string;
}

const timeout = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

const isAmz = (c: Pick<Candidate, 'networkSlug'>) => netKind({ networkSlug: c.networkSlug, networkName: c.networkSlug }) === 'amazon';

export interface Revalidation {
  ok: boolean;
  reason?: string;
  match?: Candidate;
}

/**
 * Releitura do preço imediatamente antes do envio (e também usada pelo modo sombra para decidir "enviaria").
 * Re-detecta o produto com frescor de envio (30 min; Amazon 40 min). O gatilho precisa continuar valendo, o preço ficar
 * dentro de 2% do detectado e, nas linhas automáticas, continuar na faixa segura (nem aprovação, nem retido).
 */
export async function revalidateCandidate(
  orig: Candidate,
  detectedPriceCents: number | null,
  history: Parameters<typeof applyLimits>[1],
  opts: { now: Date; allowReview: boolean }
): Promise<Revalidation> {
  const { now } = opts;
  const isRadar = orig.trigger === 'RADAR';
  const productIds = orig.trigger === 'G4' ? undefined : isRadar ? (orig.items ?? []).map((i) => i.masterProductId) : [orig.masterProductId];
  const live = await detectGroupCandidates({
    now,
    maxAgeMin: RULES.SEND_MAX_AGE_MIN,
    amazonMaxAgeMin: RULES.AMAZON_SEND_MAX_AGE_MIN,
    productIds,
    history,
    adTag: getAdTag(),
  });

  if (isRadar) {
    const items = orig.items ?? [];
    const fresh = live.candidates.filter((c) => {
      if (c.cls !== 'radar' || c.trigger === 'RADAR' || !c.sendable || !c.move) return false;
      const it = items.find((i) => i.masterProductId === c.masterProductId);
      return !!it && it.kind === c.move.kind && priceWithinTolerance(it.priceCents, c.priceCents);
    });
    const radar = composeRadar(fresh, { now, maxAgeMin: RULES.SEND_MAX_AGE_MIN, adTag: getAdTag() });
    if (!radar || !radar.sendable) return { ok: false, reason: `revalidação: só ${fresh.length} item(ns) do radar ainda valem (mínimo ${RULES.RADAR_MIN_ITEMS})` };
    return { ok: true, match: radar };
  }

  const match = live.candidates.find((c) =>
    orig.trigger === 'G4'
      ? c.trigger === 'G4' && orig.offerIds.every((o) => c.offerIds.includes(o))
      : c.masterProductId === orig.masterProductId && c.trigger === orig.trigger && isAmz(c) === isAmz(orig)
  );
  if (!match || !match.sendable) return { ok: false, reason: 'revalidação: já não vale (preço velho, sumiu ou mudou)' };
  if (!opts.allowReview && (match.held || match.status === 'review')) return { ok: false, reason: 'revalidação: saiu da faixa segura (exige aprovação ou retido)' };
  if (orig.trigger !== 'G4' && detectedPriceCents != null && !priceWithinTolerance(detectedPriceCents, match.priceCents)) {
    return { ok: false, reason: 'revalidação: preço mudou mais de 2 %' };
  }
  return { ok: true, match };
}

/**
 * Envia UMA linha do Telegram ('aprovada' por humano ou 'proposta_auto' segura). Passos, todos obrigatórios:
 *  1. travas de ambiente (kill-switch + modo send + token + chat id; falha fechada);
 *  2. REIVINDICAÇÃO ATÔMICA: UPDATE ... WHERE status IN ('aprovada','proposta_auto') RETURNING muda para 'enviando';
 *     só uma execução vence, então duas execuções sobrepostas nunca enviam a mesma linha duas vezes;
 *  3. releitura do preço (revalidateCandidate) e limites (tetos, janelas, dedup, som) com o histórico SEM a própria linha;
 *  4. cupom verificado (couponLookup injetado) e cartão (renderCard injetado), ambos opcionais e tolerantes a falha;
 *  5. envio; grava message_id, texto enviado, som, cartão e a hora da reconferência (30 min depois).
 * Falha definitiva (401/403/chat inexistente): 'erro' e a automação vai para 'off' (pausa). Falha temporária: volta para a fila
 * (até 3 tentativas). Linha 'enviando' que ficar parada nunca é reenviada sozinha (ver expireStale).
 */
export async function sendQueuedTelegram(id: string, deps: SendDeps = {}): Promise<SendOutcome> {
  const now = deps.now ?? new Date();
  const env = { ...process.env, ...(deps.token ? { TELEGRAM_BOT_TOKEN: deps.token } : {}), ...(deps.chatId ? { TELEGRAM_GROUP_CHAT_ID: deps.chatId } : {}) };
  const gate = canSendTelegram(env);
  if (!gate.ok) return { ok: false, outcome: 'blocked', reason: gate.reason };

  const claimed = await db.execute<Row>(sql`
    UPDATE group_messages SET claim_from = status, status = 'enviando', claimed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid AND channel = 'tg' AND status IN ('aprovada', 'proposta_auto') AND attempts < 3
    RETURNING *
  `);
  if (!claimed[0]) return { ok: false, outcome: 'blocked', reason: 'não reivindicável (já enviada, em andamento, fora da fila ou sem tentativas)' };
  const row = mapRow(claimed[0]);
  const claimFrom = String(claimed[0].claim_from ?? 'aprovada');
  const human = claimFrom === 'aprovada';

  const release = (error?: string) =>
    db.execute(sql`
      UPDATE group_messages SET status = ${claimFrom}, claimed_at = NULL, updated_at = now(), error = ${error ? error.slice(0, 300) : null}
      WHERE id = ${id}::uuid AND status = 'enviando'
    `);
  const expire = (reason: string) =>
    db.execute(sql`UPDATE group_messages SET status = 'expirada', claimed_at = NULL, updated_at = now(), error = ${reason.slice(0, 300)} WHERE id = ${id}::uuid AND status = 'enviando'`);

  try {
    const hist = await loadSentHistory('tg', now, { excludeId: id });
    const rev = await revalidateCandidate(row.candidate, row.priceCentsDetected, hist.records, { now, allowReview: human });
    if (!rev.ok || !rev.match) {
      await expire(rev.reason ?? 'revalidação falhou');
      return { ok: false, outcome: 'expired', reason: rev.reason };
    }
    const match = rev.match;
    const plan = applyLimits([{ ...match, status: 'auto', held: false, sendable: true }], hist.records, now);
    if (!plan.next) {
      await release();
      return { ok: false, outcome: 'deferred', reason: plan.deferred[0]?.reason ?? 'limite' };
    }

    // O link do texto usa a chave desta linha (a releitura pode ter escolhido outra oferta, mas a atribuição é por mensagem).
    let text = match.texts.telegram;
    if (match.messageKey !== row.messageKey) text = text.split(`m=${match.messageKey}`).join(`m=${row.messageKey}`);

    let coupon = false;
    if (deps.couponLookup && (match.cls === 'alerta' || match.cls === 'insight') && match.trigger !== 'RADAR') {
      try {
        const info = await timeout(deps.couponLookup(match.offerIds[0]), 4000);
        const withCoupon = withCouponBlock(text, info, 'tg', now);
        if (withCoupon !== text) {
          text = withCoupon;
          coupon = true;
        }
      } catch {
        // cupom é opcional: a mensagem sai sem ele
      }
    }

    let photo: Buffer | null = null;
    if (deps.renderCard && (match.cls === 'alerta' || match.cls === 'insight') && match.trigger !== 'RADAR' && match.trigger !== 'G4' && cardAllowed(match.masterProductId, hist.records, now)) {
      try {
        photo = await timeout(deps.renderCard(match.masterProductId), 8000);
      } catch {
        photo = null;
      }
    }

    const sent = await sendTelegramGroupMessage({
      token: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_GROUP_CHAT_ID,
      text,
      silent: !plan.nextSound,
      photo,
      fetchImpl: deps.fetchImpl,
    });

    if (sent.ok) {
      const withCard = sent.photoSent === true;
      const recheckAt = new Date(now.getTime() + 30 * 60_000).toISOString();
      await db.execute(sql`
        UPDATE group_messages SET status = 'enviada', sent_at = now(), updated_at = now(), claimed_at = NULL, error = NULL, attempts = attempts + 1,
          provider_message_id = ${sent.messageId ?? null}, text_body = ${text}, price_cents_detected = ${match.priceCents}::bigint,
          candidate = ${JSON.stringify(match)}::jsonb, msg_class = ${match.cls}, is_sound = ${plan.nextSound}, has_card = ${withCard},
          recheck_due_at = ${recheckAt}::timestamptz
        WHERE id = ${id}::uuid
      `);
      return { ok: true, outcome: 'sent', messageId: sent.messageId, sound: plan.nextSound, card: withCard, coupon };
    }

    if (sent.retryable === false) {
      await db.execute(sql`
        UPDATE group_messages SET status = 'erro', claimed_at = NULL, updated_at = now(), attempts = attempts + 1, error = ${(sent.error ?? 'erro').slice(0, 300)}
        WHERE id = ${id}::uuid
      `);
      // Falha definitiva (token revogado, bot removido, chat inexistente): pausa a automação inteira até o dono olhar.
      await setAutomationState('off', `pausa automática: ${(sent.error ?? 'erro definitivo de envio').slice(0, 120)}`).catch(() => undefined);
      return { ok: false, outcome: 'failed', reason: sent.error };
    }
    // Temporária (429 longo, 5xx, rede): volta para a fila; na terceira tentativa vira 'erro'.
    await db.execute(sql`
      UPDATE group_messages SET attempts = attempts + 1, claimed_at = NULL, updated_at = now(), error = ${(sent.error ?? 'erro').slice(0, 300)},
        status = CASE WHEN attempts + 1 >= 3 THEN 'erro' ELSE ${claimFrom} END
      WHERE id = ${id}::uuid AND status = 'enviando'
    `);
    return { ok: false, outcome: 'failed', reason: sent.error };
  } catch (e) {
    // Exceção ANTES do envio: devolve à fila. (Se o Telegram aceitou e o banco falhou depois, a linha fica 'enviando' e vira 'erro'
    // no expireStale; nunca é reenviada.)
    await release(e instanceof Error ? e.message : 'erro').catch(() => undefined);
    return { ok: false, outcome: 'failed', reason: e instanceof Error ? e.message : 'erro' };
  }
}

/**
 * Envio manual ("Enviar agora" da tela): só linha aprovada. Com a migration 0030 usa o mesmo caminho do cron;
 * sem ela, o caminho da 0028 (abaixo).
 */
export async function sendApprovedTelegram(id: string, now = new Date(), deps: Omit<SendDeps, 'now'> = {}): Promise<SendOutcome> {
  if (await groupMessagesV2Ready()) return sendQueuedTelegram(id, { ...deps, now });
  return sendApprovedTelegramLegacy(id, now);
}

async function sendApprovedTelegramLegacy(id: string, now: Date): Promise<SendOutcome> {
  const gate = canSendTelegram();
  if (!gate.ok) return { ok: false, outcome: 'blocked', reason: gate.reason };

  const rows = await db.execute<Row>(sql`
    SELECT id, message_key, trigger, channel, master_product_id, price_cents_detected, needs_review, candidate, text_body, status, created_at, sent_at, error
    FROM group_messages WHERE id = ${id}::uuid
  `);
  if (!rows[0]) return { ok: false, outcome: 'blocked', reason: 'proposta não encontrada' };
  const row = mapRow(rows[0]);
  if (row.channel !== 'tg') return { ok: false, outcome: 'blocked', reason: 'só o canal Telegram envia sozinho' };
  if (row.status !== 'aprovada') return { ok: false, outcome: 'blocked', reason: `status ${row.status}: só propostas aprovadas são enviadas` };

  const hist = await loadSentHistory('tg', now);
  const asAuto: Candidate = { ...row.candidate, status: 'auto', sendable: true, held: false };
  const plan = applyLimits([asAuto], hist.records, now);
  if (!plan.next) return { ok: false, outcome: 'deferred', reason: plan.deferred[0]?.reason ?? 'limite' };

  const claim = await db.execute(sql`
    UPDATE group_messages SET claimed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid AND status = 'aprovada' AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
  `);
  if (n(claim) === 0) return { ok: false, outcome: 'blocked', reason: 'envio já em andamento' };

  try {
    const rev = await revalidateCandidate(row.candidate, row.priceCentsDetected, hist.records, { now, allowReview: true });
    if (!rev.ok || !rev.match) {
      await db.execute(sql`UPDATE group_messages SET status = 'expirada', claimed_at = NULL, updated_at = now(), error = ${rev.reason ?? 'revalidação falhou'} WHERE id = ${id}::uuid`);
      return { ok: false, outcome: 'expired', reason: rev.reason };
    }
    const match = rev.match;
    const sent = await sendTelegramGroupMessage({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_GROUP_CHAT_ID, text: match.texts.telegram });
    if (sent.ok) {
      await db.execute(sql`
        UPDATE group_messages SET status = 'enviada', sent_at = now(), updated_at = now(), claimed_at = NULL, error = NULL,
          provider_message_id = ${sent.messageId ?? null}, text_body = ${match.texts.telegram}, price_cents_detected = ${match.priceCents}::bigint
        WHERE id = ${id}::uuid
      `);
      return { ok: true, outcome: 'sent', messageId: sent.messageId };
    }
    const definitive = sent.retryable === false;
    await db.execute(sql`
      UPDATE group_messages SET status = ${definitive ? 'erro' : 'aprovada'}, claimed_at = NULL, updated_at = now(), error = ${(sent.error ?? 'erro').slice(0, 300)}
      WHERE id = ${id}::uuid
    `);
    return { ok: false, outcome: 'failed', reason: sent.error };
  } catch (e) {
    await db.execute(sql`UPDATE group_messages SET claimed_at = NULL, updated_at = now(), error = ${String(e instanceof Error ? e.message : e).slice(0, 300)} WHERE id = ${id}::uuid`);
    return { ok: false, outcome: 'failed', reason: e instanceof Error ? e.message : 'erro' };
  }
}

// ---------------------------------------------------------------------------
// Reconferência do preço 30 min depois do envio (nunca apaga mensagem do canal)
// ---------------------------------------------------------------------------
export interface RecheckResult {
  checked: number;
  diverged: number;
}

/**
 * Para cada mensagem enviada há >= 30 min e ainda sem reconferência: relê o preço da(s) oferta(s) citada(s) e grava
 * `recheck_*` (preço relido, divergência em %, nota). Registro apenas: nada é apagado, editado ou reenviado no canal.
 * Radar: grava a MAIOR divergência entre os itens.
 */
export async function runRechecks(now = new Date(), limit = 20): Promise<RecheckResult> {
  const out: RecheckResult = { checked: 0, diverged: 0 };
  if (!(await groupMessagesV2Ready())) return out;
  const due = await db.execute<Row>(sql`
    SELECT id, price_cents_detected, offer_id, candidate FROM group_messages
    WHERE status = 'enviada' AND channel = 'tg' AND recheck_at IS NULL AND recheck_due_at <= ${now.toISOString()}::timestamptz
    ORDER BY recheck_due_at LIMIT ${limit}::int
  `);
  for (const r of due) {
    const cand = (typeof r.candidate === 'string' ? JSON.parse(r.candidate) : r.candidate) as Candidate;
    const targets = cand.items?.length ? cand.items.map((i) => ({ offerId: i.offerId, sent: i.priceCents })) : [{ offerId: String(r.offer_id), sent: Number(r.price_cents_detected) }];
    let worst = 0;
    let worstPrice: number | null = null;
    let note = 'ok';
    for (const t of targets) {
      const o = await db.execute<Row>(sql`SELECT current_price_cents, status, quarantined_at, consecutive_miss_count FROM affiliate_offers WHERE id = ${t.offerId}::uuid`);
      const cur = o[0];
      if (!cur || cur.status !== 'active' || cur.quarantined_at != null) {
        note = 'oferta_inativa_ou_em_quarentena';
        continue;
      }
      if ((cur.consecutive_miss_count as number | null) && Number(cur.consecutive_miss_count) > 0) note = note === 'ok' ? 'oferta_ausente_da_busca' : note;
      const price = Number(cur.current_price_cents);
      if (!(price > 0) || !(t.sent > 0)) continue;
      const div = (Math.abs(price - t.sent) / t.sent) * 100;
      if (div >= worst) {
        worst = div;
        worstPrice = price;
      }
    }
    if (worst > RULES.SEND_PRICE_TOLERANCE_PCT) {
      out.diverged++;
      if (note === 'ok') note = 'preco_divergiu';
    }
    await db.execute(sql`
      UPDATE group_messages SET recheck_at = now(), recheck_price_cents = ${worstPrice}::bigint, recheck_divergence_pct = ${Math.round(worst * 100) / 100}, recheck_note = ${note}
      WHERE id = ${String(r.id)}::uuid AND recheck_at IS NULL
    `);
    out.checked++;
  }
  return out;
}

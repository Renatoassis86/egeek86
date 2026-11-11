import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { canSendTelegram, getAdTag } from '@/lib/messaging/group-config';
import { applyLimits, priceWithinTolerance, RULES, type Candidate } from '@/lib/messaging/group-rules';
import { sendTelegramGroupMessage } from '@/lib/messaging/telegram-send';
import { detectGroupCandidates, groupMessagesTableExists, loadSentHistory, type DetectionResult } from '@/server/messaging/group-offers';

type Row = Record<string, unknown>;
export type GroupChannelDb = 'tg' | 'wa';
export type GroupStatus = 'proposta' | 'aprovada' | 'enviada' | 'rejeitada' | 'expirada' | 'erro';

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
  };
}

/** Fila persistida (propostas e histórico recente). [] se a tabela não existe. */
export async function listQueue(limit = 60): Promise<QueueRow[]> {
  if (!(await groupMessagesTableExists())) return [];
  const rows = await db.execute<Row>(sql`
    SELECT id, message_key, trigger, channel, master_product_id, price_cents_detected, needs_review, candidate, text_body, status, created_at, sent_at, error
    FROM group_messages ORDER BY
      CASE status WHEN 'proposta' THEN 0 WHEN 'aprovada' THEN 1 ELSE 2 END, created_at DESC
    LIMIT ${limit}::int
  `);
  return rows.map(mapRow);
}

/**
 * Grava as propostas novas (dois canais por candidato). Ignora o que já existe (dedup_key + canal) e produto que já tem
 * proposta aberta (proposta/aprovada) nas últimas 48 h no mesmo canal. Candidato não enviável nunca é gravado.
 * Só escreve se a tabela existir.
 */
export async function persistProposals(result: DetectionResult): Promise<{ inserted: number; skipped: number }> {
  if (!(await groupMessagesTableExists())) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  let skipped = 0;
  for (const c of result.candidates) {
    if (!c.sendable) {
      skipped++;
      continue;
    }
    for (const ch of ['tg', 'wa'] as const) {
      const text = ch === 'tg' ? c.texts.telegram : c.texts.whatsapp;
      const res = await db.execute(sql`
        INSERT INTO group_messages (message_key, trigger, channel, vertical, master_product_id, offer_id, price_cents_detected, avg_cents, needs_review, candidate, text_body, dedup_key)
        SELECT ${c.messageKey}, ${c.trigger}, ${ch}, ${c.vertical}, ${c.trigger === 'G4' ? null : c.masterProductId}::uuid, ${c.offerIds[0]}::uuid,
               ${c.priceCents}::bigint, ${c.avgCents}::bigint, ${c.status === 'review'}, ${JSON.stringify(c)}::jsonb, ${text}, ${c.dedupKey}
        WHERE NOT EXISTS (
          SELECT 1 FROM group_messages g
          WHERE g.channel = ${ch} AND g.master_product_id = ${c.trigger === 'G4' ? null : c.masterProductId}::uuid
            AND g.status IN ('proposta', 'aprovada') AND g.created_at >= now() - interval '48 hours'
        )
        ON CONFLICT (dedup_key, channel) DO NOTHING
      `);
      if (Number((res as { count?: number }).count ?? 0) > 0) inserted++;
      else skipped++;
    }
  }
  return { inserted, skipped };
}

/** Propostas velhas perdem a validade (o preço mudou): proposta em 3 h, aprovada em 12 h. */
export async function expireStale(): Promise<number> {
  if (!(await groupMessagesTableExists())) return 0;
  const res = await db.execute(sql`
    UPDATE group_messages SET status = 'expirada', updated_at = now(), error = COALESCE(error, 'expirada sem envio')
    WHERE (status = 'proposta' AND created_at < now() - interval '3 hours') OR (status = 'aprovada' AND created_at < now() - interval '12 hours')
  `);
  return Number((res as { count?: number }).count ?? 0);
}

/** Aprova ou rejeita a proposta nos dois canais (mesmo message_key). */
export async function setStatusByKey(messageKey: string, status: 'aprovada' | 'rejeitada', adminId: string | null): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE group_messages SET status = ${status}, updated_at = now(),
      approved_at = ${status === 'aprovada' ? sql`now()` : sql`approved_at`}, approved_by = ${status === 'aprovada' ? adminId : null}::uuid
    WHERE message_key = ${messageKey} AND status IN ('proposta', 'aprovada')
  `);
  return Number((res as { count?: number }).count ?? 0) > 0;
}

/** WhatsApp assistido: o admin enviou/colou manualmente. Registra como enviada no canal 'wa' (conta nos limites do canal). */
export async function markWhatsappSentByKey(messageKey: string): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE group_messages SET status = 'enviada', sent_at = now(), updated_at = now()
    WHERE message_key = ${messageKey} AND channel = 'wa' AND status IN ('proposta', 'aprovada')
  `);
  return Number((res as { count?: number }).count ?? 0) > 0;
}

export async function telegramRowIdByKey(messageKey: string): Promise<string | null> {
  const rows = await db.execute<Row>(sql`SELECT id FROM group_messages WHERE message_key = ${messageKey} AND channel = 'tg' LIMIT 1`);
  return rows[0] ? String(rows[0].id) : null;
}

export interface SendOutcome {
  ok: boolean;
  /** sent | deferred (fica aprovada) | expired | failed | blocked */
  outcome: 'sent' | 'deferred' | 'expired' | 'failed' | 'blocked';
  reason?: string;
  messageId?: string;
}

/**
 * Envia UMA proposta APROVADA do Telegram. Passos (todos obrigatórios):
 *  1. kill-switch + modo send + token + chat id (falha fechada);
 *  2. só status 'aprovada' e canal 'tg'; trava atômica (claimed_at) contra clique + cron simultâneos;
 *  3. limites (silêncio, 3/dia, 1/hora, 48 h por produto, rodízio);
 *  4. revalidação: re-detecta com preço < 30 min; o gatilho precisa continuar valendo e o preço estar dentro de 2 %
 *     do detectado; o texto enviado é o RELIDO (preço atual), com o mesmo message_key.
 */
export async function sendApprovedTelegram(id: string, now = new Date()): Promise<SendOutcome> {
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

  // Limites
  const hist = await loadSentHistory('tg', now);
  const asAuto: Candidate = { ...row.candidate, status: 'auto', sendable: true };
  const plan = applyLimits([asAuto], hist.records, now);
  if (!plan.next) return { ok: false, outcome: 'deferred', reason: plan.deferred[0]?.reason ?? 'limite' };

  // Trava
  const claim = await db.execute(sql`
    UPDATE group_messages SET claimed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid AND status = 'aprovada' AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
  `);
  if (Number((claim as { count?: number }).count ?? 0) === 0) return { ok: false, outcome: 'blocked', reason: 'envio já em andamento' };

  try {
    // Revalidação com preço fresco (< 30 min)
    const productIds = row.candidate.trigger === 'G4' ? undefined : [row.candidate.masterProductId];
    const live = await detectGroupCandidates({ now, maxAgeMin: RULES.SEND_MAX_AGE_MIN, productIds, history: hist.records, adTag: getAdTag() });
    const match = live.candidates.find((c) =>
      row.candidate.trigger === 'G4'
        ? c.trigger === 'G4' && row.candidate.offerIds.every((o) => c.offerIds.includes(o))
        : c.masterProductId === row.candidate.masterProductId && c.trigger === row.candidate.trigger
    );
    if (!match || !match.sendable) {
      await db.execute(sql`UPDATE group_messages SET status = 'expirada', claimed_at = NULL, updated_at = now(), error = 'revalidação: já não vale (preço velho, sumiu ou mudou)' WHERE id = ${id}::uuid`);
      return { ok: false, outcome: 'expired', reason: 'revalidação: já não vale' };
    }
    if (row.candidate.trigger !== 'G4' && row.priceCentsDetected != null && !priceWithinTolerance(row.priceCentsDetected, match.priceCents)) {
      await db.execute(sql`UPDATE group_messages SET status = 'expirada', claimed_at = NULL, updated_at = now(), error = 'revalidação: preço mudou mais de 2 %' WHERE id = ${id}::uuid`);
      return { ok: false, outcome: 'expired', reason: 'preço mudou mais de 2 %' };
    }

    const sent = await sendTelegramGroupMessage({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_GROUP_CHAT_ID,
      text: match.texts.telegram,
    });
    if (sent.ok) {
      await db.execute(sql`
        UPDATE group_messages SET status = 'enviada', sent_at = now(), updated_at = now(), claimed_at = NULL, error = NULL,
          provider_message_id = ${sent.messageId ?? null}, text_body = ${match.texts.telegram}, price_cents_detected = ${match.priceCents}::bigint
        WHERE id = ${id}::uuid
      `);
      return { ok: true, outcome: 'sent', messageId: sent.messageId };
    }
    // Definitivo (403, chat não encontrado, 401): status 'erro', nunca tenta de novo. Temporário: segue aprovada para a próxima rodada.
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

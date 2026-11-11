import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { canSendTelegram, getAdTag, getGroupMessagesMode } from '@/lib/messaging/group-config';
import { canAutoSend, memberBrake, shouldCountMembers, type AutomationState, type MemberBrake } from '@/lib/messaging/group-automation';
import { applyLimits, type Candidate } from '@/lib/messaging/group-rules';
import { getTelegramMemberCount, type FetchLike } from '@/lib/messaging/telegram-send';
import { getAutomation } from '@/server/messaging/group-automation-store';
import { detectGroupCandidates, groupMessagesTableExists, groupMessagesV2Ready, type DetectionResult } from '@/server/messaging/group-offers';
import {
  expireStale,
  listPendingForSend,
  persistProposals,
  revalidateCandidate,
  runRechecks,
  sendApprovedTelegram,
  sendQueuedTelegram,
  type CouponLookupFn,
  type RenderCardFn,
  type SendOutcome,
} from '@/server/messaging/group-queue';

type Row = Record<string, unknown>;

/**
 * Ciclo do cron das mensagens (a cada 5 min quando for agendado; NÃO está no vercel.json). Idempotente e tolerante a
 * execuções sobrepostas: a reivindicação da linha é atômica (sendQueuedTelegram), a gravação usa ON CONFLICT DO NOTHING e
 * a contagem de inscritos só grava a cada ~55 min.
 *
 * Ordem: estado da automação (linha de feature_flags, cache 30 s) -> expira velhas -> vigia a Amazon (ausência/volta) ->
 * contagem de inscritos e freio -> detecta -> grava decisões -> envia (só no estado 'on') -> reconferência de 30 min -> collector_runs.
 *
 * PONTOS DE LIGAÇÃO (outros engenheiros entregam em paralelo; este módulo NÃO importa nenhum deles):
 *  - `renderCard(masterProductId)`: cartão de histórico em PNG. A rota deve passar o renderizador quando existir
 *    (ex.: import { renderHistoryCard } from '@/server/messaging/history-card'). Com ele, alerta/insight saem por sendPhoto.
 *  - `couponLookup(offerId)`: cupom verificado { code, conditions, expiresAt, verifiedAt } ou null. Com ele, a linha do cupom
 *    entra no texto só se estiver verificada, vista há <= 2 h e dentro da validade lida.
 */
export interface CycleDeps {
  now?: Date;
  fetchImpl?: FetchLike;
  renderCard?: RenderCardFn;
  couponLookup?: CouponLookupFn;
}

export interface CycleSummary {
  ok: boolean;
  [k: string]: unknown;
}

/** Vigia da Amazon: registra quando uma oferta some da busca e quando volta (para exigir 2 observações >= 15 min). */
export async function syncAmazonWatch(): Promise<{ absent: number; returned: number }> {
  if (!(await groupMessagesV2Ready())) return { absent: 0, returned: 0 };
  const absent = await db.execute(sql`
    INSERT INTO group_offer_watch (offer_id, absent_since, returned_at, updated_at)
    SELECT o.id, now(), NULL, now() FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE (n.slug || ' ' || n.name) ILIKE '%amazon%' AND o.status = 'active' AND o.consecutive_miss_count > 0
    ON CONFLICT (offer_id) DO UPDATE SET
      absent_since = COALESCE(group_offer_watch.absent_since, EXCLUDED.absent_since), returned_at = NULL, updated_at = now()
  `);
  const returned = await db.execute(sql`
    UPDATE group_offer_watch w SET returned_at = o.last_price_confirmed_at, updated_at = now()
    FROM affiliate_offers o
    WHERE o.id = w.offer_id AND w.absent_since IS NOT NULL AND w.returned_at IS NULL
      AND o.consecutive_miss_count = 0 AND o.last_price_confirmed_at > w.absent_since
  `);
  return { absent: Number((absent as { count?: number }).count ?? 0), returned: Number((returned as { count?: number }).count ?? 0) };
}

export interface MemberStatus {
  brake: MemberBrake;
  counted: boolean;
  error?: string;
}

/** Lê getChatMemberCount a cada ~55 min, grava e calcula o freio (queda do pico de 24 h contra o limite configurável, padrão 5%). */
export async function runMemberCount(now: Date, limitPct: number, fetchImpl?: FetchLike): Promise<MemberStatus> {
  const empty: MemberBrake = { paused: false, dropPct: null, peak: null, current: null, stale: true, points: 0 };
  if (!(await groupMessagesV2Ready())) return { brake: empty, counted: false };
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let counted = false;
  let error: string | undefined;
  if (chatId && token) {
    const last = await db.execute<Row>(sql`SELECT max(counted_at) AS at FROM group_member_counts WHERE chat_id = ${chatId}`);
    const lastAt = last[0]?.at ? new Date(last[0].at as string | Date) : null;
    if (shouldCountMembers(lastAt, now)) {
      const r = await getTelegramMemberCount({ token, chatId, fetchImpl });
      if (r.ok && r.count != null) {
        await db.execute(sql`INSERT INTO group_member_counts (chat_id, member_count, counted_at) VALUES (${chatId}, ${r.count}::int, ${now.toISOString()}::timestamptz)`);
        counted = true;
      } else error = r.error;
    }
  }
  const pts = chatId
    ? await db.execute<Row>(sql`
        SELECT counted_at, member_count FROM group_member_counts
        WHERE chat_id = ${chatId} AND counted_at >= ${new Date(now.getTime() - 26 * 3600_000).toISOString()}::timestamptz ORDER BY counted_at
      `)
    : [];
  const brake = memberBrake(
    pts.map((p) => ({ at: new Date(p.counted_at as string | Date), count: Number(p.member_count) })),
    now,
    limitPct
  );
  return { brake, counted, error };
}

async function logRun(started: Date, status: 'ok' | 'error', meta: Record<string, unknown>): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, errors, meta)
      VALUES ('group-messages', 'telegram', ${started.toISOString()}::timestamptz, now(), ${Math.max(0, Date.now() - started.getTime())}::int, ${status},
              ${Number(meta.candidates ?? 0)}::int, ${Number(meta.sentCount ?? 0)}::int, ${status === 'error' ? 1 : 0}::int, ${JSON.stringify(meta)}::jsonb)
    `);
  } catch (e) {
    console.error('[group-messages] falha ao registrar collector_runs', e instanceof Error ? e.message : e);
  }
}

/** Modo sombra: escolhe o vencedor do plano que também passa na releitura de envio (frescor 30/40 min). */
export async function pickShadowWinner(detection: DetectionResult, now: Date): Promise<{ messageKey: string; sound: boolean } | null> {
  let pool = detection.candidates.filter((c) => c.sendable && c.status === 'auto' && !c.held);
  let plan = detection.plan;
  for (let i = 0; i < 3 && plan.next; i++) {
    const next = plan.next;
    const rev = await revalidateCandidate(next, next.priceCents, detection.history, { now, allowReview: false });
    if (rev.ok) return { messageKey: next.messageKey, sound: plan.nextSound };
    pool = pool.filter((c) => c.messageKey !== next.messageKey);
    plan = applyLimits(pool, detection.history, now);
  }
  return null;
}

export async function runGroupMessagesCycle(deps: CycleDeps = {}): Promise<CycleSummary> {
  const started = new Date();
  const now = deps.now ?? started;
  const mode = getGroupMessagesMode();
  const table = await groupMessagesTableExists();
  const v2 = table && (await groupMessagesV2Ready());
  const automation = await getAutomation();
  // Sem a migration 0030 a automação não existe: cai para 'off' (propostas manuais, como na 0028).
  const state: AutomationState = v2 ? automation.state : 'off';
  const summary: CycleSummary = { ok: true, mode, automation: automation.state, effectiveState: state, v2Ready: v2, tableExists: table };
  if (automation.state !== 'off' && !v2) summary.warning = 'Automação ligada na linha de feature_flags, mas a migration 0030 não foi aplicada: tratada como off.';

  try {
    summary.expired = await expireStale();
    if (v2) summary.amazonWatch = await syncAmazonWatch();

    const members = await runMemberCount(now, automation.maxMemberDropPct, deps.fetchImpl);
    summary.members = { ...members.brake, counted: members.counted, ...(members.error ? { error: members.error } : {}) };

    const detection = await detectGroupCandidates({ now, includeSimulated: state === 'shadow', adTag: getAdTag() });
    summary.counts = detection.counts;
    summary.warnings = detection.warnings;
    summary.amazon = { paused: detection.config.amazonPaused, lastRunAt: detection.config.amazonLastRunAt };

    const shadowWinner = state === 'shadow' ? await pickShadowWinner(detection, now) : null;
    summary.persisted = await persistProposals(detection, { state, shadowWinner });
    if (state === 'shadow') summary.shadow = { winner: shadowWinner, deferred: detection.plan.deferred.length, state: detection.plan.state };

    // ---- envio ----
    const gate = canSendTelegram();
    const auto = canAutoSend(state, members.brake, gate.ok);
    let sentCount = 0;
    if (mode === 'send' && gate.ok && state !== 'shadow') {
      const statuses = auto.ok ? (['aprovada', 'proposta_auto'] as const) : (['aprovada'] as const);
      if (v2) {
        let pending = await listPendingForSend([...statuses]);
        let outcome: SendOutcome | { outcome: string; reason?: string } = { outcome: 'nada na fila para enviar' };
        for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
          const cands: Candidate[] = pending.map((r) => ({ ...r.candidate, status: 'auto', held: false, sendable: true }));
          const plan = applyLimits(cands, detection.history, now);
          if (!plan.next) {
            outcome = { outcome: 'adiada', reason: plan.deferred[0]?.reason ?? 'limite' };
            break;
          }
          const row = pending.find((r) => r.messageKey === plan.next?.messageKey);
          if (!row) break;
          const r = await sendQueuedTelegram(row.id, { now, fetchImpl: deps.fetchImpl, renderCard: deps.renderCard, couponLookup: deps.couponLookup });
          outcome = r;
          if (r.outcome === 'sent') sentCount++;
          if (r.outcome !== 'expired') break;
          pending = pending.filter((x) => x.id !== row.id); // expirou: tenta a próxima do plano (no máximo 3 por execução)
        }
        summary.send = outcome;
      } else {
        const next = await db
          .execute<{ id: string }>(sql`SELECT id FROM group_messages WHERE channel = 'tg' AND status = 'aprovada' AND claimed_at IS NULL ORDER BY approved_at NULLS LAST, created_at LIMIT 1`)
          .catch(() => []);
        const r = next[0] ? await sendApprovedTelegram(String(next[0].id), now) : { outcome: 'nada aprovado para enviar' };
        summary.send = r;
        if ((r as SendOutcome).outcome === 'sent') sentCount++;
      }
    } else {
      summary.send = { outcome: 'não enviou', reason: state === 'shadow' ? 'modo sombra: só registra a decisão' : mode !== 'send' ? 'GROUP_MESSAGES_MODE != send' : gate.reason };
    }
    if (state === 'on' && !auto.ok) summary.autoPaused = auto.reason;

    if (v2) summary.rechecks = await runRechecks(now);
    await logRun(started, 'ok', { state, candidates: detection.counts.candidates, sentCount, persisted: summary.persisted, brake: members.brake.paused, amazonPaused: detection.config.amazonPaused });
    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : 'erro';
    await logRun(started, 'error', { state, erro: msg });
    return { ...summary, ok: false, error: msg };
  }
}

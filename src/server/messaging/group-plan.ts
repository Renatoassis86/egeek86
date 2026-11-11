import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { AutomationState } from '@/lib/messaging/group-automation';
import { applyLimits, orderQueue, planDaySlots, windowAdjust, type MessageClass } from '@/lib/messaging/group-rules';
import { getAutomation } from '@/server/messaging/group-automation-store';
import { groupMessagesV2Ready, loadSentHistory } from '@/server/messaging/group-offers';
import { listPendingForSend } from '@/server/messaging/group-queue';

type Row = Record<string, unknown>;

/** DTO serializável do bloco "Fila e distribuição" de /admin/mensagens. */
export interface QueuePlanDTO {
  ready: boolean;
  state: AutomationState;
  generatedAt: string;
  /** Intervalo mínimo vigente entre mensagens, em minutos, e quando sai a próxima. */
  minGapMin: number;
  lastSentAt: string | null;
  nextEligibleAt: string;
  hourSent: number;
  hourlyCap: number;
  day: {
    dailyCap: number;
    sentToday: number;
    remaining: number;
    soundRemaining: number;
    soundCap: number;
    slotsLeft: number;
    bands: Array<{ id: string; label: string; silent: boolean; slots: number }>;
  };
  /** Fila na ordem em que sairia: a primeira é a próxima. */
  queue: Array<{
    position: number;
    messageKey: string;
    trigger: string;
    cls: MessageClass;
    name: string;
    reason: string;
    status: string;
    estimatedAt: string | null;
    waiting: string | null;
  }>;
  sentToday: Array<{ at: string; trigger: string; cls: string | null; name: string; sound: boolean }>;
}

const WAIT_LABEL: Array<[RegExp, string]> = [
  [/^intervalo_minimo_\d+min_desde_a_ultima/, 'aguardando o intervalo mínimo desde a última mensagem'],
  [/^teto_horario/, 'teto por hora atingido'],
  [/^teto_diario/, 'teto do dia atingido'],
  [/^mesmo_produto/, 'mesmo produto enviado há menos de 3 h'],
  [/^produto_ja_enviado/, 'produto já enviado (regra de 24 h/48 h)'],
  [/^fila_1_envio_por_execucao/, 'na fila: uma mensagem por execução'],
  [/^radar_so/, 'radar só na janela da hora cheia'],
];
const waitLabel = (r: string) => WAIT_LABEL.find(([re]) => re.test(r))?.[1] ?? r.replace(/_/g, ' ');

export async function loadQueuePlan(now = new Date()): Promise<QueuePlanDTO> {
  const automation = await getAutomation({ fresh: true });
  const v2 = await groupMessagesV2Ready().catch(() => false);
  const empty = planDaySlots(now, []);
  const base: QueuePlanDTO = {
    ready: v2,
    state: automation.state,
    generatedAt: now.toISOString(),
    minGapMin: empty.gapNowMin,
    lastSentAt: null,
    nextEligibleAt: now.toISOString(),
    hourSent: 0,
    hourlyCap: empty.hourlyCap,
    day: { dailyCap: empty.dailyCap, sentToday: 0, remaining: empty.remaining, soundRemaining: empty.soundRemaining, soundCap: empty.soundCap, slotsLeft: empty.slots.length, bands: empty.bands },
    queue: [],
    sentToday: [],
  };
  if (!v2) return base;
  try {
    const hist = await loadSentHistory('tg', now);
    const plan = planDaySlots(now, hist.records);
    const lim = applyLimits([], hist.records, now);
    const pending = await listPendingForSend(['aprovada', 'proposta_auto'], 100);
    const cands = pending.map((r) => ({ ...r.candidate, status: 'auto' as const, held: false, sendable: true }));
    const ordered = orderQueue(cands, hist.records);
    const deferred = new Map(applyLimits(cands, hist.records, now).deferred.map((d) => [d.messageKey, d.reason]));
    const rowByKey = new Map(pending.map((r) => [r.messageKey, r]));
    base.queue = ordered.map((c, i) => {
      const slot = plan.slots[i]?.at;
      const why = deferred.get(c.messageKey);
      return {
        position: i + 1,
        messageKey: c.messageKey,
        trigger: c.trigger,
        cls: c.cls,
        name: c.name,
        reason: c.reason,
        status: rowByKey.get(c.messageKey)?.status ?? 'proposta_auto',
        estimatedAt: slot ? windowAdjust(c, slot).toISOString() : null,
        waiting: why && !/^fila_1_envio/.test(why) ? waitLabel(why) : why ? waitLabel(why) : null,
      };
    });
    const dayStart = new Date(`${plan.day}T00:00:00-03:00`).toISOString();
    const sent = await db.execute<Row>(sql`
      SELECT sent_at, trigger, msg_class, is_sound, candidate ->> 'name' AS name FROM group_messages
      WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= ${dayStart}::timestamptz ORDER BY sent_at DESC LIMIT 150
    `);
    base.sentToday = sent.map((r) => ({
      at: new Date(r.sent_at as string | Date).toISOString(),
      trigger: String(r.trigger),
      cls: (r.msg_class as string | null) ?? null,
      name: String(r.name ?? ''),
      sound: r.is_sound === true,
    }));
    base.minGapMin = lim.state.spacing.gapMin;
    base.lastSentAt = lim.state.spacing.lastSentAt ? lim.state.spacing.lastSentAt.toISOString() : null;
    base.nextEligibleAt = lim.state.spacing.nextEligibleAt.toISOString();
    base.hourSent = lim.state.spacing.hourSent;
    base.hourlyCap = lim.state.spacing.hourlyCap;
    base.day = { dailyCap: plan.dailyCap, sentToday: plan.sentToday, remaining: plan.remaining, soundRemaining: plan.soundRemaining, soundCap: plan.soundCap, slotsLeft: plan.slots.length, bands: plan.bands };
  } catch {
    // painel de leitura: nunca derruba a página
  }
  return base;
}

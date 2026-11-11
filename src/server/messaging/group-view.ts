import type { Candidate } from '@/lib/messaging/group-rules';
import type { QueueRow } from '@/server/messaging/group-queue';

/** DTO serializável para a tela /admin/mensagens (só tipos e mapeamento; sem banco). */
export interface GroupViewItem {
  messageKey: string;
  trigger: string;
  status: string;
  statusTg: string;
  statusWa: string;
  needsReview: boolean;
  sendable: boolean;
  notSendableReason: string | null;
  reason: string;
  reviewReasons: string[];
  name: string;
  priceCents: number;
  belowAvgPct: number | null;
  networkSlug: string;
  telegram: string;
  whatsapp: string;
  createdAt: string | null;
  error: string | null;
}

export function toViewItem(c: Candidate): GroupViewItem {
  return {
    messageKey: c.messageKey,
    trigger: c.trigger,
    status: 'ao vivo',
    statusTg: 'ao vivo',
    statusWa: 'ao vivo',
    needsReview: c.status === 'review',
    sendable: c.sendable,
    notSendableReason: c.notSendableReason,
    reason: c.reason,
    reviewReasons: c.reviewReasons,
    name: c.name,
    priceCents: c.priceCents,
    belowAvgPct: c.belowAvgPct,
    networkSlug: c.networkSlug,
    telegram: c.texts.telegram,
    whatsapp: c.texts.whatsapp,
    createdAt: null,
    error: null,
  };
}

/** Junta as duas linhas (tg + wa) de um mesmo message_key em um item. */
export function queueToViewItems(rows: QueueRow[]): GroupViewItem[] {
  const by = new Map<string, QueueRow[]>();
  for (const r of rows) {
    const list = by.get(r.messageKey) ?? [];
    list.push(r);
    by.set(r.messageKey, list);
  }
  const out: GroupViewItem[] = [];
  for (const [key, list] of by) {
    const tg = list.find((r) => r.channel === 'tg');
    const wa = list.find((r) => r.channel === 'wa');
    const base = (tg ?? wa) as QueueRow;
    const c = base.candidate;
    out.push({
      messageKey: key,
      trigger: base.trigger,
      status: tg?.status ?? wa?.status ?? 'proposta',
      statusTg: tg?.status ?? '-',
      statusWa: wa?.status ?? '-',
      needsReview: base.needsReview,
      sendable: c.sendable,
      notSendableReason: c.notSendableReason,
      reason: c.reason,
      reviewReasons: c.reviewReasons ?? [],
      name: c.name,
      priceCents: c.priceCents,
      belowAvgPct: c.belowAvgPct,
      networkSlug: c.networkSlug,
      telegram: tg?.textBody ?? c.texts.telegram,
      whatsapp: wa?.textBody ?? c.texts.whatsapp,
      createdAt: base.createdAt,
      error: tg?.error ?? wa?.error ?? null,
    });
  }
  return out;
}

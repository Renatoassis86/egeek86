'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { canSendTelegram, getAdTag } from '@/lib/messaging/group-config';
import { MESSAGE_KEY_RE } from '@/lib/messaging/group-messages';
import { detectGroupCandidates, groupMessagesTableExists } from '@/server/messaging/group-offers';
import {
  expireStale,
  markWhatsappSentByKey,
  persistProposals,
  sendApprovedTelegram,
  setStatusByKey,
  telegramRowIdByKey,
} from '@/server/messaging/group-queue';
import { toViewItem, type GroupViewItem } from '@/server/messaging/group-view';

export interface GroupActionResult {
  ok: boolean;
  message: string;
  /** Modo ao vivo (sem tabela): candidatos recém-calculados para a tela. */
  live?: GroupViewItem[];
  inserted?: number;
}

function badKey(key: string): boolean {
  return typeof key !== 'string' || !MESSAGE_KEY_RE.test(key);
}

/** "Gerar novas propostas": roda o detector em dry. Com a tabela, grava as propostas; sem ela, devolve os candidatos ao vivo. */
export async function generateProposalsAction(): Promise<GroupActionResult> {
  await requireAdmin();
  try {
    const result = await detectGroupCandidates({ adTag: getAdTag() });
    if (await groupMessagesTableExists()) {
      await expireStale();
      const p = await persistProposals(result);
      revalidatePath('/admin/mensagens');
      return {
        ok: true,
        inserted: p.inserted,
        message: `${result.counts.candidates} candidatos; ${p.inserted} propostas novas gravadas (${result.counts.blocked} bloqueios com motivo).`,
      };
    }
    return {
      ok: true,
      live: result.candidates.map(toViewItem),
      message: `Modo ao vivo (tabela group_messages ausente): ${result.counts.candidates} candidatos calculados agora, nada foi gravado.`,
    };
  } catch (e) {
    return { ok: false, message: `Falha ao calcular: ${e instanceof Error ? e.message.slice(0, 200) : 'erro'}` };
  }
}

export async function approveGroupMessageAction(messageKey: string): Promise<GroupActionResult> {
  const admin = await requireAdmin();
  if (badKey(messageKey)) return { ok: false, message: 'Chave inválida.' };
  if (!(await groupMessagesTableExists())) return { ok: false, message: 'Tabela group_messages ausente: aprovação só depois da migration 0028.' };
  const ok = await setStatusByKey(messageKey, 'aprovada', admin.id);
  revalidatePath('/admin/mensagens');
  return { ok, message: ok ? 'Aprovada.' : 'Não foi possível aprovar (já tratada ou expirada).' };
}

export async function rejectGroupMessageAction(messageKey: string): Promise<GroupActionResult> {
  const admin = await requireAdmin();
  if (badKey(messageKey)) return { ok: false, message: 'Chave inválida.' };
  if (!(await groupMessagesTableExists())) return { ok: false, message: 'Tabela group_messages ausente.' };
  const ok = await setStatusByKey(messageKey, 'rejeitada', admin.id);
  revalidatePath('/admin/mensagens');
  return { ok, message: ok ? 'Rejeitada.' : 'Não foi possível rejeitar (já tratada).' };
}

/** Registra que o texto do WhatsApp foi enviado à mão (para os limites e a medição). */
export async function markWhatsappSentAction(messageKey: string): Promise<GroupActionResult> {
  await requireAdmin();
  if (badKey(messageKey)) return { ok: false, message: 'Chave inválida.' };
  if (!(await groupMessagesTableExists())) return { ok: false, message: 'Tabela group_messages ausente: sem registro.' };
  const ok = await markWhatsappSentByKey(messageKey);
  revalidatePath('/admin/mensagens');
  return { ok, message: ok ? 'Registrada como enviada no WhatsApp.' : 'Já registrada ou fora da fila.' };
}

/** "Enviar agora no Telegram": só proposta aprovada, só com a flag ligada e GROUP_MESSAGES_MODE=send. */
export async function sendTelegramNowAction(messageKey: string): Promise<GroupActionResult> {
  await requireAdmin();
  if (badKey(messageKey)) return { ok: false, message: 'Chave inválida.' };
  const gate = canSendTelegram();
  if (!gate.ok) return { ok: false, message: `Envio travado: ${gate.reason}.` };
  const id = await telegramRowIdByKey(messageKey);
  if (!id) return { ok: false, message: 'Proposta do Telegram não encontrada.' };
  const r = await sendApprovedTelegram(id);
  revalidatePath('/admin/mensagens');
  return { ok: r.ok, message: r.ok ? 'Enviada no Telegram.' : `Não enviada (${r.outcome}): ${r.reason ?? ''}` };
}

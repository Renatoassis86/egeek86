'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateMessages } from '@/db/schema';

export async function updateMessageAction({
  id,
  messageText,
}: {
  id: string;
  messageText: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!id || !messageText.trim()) {
      return { ok: false, error: 'ID e texto da mensagem são obrigatórios.' };
    }

    await db
      .update(affiliateMessages)
      .set({ messageText: messageText.trim() })
      .where(eq(affiliateMessages.id, id));

    revalidatePath('/admin/mensagens');
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao atualizar mensagem:', err);
    return { ok: false, error: err.message ?? 'Falha ao atualizar mensagem.' };
  }
}

export async function deleteMessageAction({
  id,
}: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!id) {
      return { ok: false, error: 'ID da mensagem inválido.' };
    }

    await db.delete(affiliateMessages).where(eq(affiliateMessages.id, id));

    revalidatePath('/admin/mensagens');
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao excluir mensagem:', err);
    return { ok: false, error: err.message ?? 'Falha ao excluir mensagem.' };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateMessages } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';

async function assertAdmin(): Promise<{ ok: false; error: string } | null> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Não autenticado.' };
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    return { ok: false, error: 'Sem permissão.' };
  }
  return null;
}

export async function updateMessageAction({
  id,
  messageText,
}: {
  id: string;
  messageText: string;
}): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertAdmin();
  if (denied) return denied;
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
  const denied = await assertAdmin();
  if (denied) return denied;
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

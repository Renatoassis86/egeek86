'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gamerSurveys, type SurveyOptionItem } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';

async function assertAdmin(): Promise<{ ok: false; error: string } | null> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Não autenticado.' };
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    return { ok: false, error: 'Sem permissão.' };
  }
  return null;
}

export async function createSurveyQuestionAction({
  question,
  category = 'Geral',
  options,
}: {
  question: string;
  category?: string;
  options: SurveyOptionItem[];
}): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertAdmin();
  if (denied) return denied;
  try {
    if (!question.trim() || !options || options.length === 0) {
      return { ok: false, error: 'Pergunta e opções são obrigatórias.' };
    }

    await db.insert(gamerSurveys).values({
      question: question.trim(),
      category: category.trim() || 'Geral',
      options,
      isActive: true,
    });

    revalidatePath('/admin/pesquisa');
    revalidatePath('/pesquisa');
    revalidatePath('/');
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao cadastrar enquete:', err);
    return { ok: false, error: err.message ?? 'Falha ao cadastrar enquete.' };
  }
}

export async function updateSurveyQuestionAction({
  id,
  question,
  category = 'Geral',
  options,
  isActive = true,
}: {
  id: string;
  question: string;
  category?: string;
  options: SurveyOptionItem[];
  isActive?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertAdmin();
  if (denied) return denied;
  try {
    if (!id || !question.trim()) {
      return { ok: false, error: 'ID e pergunta são obrigatórios.' };
    }

    await db
      .update(gamerSurveys)
      .set({
        question: question.trim(),
        category: category.trim() || 'Geral',
        options,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(gamerSurveys.id, id));

    revalidatePath('/admin/pesquisa');
    revalidatePath('/pesquisa');
    revalidatePath('/');
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao atualizar enquete:', err);
    return { ok: false, error: err.message ?? 'Falha ao atualizar enquete.' };
  }
}

export async function deleteSurveyQuestionAction({
  id,
}: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertAdmin();
  if (denied) return denied;
  try {
    if (!id) {
      return { ok: false, error: 'ID da enquete inválido.' };
    }

    await db.delete(gamerSurveys).where(eq(gamerSurveys.id, id));

    revalidatePath('/admin/pesquisa');
    revalidatePath('/pesquisa');
    revalidatePath('/');
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao excluir enquete:', err);
    return { ok: false, error: err.message ?? 'Falha ao excluir enquete.' };
  }
}

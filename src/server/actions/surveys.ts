'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gamerSurveys, type SurveyOptionItem } from '@/db/schema';

export async function createSurveyQuestionAction({
  question,
  category = 'Geral',
  options,
}: {
  question: string;
  category?: string;
  options: SurveyOptionItem[];
}): Promise<{ ok: boolean; error?: string }> {
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

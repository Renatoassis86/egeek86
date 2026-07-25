'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { surveyResponses } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { SURVEY_QUESTIONS } from '@/lib/survey/questions';

export interface SubmitSurveyInput {
  answers: Record<string, string>;
}

/**
 * Grava resposta da pesquisa de satisfação/mercado — aceita anônimo de
 * propósito (pesquisa de mercado não deve travar em login), mas associa ao
 * perfil quando o respondente estiver logado.
 */
export async function submitSurveyResponse(input: SubmitSurveyInput): Promise<{ ok: boolean; error?: string }> {
  for (const q of SURVEY_QUESTIONS) {
    if (q.required && !input.answers[q.key]?.trim()) {
      return { ok: false, error: `Responda: "${q.label}"` };
    }
  }

  const profile = await getCurrentProfile();

  const cleanAnswers: Record<string, string> = {};
  for (const q of SURVEY_QUESTIONS) {
    const value = input.answers[q.key]?.trim();
    if (value) cleanAnswers[q.key] = value;
  }

  await db.insert(surveyResponses).values({
    respondentProfileId: profile?.id ?? null,
    answers: cleanAnswers,
  });

  revalidatePath('/admin/pesquisa');
  return { ok: true };
}

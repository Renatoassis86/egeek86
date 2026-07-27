import 'server-only';
import { db } from '@/lib/db';
import { surveyResponses } from '@/db/schema';
import { SURVEY_QUESTIONS, type SurveyQuestionType } from '@/lib/survey/questions';

export interface SurveyOptionAggregate {
  value: string;
  label: string;
  count: number;
  /** % sobre quem respondeu ESSA pergunta (não sobre o total de respostas da pesquisa). */
  percent: number;
}

export interface SurveyQuestionAggregate {
  key: string;
  label: string;
  type: SurveyQuestionType;
  options: SurveyOptionAggregate[];
  /** Só preenchido pra perguntas do tipo 'text' — comentário livre, nunca agregado em %. */
  comments?: string[];
}

export interface SurveyAggregation {
  totalResponses: number;
  questions: SurveyQuestionAggregate[];
}

/**
 * Agrega as respostas reais gravadas em survey_responses.answers (jsonb) —
 * contagem/percentual calculados na leitura, nunca duplicados/pré-somados
 * em outra tabela. Perguntas do tipo texto viram lista de comentários, não
 * um percentual (não faz sentido "agregar" texto livre).
 */
export async function getSurveyAggregation(): Promise<SurveyAggregation> {
  const rows = await db.select({ answers: surveyResponses.answers }).from(surveyResponses);
  const totalResponses = rows.length;

  const questions: SurveyQuestionAggregate[] = SURVEY_QUESTIONS.map((q) => {
    if (q.type === 'text') {
      const comments = rows
        .map((r) => (r.answers as Record<string, string>)[q.key])
        .filter((v): v is string => Boolean(v && v.trim()));
      return { key: q.key, label: q.label, type: q.type, options: [], comments };
    }

    const counts = new Map<string, number>();
    let answeredCount = 0;
    for (const row of rows) {
      const value = (row.answers as Record<string, string>)[q.key];
      if (value) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
        answeredCount++;
      }
    }

    const options: SurveyOptionAggregate[] = (q.options ?? []).map((opt) => {
      const count = counts.get(opt.value) ?? 0;
      return {
        value: opt.value,
        label: opt.label,
        count,
        percent: answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0,
      };
    });

    return { key: q.key, label: q.label, type: q.type, options };
  });

  return { totalResponses, questions };
}

export async function getGamerSurveysForAdmin() {
  try {
    const { gamerSurveys } = await import('@/db/schema');
    const { desc } = await import('drizzle-orm');
    return await db.select().from(gamerSurveys).orderBy(desc(gamerSurveys.createdAt));
  } catch (err) {
    console.error('Erro ao buscar enquetes:', err);
    return [];
  }
}

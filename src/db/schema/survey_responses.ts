import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/**
 * survey_responses — pesquisa de satisfação/mercado fixa (jogos, hábitos de
 * compra, satisfação com o monitoramento do site). v1 é um questionário
 * único e fixo, não um construtor de formulário: `answers` guarda as
 * respostas das perguntas fixas definidas em
 * src/lib/survey/questions.ts, por chave.
 *
 * respondent_profile_id nulo = resposta anônima (permitida de propósito,
 * pesquisa de mercado não deve exigir login). set null (não cascade) no
 * delete do perfil — se o usuário apagar a conta, a resposta em si
 * continua valendo como dado de mercado agregado, só perde o vínculo com
 * quem respondeu.
 */
export const surveyResponses = pgTable('survey_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  respondentProfileId: uuid('respondent_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  answers: jsonb('answers').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type NewSurveyResponse = typeof surveyResponses.$inferInsert;

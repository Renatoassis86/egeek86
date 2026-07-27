import { pgTable, uuid, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';

export interface SurveyOptionItem {
  id: string;
  label: string;
  votes: number;
}

export const gamerSurveys = pgTable('gamer_surveys', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  category: text('category').notNull().default('Geral'),
  options: jsonb('options').$type<SurveyOptionItem[]>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GamerSurveyItem = typeof gamerSurveys.$inferSelect;
export type NewGramerSurveyItem = typeof gamerSurveys.$inferInsert;

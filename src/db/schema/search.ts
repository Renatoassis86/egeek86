import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  smallint,
  numeric,
  boolean,
  char,
  jsonb,
  uniqueIndex,
  index,
  bigserial,
} from 'drizzle-orm/pg-core';
import { citext } from './_types';

export const searchQueries = pgTable(
  'search_queries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    query: text('query').notNull(),
    normalizedQuery: text('normalized_query').notNull(),
    userId: uuid('user_id'),
    sessionId: text('session_id'),
    resultsCount: integer('results_count').notNull(),
    clickedProductId: uuid('clicked_product_id'),
    positionClicked: smallint('position_clicked'),
    filters: jsonb('filters'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_queries_normalized_created_idx').on(t.normalizedQuery, t.createdAt),
    index('search_queries_user_created_idx').on(t.userId, t.createdAt),
  ]
);

export const synonyms = pgTable(
  'synonyms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    term: citext('term').notNull(),
    synonym: citext('synonym').notNull(),
    weight: numeric('weight', { precision: 3, scale: 2 }).notNull().default('1.00'),
    language: char('language', { length: 2 }).notNull().default('pt'),
    isBidirectional: boolean('is_bidirectional').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('synonyms_term_synonym_lang_uq').on(t.term, t.synonym, t.language)]
);

export const trendingTerms = pgTable('trending_terms', {
  term: text('term').primaryKey(),
  searchCount: integer('search_count').notNull(),
  rank: integer('rank').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SearchQuery = typeof searchQueries.$inferSelect;
export type Synonym = typeof synonyms.$inferSelect;
export type TrendingTerm = typeof trendingTerms.$inferSelect;

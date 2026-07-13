import {
  pgTable,
  uuid,
  text,
  timestamp,
  smallint,
  jsonb,
  index,
  primaryKey,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/**
 * events — espelho leve no Postgres. Pipeline replica para warehouse externo.
 * BRIN em created_at para queries time-range em tabela grande.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventName: text('event_name').notNull(),
    eventVersion: smallint('event_version').notNull().default(1),
    userId: uuid('user_id'),
    anonymousId: text('anonymous_id'),
    sessionId: text('session_id'),
    properties: jsonb('properties').notNull().default({}),
    context: jsonb('context').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('analytics_events_name_created_idx').on(t.eventName, t.createdAt),
    index('analytics_events_user_created_idx')
      .on(t.userId, t.createdAt)
      .where(sql`user_id IS NOT NULL`),
    // BRIN para escaneamento eficiente de ranges temporais em tabela enorme
    index('analytics_events_created_brin').using('brin', t.createdAt),
  ]
);

/**
 * identity_links — costura sessões anônimas pré-login com usuário.
 */
export const identityLinks = pgTable(
  'identity_links',
  {
    anonymousId: text('anonymous_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.anonymousId, t.userId] })]
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type IdentityLink = typeof identityLinks.$inferSelect;

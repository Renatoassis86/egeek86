import {
  pgTable,
  text,
  timestamp,
  smallint,
  boolean,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { citext } from './_types';

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),
  rules: jsonb('rules').notNull().default([]),
  rolloutPercentage: smallint('rollout_percentage'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * idempotency_keys — replay protection para endpoints de mutação.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    endpoint: text('endpoint').notNull(),
    userId: uuid('user_id'),
    requestHash: text('request_hash').notNull(),
    responseBody: jsonb('response_body'),
    responseStatus: smallint('response_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (t) => [index('idempotency_keys_expires_idx').on(t.expiresAt)]
);

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * seo_redirects — 301/302 históricos quando slugs/categorias mudam.
 */
export const seoRedirects = pgTable(
  'seo_redirects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oldPath: citext('old_path').notNull(),
    newPath: text('new_path').notNull(),
    statusCode: smallint('status_code').notNull().default(301),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('seo_redirects_old_path_uq').on(t.oldPath)]
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type SeoRedirect = typeof seoRedirects.$inferSelect;

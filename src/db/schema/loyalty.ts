import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pointReason, badgeTier, missionStatus } from './_enums';
import { profiles } from './profiles';

export const levels = pgTable(
  'levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    minPoints: integer('min_points').notNull(),
    minOrders: integer('min_orders').notNull().default(0),
    benefits: jsonb('benefits').notNull().default({}),
    iconUrl: text('icon_url'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('levels_code_uq').on(t.code)]
);

/**
 * points_ledger — APPEND-ONLY. Nunca UPDATE.
 * Saldo de pontos do usuário é derivado deste ledger (com cache em profiles.geek_points).
 */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    delta: integer('delta').notNull(),
    reason: pointReason('reason').notNull(),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    description: text('description'),
    balanceAfter: integer('balance_after').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('points_ledger_idempotency_uq').on(t.idempotencyKey),
    index('points_ledger_user_created_idx').on(t.userId, t.createdAt),
    index('points_ledger_expires_idx')
      .on(t.expiresAt)
      .where(sql`expires_at IS NOT NULL AND delta > 0`),
  ]
);

export const pointRules = pgTable(
  'point_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    description: text('description'),
    triggerEvent: text('trigger_event').notNull(),
    /**
     * formula — { type:'fixed', value:50 } ou { type:'percent_of_order', value:0.01 }
     */
    formula: jsonb('formula').notNull(),
    conditions: jsonb('conditions').notNull().default({}),
    validityDays: integer('validity_days'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('point_rules_code_uq').on(t.code)]
);

export const badges = pgTable(
  'badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    iconUrl: text('icon_url').notNull(),
    tier: badgeTier('tier').notNull().default('bronze'),
    /**
     * criteria — { type:'purchase_count', min:5, window_days:90 }
     */
    criteria: jsonb('criteria').notNull(),
    rewardPoints: integer('reward_points').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    isSecret: boolean('is_secret').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('badges_code_uq').on(t.code)]
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => badges.id),
    progress: jsonb('progress'),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.badgeId] }),
    index('user_badges_user_earned_idx').on(t.userId, t.earnedAt),
  ]
);

export const missions = pgTable(
  'missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    criteria: jsonb('criteria').notNull(),
    rewardPoints: integer('reward_points').notNull(),
    rewardBadgeId: uuid('reward_badge_id').references(() => badges.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('missions_code_uq').on(t.code)]
);

export const userMissions = pgTable(
  'user_missions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id),
    status: missionStatus('status').notNull().default('active'),
    progress: jsonb('progress').notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.missionId] })]
);

export type Level = typeof levels.$inferSelect;
export type PointsLedger = typeof pointsLedger.$inferSelect;
export type PointRule = typeof pointRules.$inferSelect;
export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type Mission = typeof missions.$inferSelect;
export type UserMission = typeof userMissions.$inferSelect;

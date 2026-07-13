import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referrerId: uuid('referrer_id')
      .notNull()
      .references(() => profiles.id),
    referredId: uuid('referred_id')
      .notNull()
      .references(() => profiles.id),
    code: text('code').notNull(),
    status: text('status').notNull().default('pending'), // pending|qualified|rewarded
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('referrals_referred_uq').on(t.referredId)]
);

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;

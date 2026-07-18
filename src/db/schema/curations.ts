import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { drops } from './hype';
import { profiles } from './profiles';
import { reviews } from './engagement';

export const dropCurations = pgTable(
  'drop_curations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    verdict: text('verdict', { enum: ['authentic', 'fake', 'suspicious'] }).notNull(),
    confidence: integer('confidence').notNull().default(3), // 1 a 5
    notes: text('notes').notNull(),
    pointsRewarded: integer('points_rewarded').notNull().default(0),
    isAssertive: boolean('is_assertive').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('drop_curations_drop_idx').on(t.dropId),
    index('drop_curations_user_idx').on(t.userId),
  ]
);

export const reviewCurations = pgTable(
  'review_curations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    verdict: text('verdict', { enum: ['approve', 'reject'] }).notNull(), // approve (real/voto legítimo) ou reject (voto fraudulento/erro do comprador)
    notes: text('notes').notNull(),
    pointsRewarded: integer('points_rewarded').notNull().default(0),
    isAssertive: boolean('is_assertive').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('review_curations_review_idx').on(t.reviewId),
    index('review_curations_user_idx').on(t.userId),
  ]
);

export type DropCuration = typeof dropCurations.$inferSelect;
export type ReviewCuration = typeof reviewCurations.$inferSelect;

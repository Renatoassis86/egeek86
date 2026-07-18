import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { drops } from './hype';
import { profiles } from './profiles';

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

export type DropCuration = typeof dropCurations.$inferSelect;

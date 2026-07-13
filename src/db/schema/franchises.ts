import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { citext } from './_types';

export const franchises = pgTable(
  'franchises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    description: text('description'),
    bannerUrl: text('banner_url'),
    iconUrl: text('icon_url'),
    parentId: uuid('parent_id').references((): AnyPgColumn => franchises.id),
    popularityScore: integer('popularity_score').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('franchises_name_uq').on(t.name),
    uniqueIndex('franchises_slug_uq').on(t.slug),
    index('franchises_popularity_idx').on(t.popularityScore),
  ]
);

export type Franchise = typeof franchises.$inferSelect;

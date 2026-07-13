import { pgTable, uuid, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { citext } from './_types';

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    logoUrl: text('logo_url'),
    description: text('description'),
    isOfficial: boolean('is_official').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brands_name_uq').on(t.name), uniqueIndex('brands_slug_uq').on(t.slug)]
);

export type Brand = typeof brands.$inferSelect;

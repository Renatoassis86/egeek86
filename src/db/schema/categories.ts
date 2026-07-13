import {
  pgTable,
  uuid,
  text,
  timestamp,
  smallint,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { citext } from './_types';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    path: text('path').notNull(), // /funko-pop/animation
    level: smallint('level').notNull(),
    iconUrl: text('icon_url'),
    bannerUrl: text('banner_url'),
    description: text('description'),
    /**
     * attribute_schema — schema dinâmico de atributos para essa categoria.
     * Ex: { raridade: {type:'enum', options:[...], filterable:true} }
     */
    attributeSchema: jsonb('attribute_schema').notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_slug_uq').on(t.slug),
    index('categories_parent_idx').on(t.parentId),
    index('categories_path_idx').on(t.path),
  ]
);

export type Category = typeof categories.$inferSelect;

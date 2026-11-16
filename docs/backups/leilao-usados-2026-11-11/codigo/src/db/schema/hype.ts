import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { dropStatus, dropAccess } from './_enums';
import { citext } from './_types';
import { products } from './products';
import { productVariants } from './product_variants';
import { profiles } from './profiles';
import { orders } from './orders';

export const drops = pgTable(
  'drops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    title: text('title').notNull(),
    slug: citext('slug').notNull(),
    description: text('description'),
    bannerUrl: text('banner_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    stockLimit: integer('stock_limit').notNull(),
    stockSold: integer('stock_sold').notNull().default(0),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    priceCents: bigint('price_cents', { mode: 'number' }),
    accessType: dropAccess('access_type').notNull().default('public'),
    requiredLevelId: uuid('required_level_id'),
    requiredAccountAgeDays: integer('required_account_age_days').notNull().default(0),
    status: dropStatus('status').notNull().default('scheduled'),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('drops_slug_uq').on(t.slug),
    index('drops_status_starts_idx').on(t.status, t.startsAt),
    index('drops_upcoming_idx')
      .on(t.startsAt)
      .where(sql`status IN ('scheduled','live')`),
  ]
);

export const dropWaitlist = pgTable(
  'drop_waitlist',
  {
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    notifyChannels: text('notify_channels').array().notNull().default(sql`ARRAY['push','email']`),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.dropId, t.userId] })]
);

export const dropPurchases = pgTable(
  'drop_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('drop_purchases_drop_user_order_uq').on(t.dropId, t.userId, t.orderId),
    index('drop_purchases_drop_created_idx').on(t.dropId, t.createdAt),
  ]
);

/**
 * drop_access_log — forensics (anti-bot, fraude).
 */
export const dropAccessLog = pgTable(
  'drop_access_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    dropId: uuid('drop_id').notNull(),
    userId: uuid('user_id'),
    ipHash: text('ip_hash'),
    fingerprint: text('fingerprint'),
    action: text('action').notNull(), // view|queue|reserve|convert|fail
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('drop_access_log_drop_created_idx').on(t.dropId, t.createdAt)]
);

export type Drop = typeof drops.$inferSelect;
export type DropWaitlist = typeof dropWaitlist.$inferSelect;
export type DropPurchase = typeof dropPurchases.$inferSelect;

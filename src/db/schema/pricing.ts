import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { promotionType, couponStatus } from './_enums';
import { citext } from './_types';
import { profiles } from './profiles';

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: promotionType('type').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    /**
     * scope — { category_ids:[], product_ids:[], min_total_cents:..., levels:[] }
     */
    scope: jsonb('scope').notNull().default({}),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('promotions_window_idx')
      .on(t.startsAt, t.endsAt)
      .where(sql`is_active`),
  ]
);

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: citext('code').notNull(),
    description: text('description'),
    type: promotionType('type').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    minOrderCents: bigint('min_order_cents', { mode: 'number' }).notNull().default(0),
    maxDiscountCents: bigint('max_discount_cents', { mode: 'number' }),
    usageLimit: integer('usage_limit'),
    usageLimitPerUser: integer('usage_limit_per_user').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    status: couponStatus('status').notNull().default('active'),
    scope: jsonb('scope').notNull().default({}),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupons_code_uq').on(t.code),
    index('coupons_status_valid_idx').on(t.status, t.validUntil),
  ]
);

/**
 * coupon_uses — registro de cada uso (validação de limite + auditoria).
 * Referência a orders é definida em commerce/orders (avoid circular).
 */
export const couponUses = pgTable(
  'coupon_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    orderId: uuid('order_id').notNull(),
    discountCents: bigint('discount_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_uses_coupon_order_uq').on(t.couponId, t.orderId),
    index('coupon_uses_coupon_user_idx').on(t.couponId, t.userId),
  ]
);

export type Promotion = typeof promotions.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type CouponUse = typeof couponUses.$inferSelect;

import {
  pgTable,
  uuid,
  text,
  bigint,
  numeric,
  jsonb,
  timestamp,
  bigserial,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { citext } from './_types';
import { promotionType, couponStatus, affiliatePriceSource } from './_enums';
import { affiliateNetworks } from './affiliate_networks';
import { profiles } from './profiles';

/**
 * affiliate_price_snapshots — APPEND-ONLY, nunca UPDATE.
 * offer_id SEM .references() de propósito: mesmo padrão de tabelas de
 * evento de alto volume (analytics_events, product_views, drop_access_log)
 * — evita lock contention de FK numa tabela que só cresce.
 */
export const affiliatePriceSnapshots = pgTable(
  'affiliate_price_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    offerId: uuid('offer_id').notNull(),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    listPriceCents: bigint('list_price_cents', { mode: 'number' }),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
    couponCode: text('coupon_code'),
    source: affiliatePriceSource('source').notNull().default('manual'),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('affiliate_price_snapshots_offer_collected_idx').on(t.offerId, t.collectedAt),
    index('affiliate_price_snapshots_collected_brin').using('brin', t.collectedAt),
    check('affiliate_price_snapshots_price_chk', sql`${t.priceCents} >= 0`),
  ]
);

/**
 * affiliate_coupons — cupom pertence ao network, não a uma oferta específica.
 * Reaproveita promotionType/couponStatus já existentes em pricing.ts.
 */
export const affiliateCoupons = pgTable(
  'affiliate_coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    networkId: uuid('network_id')
      .notNull()
      .references(() => affiliateNetworks.id),
    code: citext('code').notNull(),
    description: text('description'),
    discountType: promotionType('discount_type').notNull(),
    discountValue: numeric('discount_value', { precision: 12, scale: 2 }).notNull(),
    minOrderCents: bigint('min_order_cents', { mode: 'number' }),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    status: couponStatus('status').notNull().default('active'),
    scope: jsonb('scope').notNull().default({}),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('affiliate_coupons_network_code_uq').on(t.networkId, t.code),
    index('affiliate_coupons_status_valid_idx').on(t.status, t.validUntil),
  ]
);

export type AffiliatePriceSnapshot = typeof affiliatePriceSnapshots.$inferSelect;
export type NewAffiliatePriceSnapshot = typeof affiliatePriceSnapshots.$inferInsert;
export type AffiliateCoupon = typeof affiliateCoupons.$inferSelect;
export type NewAffiliateCoupon = typeof affiliateCoupons.$inferInsert;

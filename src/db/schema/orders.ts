import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  numeric,
  char,
  jsonb,
  uniqueIndex,
  index,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orderStatus, fulfillmentStatus, shipmentStatus } from './_enums';
import { profiles } from './profiles';
import { sellers } from './sellers';
import { productVariants } from './product_variants';
import { products } from './products';

/**
 * orders — pedido do cliente. IMUTÁVEL em valores (snapshot).
 * Status muda; valores não.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: text('order_number').notNull(), // legível, ex: EG86-A3F2-9K1L
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    status: orderStatus('status').notNull().default('pending_payment'),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    // Snapshot de valores (centavos)
    subtotalCents: bigint('subtotal_cents', { mode: 'number' }).notNull(),
    shippingCents: bigint('shipping_cents', { mode: 'number' }).notNull().default(0),
    discountCents: bigint('discount_cents', { mode: 'number' }).notNull().default(0),
    pointsRedeemed: integer('points_redeemed').notNull().default(0),
    pointsDiscountCents: bigint('points_discount_cents', { mode: 'number' })
      .notNull()
      .default(0),
    totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
    // Snapshot de endereços (não FK, imutável)
    shippingAddress: jsonb('shipping_address').notNull(),
    billingAddress: jsonb('billing_address'),
    couponCode: text('coupon_code'),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default({}),
    source: text('source').notNull().default('web'),
    // Idempotência
    idempotencyKey: uuid('idempotency_key').notNull(),
    // Timestamps de ciclo de vida
    paidAt: timestamp('paid_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_number_uq').on(t.orderNumber),
    uniqueIndex('orders_idempotency_uq').on(t.idempotencyKey),
    index('orders_user_created_idx').on(t.userId, t.createdAt),
    index('orders_status_idx')
      .on(t.status)
      .where(sql`status IN ('pending_payment','paid','preparing','shipped')`),
    index('orders_created_idx').on(t.createdAt),
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id),
    // Snapshot
    titleSnapshot: text('title_snapshot').notNull(),
    variantSnapshot: jsonb('variant_snapshot').notNull(),
    imageSnapshot: text('image_snapshot'),
    quantity: integer('quantity').notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    subtotalCents: bigint('subtotal_cents', { mode: 'number' }).notNull(),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull(),
    commissionCents: bigint('commission_cents', { mode: 'number' }).notNull(),
    sellerReceivableCents: bigint('seller_receivable_cents', { mode: 'number' }).notNull(),
    // Hype (FK opcional — drop referenciado depois)
    dropId: uuid('drop_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_seller_idx').on(t.sellerId),
    index('order_items_variant_idx').on(t.variantId),
    index('order_items_product_idx').on(t.productId),
    index('order_items_drop_idx')
      .on(t.dropId)
      .where(sql`drop_id IS NOT NULL`),
  ]
);

/**
 * order_events — outbox + state log append-only.
 * Fonte de verdade do ciclo de vida do pedido.
 */
export const orderEvents = pgTable(
  'order_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    eventType: text('event_type').notNull(),
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status'),
    actorId: uuid('actor_id').references(() => profiles.id),
    payload: jsonb('payload').notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_events_order_created_idx').on(t.orderId, t.createdAt),
    index('order_events_unpublished_idx')
      .on(t.publishedAt)
      .where(sql`published_at IS NULL`),
  ]
);

export const fulfillments = pgTable('fulfillments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  sellerId: uuid('seller_id')
    .notNull()
    .references(() => sellers.id),
  status: fulfillmentStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fulfillmentItems = pgTable(
  'fulfillment_items',
  {
    fulfillmentId: uuid('fulfillment_id')
      .notNull()
      .references(() => fulfillments.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    quantity: integer('quantity').notNull(),
  },
  (t) => [uniqueIndex('fulfillment_items_pk').on(t.fulfillmentId, t.orderItemId)]
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fulfillmentId: uuid('fulfillment_id')
      .notNull()
      .references(() => fulfillments.id, { onDelete: 'cascade' }),
    carrier: text('carrier').notNull(),
    service: text('service'),
    trackingCode: text('tracking_code'),
    trackingUrl: text('tracking_url'),
    labelUrl: text('label_url'),
    status: shipmentStatus('status').notNull().default('label_created'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    shippingCostCents: bigint('shipping_cost_cents', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shipments_tracking_idx').on(t.trackingCode)]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type Fulfillment = typeof fulfillments.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;

import { pgTable, uuid, timestamp, integer, bigint, numeric } from 'drizzle-orm/pg-core';
import { sellers } from './sellers';

export const sellerMetrics = pgTable('seller_metrics', {
  sellerId: uuid('seller_id')
    .primaryKey()
    .references(() => sellers.id, { onDelete: 'cascade' }),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).notNull().default('0'),
  totalReviews: integer('total_reviews').notNull().default(0),
  totalOrders: integer('total_orders').notNull().default(0),
  totalSalesCents: bigint('total_sales_cents', { mode: 'number' }).notNull().default(0),
  cancellationRate: numeric('cancellation_rate', { precision: 5, scale: 4 })
    .notNull()
    .default('0'),
  avgShipHours: numeric('avg_ship_hours', { precision: 6, scale: 2 }),
  onTimeRate: numeric('on_time_rate', { precision: 5, scale: 4 }).notNull().default('1.0000'),
  lastCalculatedAt: timestamp('last_calculated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SellerMetrics = typeof sellerMetrics.$inferSelect;

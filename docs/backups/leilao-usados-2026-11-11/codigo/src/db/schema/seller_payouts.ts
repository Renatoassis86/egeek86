import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  char,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { sellers } from './sellers';

export const sellerPayouts = pgTable(
  'seller_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').notNull().default('scheduled'), // scheduled|processing|paid|failed
    gatewayPayoutId: text('gateway_payout_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seller_payouts_seller_period_idx').on(t.sellerId, t.periodEnd)]
);

export type SellerPayout = typeof sellerPayouts.$inferSelect;

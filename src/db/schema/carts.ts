import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  char,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';
import { productVariants } from './product_variants';

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => profiles.id),
    sessionId: text('session_id'), // guests
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
  },
  (t) => [
    index('carts_user_idx').on(t.userId),
    index('carts_session_idx').on(t.sessionId),
    index('carts_expires_guest_idx')
      .on(t.expiresAt)
      .where(sql`user_id IS NULL`),
  ]
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantity: integer('quantity').notNull(),
    priceSnapshotCents: bigint('price_snapshot_cents', { mode: 'number' }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cart_items_cart_variant_uq').on(t.cartId, t.variantId)]
);

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;

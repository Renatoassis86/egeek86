import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  smallint,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  bigserial,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { reviewStatus } from './_enums';
import { profiles } from './profiles';
import { products } from './products';
import { productVariants } from './product_variants';
import { orderItems } from './orders';

export const wishlists = pgTable(
  'wishlists',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    notifyOnPromo: integer('notify_on_promo').notNull().default(1),
    notifyOnRestock: integer('notify_on_restock').notNull().default(1),
    targetPriceCents: bigint('target_price_cents', { mode: 'number' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.variantId] }),
    index('wishlists_variant_idx').on(t.variantId),
    index('wishlists_user_added_idx').on(t.userId, t.addedAt),
  ]
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    rating: smallint('rating').notNull(),
    title: text('title'),
    comment: text('comment'),
    images: jsonb('images').notNull().default([]),
    status: reviewStatus('status').notNull().default('pending'),
    helpfulCount: integer('helpful_count').notNull().default(0),
    unhelpfulCount: integer('unhelpful_count').notNull().default(0),
    sellerResponse: text('seller_response'),
    sellerRespondedAt: timestamp('seller_responded_at', { withTimezone: true }),
    moderationReason: text('moderation_reason'),
    moderatedBy: uuid('moderated_by').references(() => profiles.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('reviews_order_item_uq').on(t.orderItemId),
    index('reviews_product_status_idx')
      .on(t.productId, t.status)
      .where(sql`deleted_at IS NULL`),
    index('reviews_user_created_idx').on(t.userId, t.createdAt),
    check('reviews_rating_chk', sql`${t.rating} BETWEEN 1 AND 5`),
  ]
);

export const reviewVotes = pgTable(
  'review_votes',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    vote: smallint('vote').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.userId] }),
    check('review_votes_vote_chk', sql`${t.vote} IN (-1, 1)`),
  ]
);

/**
 * product_views — tracking leve para popularidade e recomendação.
 */
export const productViews = pgTable(
  'product_views',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: uuid('product_id').notNull(),
    userId: uuid('user_id'),
    sessionId: text('session_id'),
    source: text('source'), // search|recommendation|direct|...
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_views_product_created_idx').on(t.productId, t.createdAt),
    index('product_views_user_created_idx')
      .on(t.userId, t.createdAt)
      .where(sql`user_id IS NOT NULL`),
  ]
);

export type Wishlist = typeof wishlists.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ReviewVote = typeof reviewVotes.$inferSelect;
export type ProductView = typeof productViews.$inferSelect;

import { pgTable, uuid, timestamp, integer, numeric, jsonb } from 'drizzle-orm/pg-core';
import { products } from './products';

/**
 * product_ratings — cache de agregado de reviews por produto.
 * Atualizado por trigger ou job ao aprovar/remover review.
 */
export const productRatings = pgTable('product_ratings', {
  productId: uuid('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).notNull().default('0'),
  totalReviews: integer('total_reviews').notNull().default(0),
  distribution: jsonb('distribution')
    .notNull()
    .default({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }),
  lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProductRating = typeof productRatings.$inferSelect;

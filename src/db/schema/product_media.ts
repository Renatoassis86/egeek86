import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  smallint,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { mediaType } from './_enums';
import { products } from './products';
import { productVariants } from './product_variants';

export const productMedia = pgTable(
  'product_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
    type: mediaType('type').notNull().default('image'),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    altText: text('alt_text').notNull().default(''),
    width: integer('width'),
    height: integer('height'),
    position: smallint('position').notNull().default(0),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_media_product_pos_idx').on(t.productId, t.position),
    index('product_media_variant_idx').on(t.variantId),
  ]
);

export type ProductMedia = typeof productMedia.$inferSelect;

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  smallint,
  char,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products';

/**
 * product_variants — SKU vendável. Toda compra é de uma variant.
 * Mesmo produtos "sem variação" têm 1 variant default (is_default=true).
 * Preço e estoque vivem aqui, não no produto.
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name'), // ex: "Preto / M"
    options: jsonb('options').notNull().default({}), // {cor:'Preto', tamanho:'M'}
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    compareAtCents: bigint('compare_at_cents', { mode: 'number' }),
    costCents: bigint('cost_cents', { mode: 'number' }),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    weightG: integer('weight_g').notNull().default(0),
    widthCm: numeric('width_cm', { precision: 6, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 6, scale: 2 }),
    lengthCm: numeric('length_cm', { precision: 6, scale: 2 }),
    barcode: text('barcode'),
    isDefault: boolean('is_default').notNull().default(false),
    position: smallint('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('variants_sku_uq')
      .on(t.sku)
      .where(sql`deleted_at IS NULL`),
    index('variants_product_idx').on(t.productId),
    uniqueIndex('variants_one_default_per_product_uq')
      .on(t.productId)
      .where(sql`is_default`),
  ]
);

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;

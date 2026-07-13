import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { citext, tsvector } from './_types';
import { productStatus, productCondition } from './_enums';
import { sellers } from './sellers';
import { categories } from './categories';
import { brands } from './brands';
import { franchises } from './franchises';
import { masterProducts } from './master_products';

/**
 * products — oferta do seller. Pode referenciar um master_product (canônico)
 * ou ser exclusiva do seller (master_product_id = NULL).
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id),
    masterProductId: uuid('master_product_id').references(() => masterProducts.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    brandId: uuid('brand_id').references(() => brands.id),
    franchiseId: uuid('franchise_id').references(() => franchises.id),
    title: text('title').notNull(),
    slug: citext('slug').notNull(),
    description: text('description'),
    shortDescription: text('short_description'),
    condition: productCondition('condition').notNull().default('new'),
    isAuthentic: boolean('is_authentic').notNull().default(true),
    isExclusive: boolean('is_exclusive').notNull().default(false),
    attributes: jsonb('attributes').notNull().default({}),
    status: productStatus('status').notNull().default('draft'),
    // Métricas (cache)
    viewCount: integer('view_count').notNull().default(0),
    saleCount: integer('sale_count').notNull().default(0),
    popularityScore: integer('popularity_score').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /**
     * tsvector gerado via SQL: setweight(to_tsvector(...), 'A') || ...
     * Criação efetiva da coluna GENERATED é feita na migration manual.
     */
    searchTsv: tsvector('search_tsv'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('products_slug_uq').on(t.slug),
    index('products_seller_idx').on(t.sellerId),
    index('products_category_status_idx').on(t.categoryId, t.status),
    index('products_brand_idx').on(t.brandId),
    index('products_franchise_idx').on(t.franchiseId),
    index('products_master_idx').on(t.masterProductId),
    index('products_popularity_idx').on(t.popularityScore),
  ]
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

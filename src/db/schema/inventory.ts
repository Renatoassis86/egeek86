import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  char,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stockMovementType } from './_enums';
import { sellers } from './sellers';
import { productVariants } from './product_variants';
import { profiles } from './profiles';

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sellerId: uuid('seller_id').references(() => sellers.id), // null = CD próprio
  cep: text('cep').notNull(),
  city: text('city').notNull(),
  state: char('state', { length: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * stocks — estoque por variant × warehouse.
 * available é GENERATED ALWAYS AS (on_hand - reserved) na migration.
 */
export const stocks = pgTable(
  'stocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    onHand: integer('on_hand').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    available: integer('available'), // GENERATED ALWAYS AS (on_hand - reserved) STORED
    reorderPoint: integer('reorder_point'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('stocks_variant_warehouse_uq').on(t.variantId, t.warehouseId),
    index('stocks_variant_idx').on(t.variantId),
    index('stocks_available_idx').on(t.available).where(sql`available > 0`),
  ]
);

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    quantity: integer('quantity').notNull(),
    reason: text('reason').notNull(), // cart|checkout|drop
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    userId: uuid('user_id').references(() => profiles.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reservations_expires_idx')
      .on(t.expiresAt)
      .where(sql`released_at IS NULL AND consumed_at IS NULL`),
    index('reservations_ref_idx').on(t.refType, t.refId),
  ]
);

/**
 * stock_movements — log append-only de toda movimentação de estoque.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    variantId: uuid('variant_id').notNull(),
    warehouseId: uuid('warehouse_id').notNull(),
    type: stockMovementType('type').notNull(),
    quantity: integer('quantity').notNull(),
    beforeOnHand: integer('before_on_hand').notNull(),
    afterOnHand: integer('after_on_hand').notNull(),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    notes: text('notes'),
    performedBy: uuid('performed_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_movements_variant_created_idx').on(t.variantId, t.createdAt)]
);

export type Warehouse = typeof warehouses.$inferSelect;
export type Stock = typeof stocks.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;

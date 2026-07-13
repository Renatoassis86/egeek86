import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  char,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    label: text('label'),
    recipientName: text('recipient_name').notNull(),
    cep: text('cep').notNull(),
    street: text('street').notNull(),
    number: text('number').notNull(),
    complement: text('complement'),
    neighborhood: text('neighborhood').notNull(),
    city: text('city').notNull(),
    state: char('state', { length: 2 }).notNull(),
    country: char('country', { length: 2 }).notNull().default('BR'),
    reference: text('reference'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('addresses_user_idx').on(t.userId),
    uniqueIndex('addresses_one_default_per_user_uq')
      .on(t.userId)
      .where(sql`is_default`),
  ]
);

export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  date,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { userRole, userStatus } from './_enums';

/**
 * profiles — espelha auth.users do Supabase.
 * id = auth.users.id (sincronizado via trigger Postgres na migration).
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    phone: text('phone'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    birthdate: date('birthdate'),
    cpfHash: text('cpf_hash'),
    role: userRole('role').notNull().default('customer'),
    status: userStatus('status').notNull().default('active'),
    preferences: jsonb('preferences').notNull().default({}),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    // Caches/desnormalização controlada
    geekPoints: integer('geek_points').notNull().default(0),
    levelId: uuid('level_id'),
    totalOrders: integer('total_orders').notNull().default(0),
    totalSpentCents: bigint('total_spent_cents', { mode: 'number' }).notNull().default(0),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('profiles_email_uq').on(t.email),
    uniqueIndex('profiles_cpf_hash_uq').on(t.cpfHash),
    index('profiles_level_idx').on(t.levelId),
    index('profiles_role_idx').on(t.role),
  ]
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sellerStatus } from './_enums';
import { profiles } from './profiles';
import { citext, bytea } from './_types';

export const sellers = pgTable(
  'sellers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    companyName: text('company_name').notNull(),
    displayName: text('display_name').notNull(),
    slug: citext('slug').notNull(),
    cnpj: text('cnpj').notNull(),
    emailBusiness: citext('email_business').notNull(),
    phone: text('phone'),
    description: text('description'),
    logoUrl: text('logo_url'),
    bannerUrl: text('banner_url'),
    status: sellerStatus('status').notNull().default('pending_kyc'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 })
      .notNull()
      .default('0.1200'),
    mpAccountId: text('mp_account_id'),
    bankAccountEncrypted: bytea('bank_account_encrypted'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspensionReason: text('suspension_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sellers_user_uq').on(t.userId),
    uniqueIndex('sellers_slug_uq').on(t.slug),
    uniqueIndex('sellers_cnpj_uq').on(t.cnpj),
    index('sellers_status_idx').on(t.status),
  ]
);

export type Seller = typeof sellers.$inferSelect;
export type NewSeller = typeof sellers.$inferInsert;

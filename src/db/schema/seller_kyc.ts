import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { kycStatus } from './_enums';
import { sellers } from './sellers';
import { profiles } from './profiles';

export const sellerKycDocuments = pgTable(
  'seller_kyc_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    docType: text('doc_type').notNull(), // cnpj_card|social_contract|id_front|id_back|proof_address
    storagePath: text('storage_path').notNull(),
    status: kycStatus('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seller_kyc_seller_status_idx').on(t.sellerId, t.status)]
);

export type SellerKycDocument = typeof sellerKycDocuments.$inferSelect;

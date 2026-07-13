import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { affiliateOffers } from './affiliate_offers';
import { profiles } from './profiles';

/**
 * affiliate_messages — histórico do que já foi gerado/copiado para divulgação
 * (WhatsApp nesta fase). Volume baixo (geração manual) — uuid normal, não
 * é tabela de evento de alto volume.
 */
export const affiliateMessages = pgTable(
  'affiliate_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => affiliateOffers.id),
    messageText: text('message_text').notNull(),
    priceCentsAtSend: bigint('price_cents_at_send', { mode: 'number' }).notNull(),
    channel: text('channel').notNull().default('whatsapp'),
    destination: text('destination'),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('affiliate_messages_offer_created_idx').on(t.offerId, t.createdAt),
    index('affiliate_messages_created_idx').on(t.createdAt),
  ]
);

export type AffiliateMessage = typeof affiliateMessages.$inferSelect;
export type NewAffiliateMessage = typeof affiliateMessages.$inferInsert;

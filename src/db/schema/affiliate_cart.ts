import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';
import { affiliateOffers } from './affiliate_offers';

/**
 * affiliate_cart_items — "carrinho" é uma lista de interesse, não um
 * checkout real (Geek Deals não vende nada diretamente, é vitrine de
 * afiliado). Por offer_id (não master_product_id): o link de afiliado é por
 * oferta/vendedor específico, então reaproveita affiliate_offers diretamente
 * (affiliateUrl/affiliateLinkPending) em vez de duplicar esse estado aqui.
 * sentAt marca quando a mensagem de WhatsApp que cobre esse item foi
 * enviada — cada envio cobre todos os itens pendentes daquele comprador de
 * uma vez, não é um "carrinho fechado" com ciclo de vida próprio.
 */
export const affiliateCartItems = pgTable(
  'affiliate_cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => affiliateOffers.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('affiliate_cart_items_user_offer_uq').on(t.userId, t.offerId),
    index('affiliate_cart_items_user_pending_idx')
      .on(t.userId)
      .where(sql`sent_at IS NULL`),
  ]
);

export type AffiliateCartItem = typeof affiliateCartItems.$inferSelect;
export type NewAffiliateCartItem = typeof affiliateCartItems.$inferInsert;

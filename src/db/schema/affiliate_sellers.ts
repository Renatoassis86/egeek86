import { pgTable, uuid, text, integer, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { affiliateNetworks } from './affiliate_networks';

/**
 * affiliate_sellers — cache de reputação de vendedor, por rede (genérico o
 * bastante pra outras redes além do Mercado Livre no futuro). Campos crus
 * (reputationLevel/powerSellerStatus como texto livre, não enum) porque o
 * vocabulário varia por rede — não vale a pena um enum fechado pra isso.
 *
 * Atualizado em duas velocidades (ver src/server/collector/sources/mercado-livre-seller.ts):
 * - nickname/externalSellerId: toda vez que aparece como buy-box winner de
 *   uma oferta (vem de graça na mesma chamada de preço, sem custo extra).
 * - reputationLevel/totalSales/positiveRatingPercent: só quando novo ou
 *   quando refreshedAt está velho — exige uma chamada de API à parte.
 */
export const affiliateSellers = pgTable(
  'affiliate_sellers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    networkId: uuid('network_id')
      .notNull()
      .references(() => affiliateNetworks.id),
    externalSellerId: text('external_seller_id').notNull(),
    nickname: text('nickname'),
    reputationLevel: text('reputation_level'),
    powerSellerStatus: text('power_seller_status'),
    totalSales: integer('total_sales'),
    positiveRatingPercent: numeric('positive_rating_percent', { precision: 5, scale: 2 }),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('affiliate_sellers_network_external_uq').on(t.networkId, t.externalSellerId)]
);

export type AffiliateSeller = typeof affiliateSellers.$inferSelect;
export type NewAffiliateSeller = typeof affiliateSellers.$inferInsert;

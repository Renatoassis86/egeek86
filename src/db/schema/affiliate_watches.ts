import { pgTable, uuid, boolean, bigint, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';
import { masterProducts } from './master_products';

/**
 * affiliate_price_watches — cliente acompanha um master_product (o jogo em
 * si, através de todas as redes/ofertas), não uma oferta específica: o
 * objetivo é notificar sobre o melhor preço do jogo, independente de qual
 * rede/vendedor estiver com o menor preço no momento.
 *
 * Toggle via is_active (mesmo padrão de affiliate_networks.isActive) em vez
 * de delete — preserva last_notified_at se o cliente desfavoritar e
 * refavoritar depois, evitando reenviar um alerta que ele já recebeu.
 */
export const affiliatePriceWatches = pgTable(
  'affiliate_price_watches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    masterProductId: uuid('master_product_id')
      .notNull()
      .references(() => masterProducts.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    targetPriceCents: bigint('target_price_cents', { mode: 'number' }),
    // Cooldown do alerta diário — ver src/server/notifications/detect-price-drops.ts.
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('affiliate_price_watches_user_master_uq').on(t.userId, t.masterProductId),
    index('affiliate_price_watches_master_active_idx')
      .on(t.masterProductId)
      .where(sql`is_active = true`),
  ]
);

export type AffiliatePriceWatch = typeof affiliatePriceWatches.$inferSelect;
export type NewAffiliatePriceWatch = typeof affiliatePriceWatches.$inferInsert;

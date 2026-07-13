import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { citext } from './_types';

/**
 * affiliate_networks — programas de afiliado (Mercado Livre, Amazon, Kabum...).
 * Domínio "Geek Deals": diferente de `sellers`, aqui a plataforma NÃO vende —
 * apenas indica e recebe comissão de terceiros.
 */
export const affiliateNetworks = pgTable(
  'affiliate_networks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    websiteUrl: text('website_url'),
    colorHex: text('color_hex'),
    trackingNote: text('tracking_note'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('affiliate_networks_name_uq').on(t.name),
    uniqueIndex('affiliate_networks_slug_uq').on(t.slug),
  ]
);

export type AffiliateNetwork = typeof affiliateNetworks.$inferSelect;
export type NewAffiliateNetwork = typeof affiliateNetworks.$inferInsert;

import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { citext } from './_types';
import { affiliateOfferStatus } from './_enums';
import { masterProducts } from './master_products';
import { affiliateNetworks } from './affiliate_networks';
import { affiliateSellers } from './affiliate_sellers';
import { profiles } from './profiles';

/**
 * affiliate_offers — link de afiliado catalogado manualmente pelo admin.
 * Sempre referencia um master_product (dedup canônico do catálogo — a
 * taxonomia brand/category/franchise vem de lá, não é duplicada aqui).
 * `affiliate_url` nunca é exposta ao client — só lida server-side em /go/[slug].
 */
export const affiliateOffers = pgTable(
  'affiliate_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    masterProductId: uuid('master_product_id')
      .notNull()
      .references(() => masterProducts.id),
    networkId: uuid('network_id')
      .notNull()
      .references(() => affiliateNetworks.id),
    title: text('title').notNull(),
    slug: citext('slug').notNull(),
    affiliateUrl: text('affiliate_url').notNull(),
    // true = affiliate_url ainda é o placeholder honesto (página pública do
    // produto/vendedor, sem rastreio) que a descoberta automática usa —
    // nunca gera comissão. Setado pela descoberta automática ao criar,
    // limpo em updateAffiliateUrl quando o admin cola o link real. Enquanto
    // true, o front mostra o item mas não deixa clicar pra comprar (ver
    // /go/[slug]/route.ts e a página de detalhe da oferta).
    affiliateLinkPending: boolean('affiliate_link_pending').notNull().default(false),
    imageUrl: text('image_url'),
    storeName: text('store_name'),
    // ID do item na loja de origem (ex: "MLB1234567890" no Mercado Livre) —
    // usado pelo coletor automático pra saber o que consultar na API/fonte.
    // Nulo enquanto a oferta só existe via cadastro manual.
    externalRef: text('external_ref'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    // Cache do vendedor vencedor do buy-box atual — atualizado a cada coleta
    // de preço, igual a currentPriceCents (pode mudar se outro seller assumir
    // o menor preço/melhor oferta pro mesmo produto).
    sellerId: uuid('seller_id').references(() => affiliateSellers.id),
    // Cache do último snapshot — mesmo padrão de products.viewCount/popularityScore.
    currentPriceCents: bigint('current_price_cents', { mode: 'number' }).notNull(),
    // Tag "vendedor alterou o preço" — setado em record-price-snapshot.ts
    // sempre que um novo snapshot chega com price_cents diferente do cache
    // atual (nunca no primeiro snapshot de uma oferta recém-criada, já que
    // não há "antes" pra comparar). previousPriceCents guarda o valor de
    // antes da última mudança, pra mostrar "de R$X para R$Y" na UI.
    lastPriceChangeAt: timestamp('last_price_change_at', { withTimezone: true }),
    previousPriceCents: bigint('previous_price_cents', { mode: 'number' }),
    currency: text('currency').notNull().default('BRL'),
    status: affiliateOfferStatus('status').notNull().default('draft'),
    highlightNote: text('highlight_note'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('affiliate_offers_slug_uq').on(t.slug),
    index('affiliate_offers_master_idx').on(t.masterProductId),
    index('affiliate_offers_network_idx').on(t.networkId),
    index('affiliate_offers_status_published_idx')
      .on(t.status, t.publishedAt)
      .where(sql`status = 'active'`),
    // Serve ao mesmo tempo o filtro (status ativo + preço coletado) E a
    // ordenação (ASC/DESC por preço) de listRankedOffers — a query mais
    // repetida do site (home, /ofertas, todas as seções de destaque).
    // Sem isso, o Postgres varre e ordena a tabela inteira sem índice —
    // virou statement_timeout em produção com o catálogo maior (ver
    // erro real capturado nos Runtime Logs da Vercel).
    index('affiliate_offers_active_price_idx')
      .on(t.status, t.currentPriceCents)
      .where(sql`status = 'active' AND current_price_cents > 0`),
    check('affiliate_offers_price_chk', sql`${t.currentPriceCents} >= 0`),
  ]
);

export type AffiliateOffer = typeof affiliateOffers.$inferSelect;
export type NewAffiliateOffer = typeof affiliateOffers.$inferInsert;

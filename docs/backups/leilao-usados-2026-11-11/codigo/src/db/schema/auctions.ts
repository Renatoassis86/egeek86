import { pgTable, uuid, text, integer, boolean, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

export const auctions = pgTable(
  'auctions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    images: text('images').array().notNull().default(sql`'{}'::text[]`), // array de strings (URLs ou Base64)
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    minBidCents: integer('min_bid_cents').notNull().default(100), // lance mínimo inicial
    reservePriceCents: integer('reserve_price_cents'), // preço de reserva oculto
    buyoutPriceCents: integer('buyout_price_cents'), // preço de compra imediata
    currentBidCents: integer('current_bid_cents').notNull().default(0),
    status: text('status', {
      enum: ['pending_curation', 'scheduled', 'active', 'completed', 'failed_reserve', 'defaulted'],
    })
      .notNull()
      .default('pending_curation'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auctions_seller_idx').on(t.sellerId),
    index('auctions_status_idx').on(t.status),
  ]
);

export const auctionBids = pgTable(
  'auction_bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auctionId: uuid('auction_id')
      .notNull()
      .references(() => auctions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    isWinning: boolean('is_winning').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auction_bids_auction_idx').on(t.auctionId),
    index('auction_bids_user_idx').on(t.userId),
  ]
);

export type Auction = typeof auctions.$inferSelect;
export type AuctionBid = typeof auctionBids.$inferSelect;

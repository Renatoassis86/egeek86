import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { notificationChannel, notificationStatus } from './_enums';
import { profiles } from './profiles';

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  emailMarketing: boolean('email_marketing').notNull().default(false),
  emailTransactional: boolean('email_transactional').notNull().default(true),
  pushDrops: boolean('push_drops').notNull().default(true),
  pushOrders: boolean('push_orders').notNull().default(true),
  whatsappOrders: boolean('whatsapp_orders').notNull().default(true),
  whatsappMarketing: boolean('whatsapp_marketing').notNull().default(false),
  // Geek Deals — alerta diário de queda de preço (jogos acompanhados).
  // Flags próprias (não emailMarketing/whatsappMarketing) porque são de um
  // domínio diferente (Geek Deals, não a loja geral) com opt-in próprio.
  emailPriceAlerts: boolean('email_price_alerts').notNull().default(true),
  telegramPriceAlerts: boolean('telegram_price_alerts').notNull().default(true),
  // Preenchido só depois do vínculo via /start no bot (ver telegramLinkTokens).
  telegramChatId: text('telegram_chat_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => profiles.id),
    channel: notificationChannel('channel').notNull(),
    templateCode: text('template_code').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject'),
    payload: jsonb('payload'),
    status: notificationStatus('status').notNull().default('queued'),
    provider: text('provider'),
    providerId: text('provider_id'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_deliveries_user_created_idx').on(t.userId, t.createdAt),
    index('notification_deliveries_queued_idx')
      .on(t.status)
      .where(sql`status = 'queued'`),
  ]
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform').notNull(), // web|ios|android
    deviceInfo: jsonb('device_info'),
    isActive: boolean('is_active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('push_tokens_token_uq').on(t.token)]
);

/**
 * telegramLinkTokens — vincula profiles.id ao chat_id do Telegram. Bots não
 * podem iniciar conversa: o cliente clica num deep-link (t.me/<bot>?start=<token>)
 * gerado aqui, o Telegram manda "/start <token>" pro nosso webhook, que
 * resolve o token de volta pro userId e grava telegramChatId. Token expira
 * por idade (checado em JS ao consumir, não precisa de TTL no banco).
 */
export const telegramLinkTokens = pgTable('telegram_link_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;

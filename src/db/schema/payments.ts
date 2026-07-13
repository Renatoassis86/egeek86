import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  smallint,
  char,
  jsonb,
  uniqueIndex,
  index,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentStatus, paymentMethod, refundStatus } from './_enums';
import { orders } from './orders';
import { profiles } from './profiles';

/**
 * payments — N pagamentos por pedido (retries, métodos múltiplos, reembolsos).
 * gateway_id ÚNICO garante idempotência de webhook.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    gateway: text('gateway').notNull(),
    gatewayId: text('gateway_id').notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    installments: smallint('installments'),
    // PIX
    pixQr: text('pix_qr'),
    pixExpiresAt: timestamp('pix_expires_at', { withTimezone: true }),
    // Cartão
    cardBrand: text('card_brand'),
    cardLast4: text('card_last4'),
    // Boleto
    boletoUrl: text('boleto_url'),
    boletoBarcode: text('boleto_barcode'),
    boletoDueAt: timestamp('boleto_due_at', { withTimezone: true }),
    // Raw
    rawRequest: jsonb('raw_request'),
    rawResponse: jsonb('raw_response'),
    failureCode: text('failure_code'),
    failureReason: text('failure_reason'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_gateway_id_uq').on(t.gateway, t.gatewayId),
    index('payments_order_idx').on(t.orderId),
    index('payments_status_created_idx').on(t.status, t.createdAt),
  ]
);

export const paymentSplits = pgTable('payment_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  recipientType: text('recipient_type').notNull(), // seller|platform
  recipientId: uuid('recipient_id'),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  gatewaySplitId: text('gateway_split_id'),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  status: refundStatus('status').notNull().default('pending'),
  gatewayRefundId: text('gateway_refund_id').unique(),
  requestedBy: uuid('requested_by').references(() => profiles.id),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * webhook_events — idempotência de webhooks de gateways.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    gateway: text('gateway').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    signature: text('signature'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('webhook_events_gateway_event_uq').on(t.gateway, t.eventId),
    index('webhook_events_unprocessed_idx')
      .on(t.processedAt)
      .where(sql`processed_at IS NULL`),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type PaymentSplit = typeof paymentSplits.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

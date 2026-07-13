import { pgTable, uuid, text, timestamp, jsonb, index, bigserial } from 'drizzle-orm/pg-core';
import { userRole } from './_enums';

/**
 * audit_log — APPEND-ONLY. Trilha imutável para compliance e forensics.
 * Hash-chain detecta tampering (prev_hash → hash).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    actorRole: userRole('actor_role'),
    action: text('action').notNull(), // product.update|seller.suspend|order.refund
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    diff: jsonb('diff'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    // Hash chain
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_created_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_log_actor_created_idx').on(t.actorId, t.createdAt),
    index('audit_log_created_brin').using('brin', t.createdAt),
  ]
);

export type AuditLog = typeof auditLog.$inferSelect;

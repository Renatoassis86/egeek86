import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getAdTag, getGroupMessagesMode, isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { escapeTelegramHtml } from '@/lib/messaging/group-messages';
import { sendTelegramGroupMessage, type FetchLike } from '@/lib/messaging/telegram-send';
import { LOJA_GAMES } from '@/lib/stores/lojas';
import {
  ENDED_CARD_STALE_MIN,
  NETWORK_NAMES,
  cardLabel,
  decideEnd,
  endedCaption,
  endedCardsLeft,
  shouldNotifyEnd,
  type Announcement,
  type AnnKind,
  type EndReason,
  type Evidence,
} from '@/lib/coupons/guardiao-model';
import { chatForStore, getStoreByVertical } from '@/server/stores';
import { gravarCicloAgente, relatorioCupons, resumoRelatorio } from '@/server/messaging/agente-cupons';

/**
 * GUARDIÃO DE CUPONS (Agente de Cupons). A cada ~5 min (passo do cron group-messages): para cada cupom que JÁ DIVULGAMOS confere se
 * a fonte ainda o mostra; se acabou, fecha com motivo e, quando há prova de que acabou, avisa o grupo da loja com UM card silencioso
 * ("Cupom encerrado"). Regras do card: no máximo 1 por cupom e 3 por hora por grupo; não conta nos tetos de preço (não passa pela
 * fila group_messages); não envia se a loja não tem canal verificado. Nunca lança: falha vira contagem no resumo.
 */

export interface PendingNotice extends Announcement {
  endedAt: Date;
  reason: EndReason;
}

export interface GuardiaoStore {
  listOpen(limit: number): Promise<Announcement[]>;
  evidence(ann: Announcement): Promise<Evidence>;
  touch(id: string, now: Date): Promise<void>;
  end(id: string, reason: EndReason, now: Date): Promise<boolean>;
  listPending(now: Date, limit: number): Promise<PendingNotice[]>;
  notifiedLastHour(ann: Announcement, now: Date): Promise<number>;
  /** Marca end_notified_at só se ainda estiver nulo (trava contra envio duplo). */
  claimNotify(id: string, now: Date): Promise<boolean>;
  releaseNotify(id: string): Promise<void>;
}

export interface Channel {
  slug: string;
  chatId: string;
}

export interface GuardiaoDeps {
  store: GuardiaoStore;
  /** Canal VERIFICADO da loja do cupom; null = não envia. */
  resolveChannel: (ann: Announcement) => Promise<Channel | null>;
  render: (a: { storeSlug: string; label: string; networkName: string; at: Date }) => Promise<Uint8Array | null>;
  fetchImpl?: FetchLike;
  token?: string;
  adTag?: string;
  now?: Date;
  /** false = só fecha os cupons (modo dry/sem token): os cards ficam pendentes. */
  canSend?: boolean;
  /** Prazo total (ms) para não estourar o tempo da rota. */
  budgetMs?: number;
}

export interface GuardiaoResult {
  checked: number;
  ended: { id: string; kind: AnnKind; reason: EndReason }[];
  notified: number;
  notifySkipped: Record<string, number>;
  divergencias: { id: string; note: string }[];
  errors: number;
  budgetExhausted: boolean;
}

const bump = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1;
};

export async function rodarGuardiao(deps: GuardiaoDeps): Promise<GuardiaoResult> {
  const now = deps.now ?? new Date();
  const deadline = Date.now() + (deps.budgetMs ?? 15_000);
  const out: GuardiaoResult = { checked: 0, ended: [], notified: 0, notifySkipped: {}, divergencias: [], errors: 0, budgetExhausted: false };

  // 1) Confere cada cupom divulgado ainda aberto.
  const open = await deps.store.listOpen(200);
  for (const ann of open) {
    if (Date.now() > deadline) {
      out.budgetExhausted = true;
      break;
    }
    try {
      const ev = await deps.store.evidence(ann);
      const d = decideEnd(ann, ev, now);
      out.checked++;
      if (d.end) {
        if (await deps.store.end(ann.id, d.reason, now)) out.ended.push({ id: ann.id, kind: ann.kind, reason: d.reason });
      } else {
        await deps.store.touch(ann.id, now);
        if (d.note) out.divergencias.push({ id: ann.id, note: d.note });
      }
    } catch {
      out.errors++;
    }
  }

  // 2) Avisos pendentes (cupons encerrados com prova, ainda não avisados).
  const pending = await deps.store.listPending(now, 20);
  for (const ann of pending) {
    if (Date.now() > deadline) {
      out.budgetExhausted = true;
      break;
    }
    try {
      if (!shouldNotifyEnd(ann.kind, ann.reason)) continue;
      if (!deps.canSend) {
        bump(out.notifySkipped, 'envio_desligado');
        continue;
      }
      const ch = await deps.resolveChannel(ann);
      if (!ch) {
        bump(out.notifySkipped, 'sem_canal_verificado');
        continue;
      }
      if (endedCardsLeft(await deps.store.notifiedLastHour(ann, now)) <= 0) {
        bump(out.notifySkipped, 'limite_3_por_hora');
        continue;
      }
      if (!(await deps.store.claimNotify(ann.id, now))) {
        bump(out.notifySkipped, 'ja_avisado');
        continue;
      }
      const netName = NETWORK_NAMES[ann.networkSlug] ?? 'a loja';
      let photo: Uint8Array | null = null;
      try {
        photo = await deps.render({ storeSlug: ch.slug, label: cardLabel(ann.kind, ann.label), networkName: netName, at: now });
      } catch {
        photo = null; // sem imagem, o aviso sai só em texto
      }
      const sent = await sendTelegramGroupMessage({
        token: deps.token,
        chatId: ch.chatId,
        text: endedCaption({ kind: ann.kind, label: ann.label, networkSlug: ann.networkSlug, adTag: deps.adTag ?? '' }, escapeTelegramHtml),
        silent: true,
        photo,
        fetchImpl: deps.fetchImpl,
      });
      if (sent.ok) {
        out.notified++;
      } else if (sent.retryable) {
        await deps.store.releaseNotify(ann.id); // falha temporária: tenta no próximo ciclo
        bump(out.notifySkipped, 'falha_temporaria');
      } else {
        out.errors++; // definitiva (bot removido, chat inexistente): não repete; o dono vê no relatório
        bump(out.notifySkipped, 'falha_definitiva');
      }
    } catch {
      out.errors++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Implementação com banco
// ---------------------------------------------------------------------------
type AnnRow = {
  id: string; network_slug: string; kind: string; coupon_ref: string; label: string; offer_id: string | null; vertical: string;
  store_id: string | null; first_sent_at: string | Date; last_sent_at: string | Date; ended_at?: string | Date; end_reason?: string;
};
const mapAnn = (r: AnnRow): Announcement => ({
  id: r.id, networkSlug: r.network_slug, kind: r.kind as AnnKind, couponRef: r.coupon_ref, label: r.label, offerId: r.offer_id,
  vertical: r.vertical, storeId: r.store_id, firstSentAt: new Date(r.first_sent_at), lastSentAt: new Date(r.last_sent_at),
});
const ANN_COLS = sql`id::text AS id, network_slug, kind, coupon_ref, label, offer_id::text AS offer_id, vertical, store_id::text AS store_id, first_sent_at, last_sent_at`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dbGuardiaoStore: GuardiaoStore = {
  async listOpen(limit) {
    const rows = (await db.execute<AnnRow>(sql`SELECT ${ANN_COLS} FROM coupon_announcements WHERE ended_at IS NULL ORDER BY last_checked_at NULLS FIRST, first_sent_at LIMIT ${limit}`)) as unknown as AnnRow[];
    return rows.map(mapAnn);
  },

  async evidence(ann) {
    if (ann.kind === 'anuncio') {
      const offer = (await db.execute<{ status: string; price: string | null }>(sql`
        SELECT status, current_price_cents::text AS price FROM affiliate_offers WHERE id = ${ann.couponRef}::uuid LIMIT 1`)) as unknown as { status: string; price: string | null }[];
      const reads = (await db.execute<{ read_at: string | Date; with_c: number | null }>(sql`
        SELECT read_at, price_with_coupon_cents AS with_c FROM offer_coupon_reads WHERE offer_id = ${ann.couponRef}::uuid ORDER BY read_at DESC LIMIT 1`)) as unknown as { read_at: string | Date; with_c: number | null }[];
      const pos = (await db.execute<{ read_at: string | Date; with_c: number }>(sql`
        SELECT read_at, price_with_coupon_cents AS with_c FROM offer_coupon_reads
        WHERE offer_id = ${ann.couponRef}::uuid AND price_with_coupon_cents IS NOT NULL ORDER BY read_at DESC LIMIT 1`)) as unknown as { read_at: string | Date; with_c: number }[];
      return {
        kind: 'anuncio',
        offerActive: offer[0]?.status === 'active',
        currentPriceCents: offer[0]?.price != null ? Number(offer[0].price) : null,
        lastRead: reads[0] ? { readAt: new Date(reads[0].read_at), priceWithCents: reads[0].with_c } : null,
        lastPositive: pos[0] ? { readAt: new Date(pos[0].read_at), priceWithCents: Number(pos[0].with_c) } : null,
      };
    }
    const kind = ann.kind;
    if (!UUID.test(ann.couponRef)) return { kind, row: null };
    const rows = (await db.execute<{ state: string; state_reason: string | null; valid_until: string | Date | null; last_seen_at: string | Date }>(sql`
      SELECT state, state_reason, valid_until, last_seen_at FROM coupon_items WHERE id = ${ann.couponRef}::uuid LIMIT 1`)) as unknown as { state: string; state_reason: string | null; valid_until: string | Date | null; last_seen_at: string | Date }[];
    const r = rows[0];
    return { kind, row: r ? { state: r.state, stateReason: r.state_reason, validUntil: r.valid_until ? new Date(r.valid_until) : null, lastSeenAt: new Date(r.last_seen_at) } : null };
  },

  async touch(id, now) {
    await db.execute(sql`UPDATE coupon_announcements SET last_checked_at = ${now.toISOString()}::timestamptz WHERE id = ${id}::uuid`);
  },

  async end(id, reason, now) {
    const r = (await db.execute<{ id: string }>(sql`
      UPDATE coupon_announcements SET ended_at = ${now.toISOString()}::timestamptz, end_reason = ${reason}, last_checked_at = ${now.toISOString()}::timestamptz
      WHERE id = ${id}::uuid AND ended_at IS NULL RETURNING id::text AS id`)) as unknown as { id: string }[];
    return r.length > 0;
  },

  async listPending(now, limit) {
    const rows = (await db.execute<AnnRow>(sql`
      SELECT ${ANN_COLS}, ended_at, end_reason FROM coupon_announcements
      WHERE ended_at IS NOT NULL AND end_notified_at IS NULL AND ended_at > ${now.toISOString()}::timestamptz - make_interval(mins => ${ENDED_CARD_STALE_MIN}::int)
        AND (end_reason IN ('sumiu_da_pagina', 'cancelado_pelo_dono') OR (end_reason = 'venceu' AND kind <> 'anuncio'))
      ORDER BY ended_at LIMIT ${limit}`)) as unknown as AnnRow[];
    return rows.map((r) => ({ ...mapAnn(r), endedAt: new Date(r.ended_at as string | Date), reason: r.end_reason as EndReason }));
  },

  async notifiedLastHour(ann, now) {
    const since = new Date(now.getTime() - 3_600_000).toISOString();
    const rows = (await db.execute<{ n: string }>(
      ann.storeId
        ? sql`SELECT count(*)::text AS n FROM coupon_announcements WHERE store_id = ${ann.storeId}::uuid AND end_notified_at > ${since}::timestamptz`
        : sql`SELECT count(*)::text AS n FROM coupon_announcements WHERE store_id IS NULL AND vertical = ${ann.vertical} AND end_notified_at > ${since}::timestamptz`
    )) as unknown as { n: string }[];
    return Number(rows[0]?.n ?? 0);
  },

  async claimNotify(id, now) {
    const r = (await db.execute<{ id: string }>(sql`
      UPDATE coupon_announcements SET end_notified_at = ${now.toISOString()}::timestamptz WHERE id = ${id}::uuid AND end_notified_at IS NULL AND ended_at IS NOT NULL
      RETURNING id::text AS id`)) as unknown as { id: string }[];
    return r.length > 0;
  },

  async releaseNotify(id) {
    await db.execute(sql`UPDATE coupon_announcements SET end_notified_at = NULL WHERE id = ${id}::uuid`);
  },
};

/**
 * Canal da loja do cupom. Verificado = chat gravado na loja COM verificação e bot autorizado a postar, ou o chat de transição do
 * ambiente da loja games (o grupo que já recebe as ofertas). Nunca cai no canal de outra loja.
 */
export async function resolveChannelDb(ann: Announcement, env: Record<string, string | undefined> = process.env): Promise<Channel | null> {
  const st = await getStoreByVertical(ann.vertical).catch(() => null);
  if (!st) return null;
  const chatId = chatForStore(st, env);
  if (!chatId) return null;
  const viaTabela = !!st.telegramChatId;
  if (viaTabela && !(st.telegramVerifiedAt && st.telegramBotCanPost)) return null;
  if (!viaTabela && st.slug !== LOJA_GAMES) return null;
  return { slug: st.slug, chatId };
}

async function renderDefault(a: { storeSlug: string; label: string; networkName: string; at: Date }): Promise<Uint8Array | null> {
  const { renderEndedCouponCard } = await import('@/server/messaging/ended-coupon-card');
  return renderEndedCouponCard(a);
}

/** Intervalo mínimo entre ciclos (o cron pode chamar a cada minuto). */
const CYCLE_MIN_GAP_MS = 4 * 60_000;

async function lastCycleAt(): Promise<Date | null> {
  try {
    const r = (await db.execute<{ at: string | Date | null }>(sql`SELECT max(started_at) AS at FROM collector_runs WHERE job = 'agente-cupons'`)) as unknown as { at: string | Date | null }[];
    return r[0]?.at ? new Date(r[0].at) : null;
  } catch {
    return null;
  }
}

/**
 * Passo do cron: guardião + relatório + registro em collector_runs. Tolerante a falha (migração 0037 ausente => pula sem erro).
 * `force` ignora o intervalo mínimo (uso manual / testes).
 */
export async function cicloAgenteCupons(opts: { budgetMs?: number; force?: boolean } = {}): Promise<Record<string, unknown>> {
  const started = new Date();
  try {
    if (!opts.force) {
      const last = await lastCycleAt();
      if (last && started.getTime() - last.getTime() < CYCLE_MIN_GAP_MS) return { skipped: 'ciclo recente' };
    }
    const canSend = isGroupMessagesEnabled() && getGroupMessagesMode() === 'send' && !!process.env.TELEGRAM_BOT_TOKEN;
    const res = await rodarGuardiao({
      store: dbGuardiaoStore,
      resolveChannel: (a) => resolveChannelDb(a),
      render: renderDefault,
      token: process.env.TELEGRAM_BOT_TOKEN,
      adTag: getAdTag(),
      canSend,
      budgetMs: opts.budgetMs ?? 15_000,
      now: started,
    });
    const rel = await relatorioCupons(started);
    const meta = resumoRelatorio(rel, {
      verificados: res.checked, encerradosNoCiclo: res.ended.length, avisosEnviados: res.notified, avisosPulados: res.notifySkipped,
      divergenciasNoCiclo: res.divergencias.length, erros: res.errors, orcamentoEsgotado: res.budgetExhausted,
    });
    await gravarCicloAgente(meta, started, res.errors === 0);
    return meta;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 160) : 'erro';
    // tabela ausente (0037 ainda não aplicada) é esperado: não grava ruído
    if (!/coupon_announcements|coupon_consults/.test(msg)) await gravarCicloAgente({ erro: msg }, started, false);
    return { erro: msg };
  }
}

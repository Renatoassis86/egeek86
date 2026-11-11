import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { CouponInfo } from '@/lib/messaging/group-messages';
import type { AnnKind, CouponRefMeta } from '@/lib/coupons/guardiao-model';
import { lookupItemCoupon } from '@/server/messaging/coupon-item-lookup';
import { lookupCampaignCoupon } from '@/server/messaging/campaign-coupon-lookup';
import { lookupVerifiedCoupon } from '@/server/messaging/coupon-lookup';
import type { MissTrace } from '@/lib/coupons/agulha';

/**
 * AGENTE DE CUPONS: consulta ÚNICA do motor de mensagens ("há cupom ativo e testado para esta oferta?") e registro da divulgação.
 * Ordem de confiança (spec agents/agente-cupons.md): cupom do anúncio (lido na página do item, 2 h) -> código de campanha do dono
 * (24 h) -> cupom de loja ou categoria verificado (2 h). Sem leitura recente, sem cupom: nunca inventa. Cada consulta fica em
 * coupon_consults (auditoria; tolerante a tabela ausente enquanto a migração 0037 não é aplicada).
 */
export type CouponSource = 'item' | 'campanha' | 'loja_categoria';
export type ConsultedCoupon = CouponInfo & { source: CouponSource; couponRef: string; annKind: AnnKind };

type Lookup = (offerId: string, trace?: MissTrace) => Promise<(CouponInfo & CouponRefMeta) | null>;

export interface ConsultaDeps {
  item?: Lookup;
  campanha?: Lookup;
  lojaCategoria?: Lookup;
  /** Auditoria (padrão: coupon_consults). Falha nunca derruba a consulta. */
  audit?: (row: ConsultAudit) => Promise<void>;
}

export interface ConsultAudit {
  offerId: string;
  found: boolean;
  source: CouponSource | null;
  couponRef: string | null;
  /** Por que NÃO saiu cupom (um item por etapa que descartou), ex.: item:sem_leitura | campanha:sem_codigo_do_dono_ativo. Vazio quando achou. */
  missReason?: string | null;
}

/** Colunas miss_reason (migration 0041) ausentes => cai para o insert antigo e lembra, sem erro a cada consulta. */
let hasMissColumn: boolean | null = null;

async function auditDb(row: ConsultAudit): Promise<void> {
  if (hasMissColumn !== false) {
    try {
      await db.execute(sql`INSERT INTO coupon_consults (offer_id, found, source, coupon_ref, miss_reason) VALUES (${row.offerId}::uuid, ${row.found}, ${row.source}, ${row.couponRef}, ${row.missReason ?? null})`);
      hasMissColumn = true;
      return;
    } catch (e) {
      if (!/miss_reason/.test(String((e as { message?: string })?.message ?? '') + String((e as { cause?: { message?: string } })?.cause?.message ?? ''))) throw e;
      hasMissColumn = false;
    }
  }
  await db.execute(sql`INSERT INTO coupon_consults (offer_id, found, source, coupon_ref) VALUES (${row.offerId}::uuid, ${row.found}, ${row.source}, ${row.couponRef})`);
}

export async function consultarCupom(offerId: string, deps: ConsultaDeps = {}): Promise<ConsultedCoupon | null> {
  const steps: [CouponSource, Lookup, AnnKind][] = [
    ['item', deps.item ?? lookupItemCoupon, 'anuncio'],
    ['campanha', deps.campanha ?? lookupCampaignCoupon, 'campanha'],
    ['loja_categoria', deps.lojaCategoria ?? lookupVerifiedCoupon, 'loja'],
  ];
  let result: ConsultedCoupon | null = null;
  const misses: string[] = [];
  for (const [source, fn, defaultKind] of steps) {
    const info = await fn(offerId, (reason) => misses.push(`${source}:${reason}`.slice(0, 80))).catch(() => {
      misses.push(`${source}:erro_na_consulta`);
      return null;
    });
    if (!info) continue;
    result = {
      ...info,
      source,
      annKind: info.annKind ?? defaultKind,
      couponRef: info.couponRef ?? (source === 'item' ? offerId : `${source}:${info.code}`),
    };
    break;
  }
  try {
    await (deps.audit ?? auditDb)({ offerId, found: !!result, source: result?.source ?? null, couponRef: result?.couponRef ?? null, missReason: result ? null : misses.join(' | ').slice(0, 300) || null });
  } catch {
    // auditoria é opcional
  }
  return result;
}

export interface DivulgacaoCtx {
  networkSlug: string;
  offerId: string | null;
  vertical: string;
  storeId: string | null;
  groupMessageId: string | null;
}

/** Registra (ou renova) o cupom que acabou de ir numa mensagem. Upsert por (coupon_ref, vertical) enquanto aberto. */
export async function registrarDivulgacao(info: CouponInfo & CouponRefMeta, ctx: DivulgacaoCtx): Promise<void> {
  if (!info.couponRef || !info.annKind || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(info.couponRef)) return;
  await db.execute(sql`
    INSERT INTO coupon_announcements (network_slug, kind, coupon_ref, label, offer_id, vertical, store_id, group_message_id)
    VALUES (${ctx.networkSlug}, ${info.annKind}, ${info.couponRef}, ${info.code.slice(0, 120)}, ${ctx.offerId}::uuid, ${ctx.vertical}, ${ctx.storeId}::uuid, ${ctx.groupMessageId}::uuid)
    ON CONFLICT (coupon_ref, vertical) WHERE ended_at IS NULL
    DO UPDATE SET last_sent_at = now(), label = EXCLUDED.label, offer_id = EXCLUDED.offer_id, group_message_id = EXCLUDED.group_message_id,
                  store_id = COALESCE(EXCLUDED.store_id, coupon_announcements.store_id)`);
}

// ---------------------------------------------------------------------------
// Relatório interno
// ---------------------------------------------------------------------------
export interface RelatorioCupons {
  geradoEm: string;
  novos: { total: number; lista: { id: string; kind: string; label: string; network: string; vertical: string; firstSentAt: string }[] };
  encerrados: { total: number; lista: { id: string; kind: string; label: string; network: string; vertical: string; reason: string; endedAt: string; notifiedAt: string | null }[] };
  expirandoEm24h: { total: number; lista: { id: string; network: string; label: string; validUntil: string; origem: string }[] };
  divergencias: { total: number; lista: { id: string; label: string; detalhe: string }[] };
  fontesSemLeitura: { fonte: string; ultimaLeituraEm: string | null; idadeMin: number | null }[];
}

export const FONTE_STALE_MIN = 120;

/** Números para a equipe interna. Somente leitura; tabela ausente (migração 0037 não aplicada) => seções de divulgação vazias. */
export async function relatorioCupons(now: Date = new Date()): Promise<RelatorioCupons> {
  const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);
  const safe = async <T,>(fn: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return empty;
    }
  };
  const nowIso = now.toISOString();

  const novos = await safe(
    async () =>
      (await db.execute<{ id: string; kind: string; label: string; network_slug: string; vertical: string; first_sent_at: string | Date }>(sql`
        SELECT id::text AS id, kind, label, network_slug, vertical, first_sent_at FROM coupon_announcements
        WHERE first_sent_at > ${nowIso}::timestamptz - interval '24 hours' ORDER BY first_sent_at DESC LIMIT 50`)) as unknown as { id: string; kind: string; label: string; network_slug: string; vertical: string; first_sent_at: string | Date }[],
    []
  );
  const encerrados = await safe(
    async () =>
      (await db.execute<{ id: string; kind: string; label: string; network_slug: string; vertical: string; end_reason: string; ended_at: string | Date; end_notified_at: string | Date | null }>(sql`
        SELECT id::text AS id, kind, label, network_slug, vertical, end_reason, ended_at, end_notified_at FROM coupon_announcements
        WHERE ended_at > ${nowIso}::timestamptz - interval '24 hours' ORDER BY ended_at DESC LIMIT 100`)) as unknown as { id: string; kind: string; label: string; network_slug: string; vertical: string; end_reason: string; ended_at: string | Date; end_notified_at: string | Date | null }[],
    []
  );
  const expirando = await safe(
    async () =>
      (await db.execute<{ id: string; network_slug: string; code: string | null; kind: string; value_num: string | null; valid_until: string | Date; source_kind: string }>(sql`
        SELECT id::text AS id, network_slug, code, kind, value_num::text AS value_num, valid_until, source_kind FROM coupon_items
        WHERE state = 'verificado' AND valid_until > ${nowIso}::timestamptz AND valid_until <= ${nowIso}::timestamptz + interval '24 hours'
        ORDER BY valid_until LIMIT 50`)) as unknown as { id: string; network_slug: string; code: string | null; kind: string; value_num: string | null; valid_until: string | Date; source_kind: string }[],
    []
  );
  // Divergência: cupom divulgado que a fonte já não mostra (encerrado por sumiço na janela) ou loja/categoria que perdeu a verificação.
  const diverge = await safe(
    async () =>
      (await db.execute<{ id: string; label: string; detalhe: string }>(sql`
        SELECT a.id::text AS id, a.label, 'divulgado e a pagina deixou de mostrar' AS detalhe FROM coupon_announcements a
        WHERE a.end_reason = 'sumiu_da_pagina' AND a.ended_at > ${nowIso}::timestamptz - interval '24 hours'
        UNION ALL
        SELECT a.id::text, a.label, 'cupom divulgado perdeu a verificacao (aguardando nova leitura)' FROM coupon_announcements a
        JOIN coupon_items c ON c.id::text = a.coupon_ref
        WHERE a.ended_at IS NULL AND a.kind IN ('loja', 'categoria') AND c.state = 'nao_verificado'
        LIMIT 50`)) as unknown as { id: string; label: string; detalhe: string }[],
    []
  );
  const fontes = await safe(
    async () => {
      const ml = (await db.execute<{ at: string | Date | null }>(sql`SELECT max(read_at) AS at FROM offer_coupon_reads`)) as unknown as { at: string | Date | null }[];
      const items = (await db.execute<{ net: string; at: string | Date | null }>(sql`
        SELECT network_slug AS net, max(last_seen_at) AS at FROM coupon_items WHERE source_kind <> 'manual_dono' GROUP BY network_slug`)) as unknown as { net: string; at: string | Date | null }[];
      const out: { fonte: string; at: string | Date | null }[] = [{ fonte: 'mercado-livre:pagina-do-item', at: ml[0]?.at ?? null }];
      for (const n of ['mercado-livre', 'shopee', 'amazon']) out.push({ fonte: `${n}:cupons-de-loja`, at: items.find((i) => i.net === n)?.at ?? null });
      return out;
    },
    [] as { fonte: string; at: string | Date | null }[]
  );

  return {
    geradoEm: nowIso,
    novos: { total: novos.length, lista: novos.map((r) => ({ id: r.id, kind: r.kind, label: r.label, network: r.network_slug, vertical: r.vertical, firstSentAt: iso(r.first_sent_at)! })) },
    encerrados: {
      total: encerrados.length,
      lista: encerrados.map((r) => ({ id: r.id, kind: r.kind, label: r.label, network: r.network_slug, vertical: r.vertical, reason: r.end_reason, endedAt: iso(r.ended_at)!, notifiedAt: iso(r.end_notified_at) })),
    },
    expirandoEm24h: {
      total: expirando.length,
      lista: expirando.map((r) => ({
        id: r.id, network: r.network_slug, validUntil: iso(r.valid_until)!, origem: r.source_kind === 'manual_dono' ? 'campanha do dono' : 'lida na loja',
        label: r.code ?? (r.value_num ? `${r.kind} ${r.value_num}` : r.kind),
      })),
    },
    divergencias: { total: diverge.length, lista: diverge.map((r) => ({ id: r.id, label: r.label, detalhe: r.detalhe })) },
    fontesSemLeitura: fontes
      .map((f) => ({ fonte: f.fonte, ultimaLeituraEm: iso(f.at), idadeMin: f.at ? Math.round((now.getTime() - new Date(f.at).getTime()) / 60_000) : null }))
      .filter((f) => f.idadeMin == null || f.idadeMin > FONTE_STALE_MIN),
  };
}

/** Resumo pequeno (só números e ids curtos) para collector_runs.meta. Sem segredo, sem texto longo. */
export function resumoRelatorio(r: RelatorioCupons, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    novos: r.novos.total,
    encerrados: r.encerrados.total,
    encerradosPorMotivo: r.encerrados.lista.reduce<Record<string, number>>((m, e) => ((m[e.reason] = (m[e.reason] ?? 0) + 1), m), {}),
    expirandoEm24h: r.expirandoEm24h.total,
    divergencias: r.divergencias.total,
    fontesSemLeitura: r.fontesSemLeitura.map((f) => f.fonte),
    ...extra,
  };
}

/** Uma linha em collector_runs (job 'agente-cupons') por ciclo. Tolerante a falha. */
export async function gravarCicloAgente(meta: Record<string, unknown>, startedAt: Date, ok: boolean): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
      VALUES ('agente-cupons', NULL, ${startedAt.toISOString()}::timestamptz, now(), ${Math.max(0, Date.now() - startedAt.getTime())}::int,
              ${ok ? 'ok' : 'partial'}, ${JSON.stringify(meta)}::jsonb)`);
  } catch (e) {
    console.error('[agente-cupons] gravar ciclo falhou (ignorado):', e instanceof Error ? e.message : e);
  }
}

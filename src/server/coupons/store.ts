import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sha256 } from './normalize';
import type { BatchValidation } from './normalize';
import { DEFAULT_MAX_AGE_MINUTES, VERIFIED_BY, decideState, isUsableForMessage, matchesScope, meetsMinimum, type ScopeTarget } from './vigencia';
import type { CouponNetwork, CouponScopeRef, NormalizedCoupon, StoredCoupon } from './types';

/**
 * Camada de banco dos cupons (tabelas coupon_items e coupon_reads, migration 0029 PROPOSTA). SQL cru, como o resto do projeto
 * para tabelas fora do schema Drizzle. Datas saem do banco como ISO UTC em texto (to_char) e entram como texto ISO com
 * ::timestamptz: o drizzle com postgres-js nao aceita Date em SQL cru.
 */

const ts = (col: string, alias = col) => sql.raw(`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${alias}`);

export function isMissingCouponTable(e: unknown): boolean {
  const m = String((e as { message?: string; cause?: { message?: string } })?.message ?? '') + String((e as { cause?: { message?: string } })?.cause?.message ?? '');
  return /coupon_(items|reads)/.test(m) && /does not exist|relation/.test(m);
}

export type Row = {
  id: string; network_slug: CouponNetwork; code: string | null; kind: StoredCoupon['kind']; value_num: string | null; value_unit: StoredCoupon['valueUnit'];
  min_order_cents: string | null; max_discount_cents: string | null; conditions_raw: string; audience: StoredCoupon['audience']; audience_text: string | null;
  eligible_on_read_account: boolean | null; scope_kind: StoredCoupon['scopeKind']; scope: CouponScopeRef; source_url: string;
  valid_from: string | null; valid_until: string | null; validity_source: StoredCoupon['validitySource']; state: StoredCoupon['state'];
  first_seen_at: string; streak_started_at: string; last_seen_at: string; verified_at: string | null; last_page_price_cents: string | null;
};

export const SELECT_COLS = sql`
  id::text AS id, network_slug, code, kind, value_num::text AS value_num, value_unit, min_order_cents::text AS min_order_cents,
  max_discount_cents::text AS max_discount_cents, conditions_raw, audience, audience_text, eligible_on_read_account, scope_kind, scope, source_url,
  ${ts('valid_from')}, ${ts('valid_until')}, validity_source, state, ${ts('first_seen_at')}, ${ts('streak_started_at')}, ${ts('last_seen_at')},
  ${ts('verified_at')}, last_page_price_cents::text AS last_page_price_cents`;

const num = (v: string | null) => (v === null ? null : Number(v));

export function mapRow(r: Row): StoredCoupon {
  return {
    id: r.id, network: r.network_slug, code: r.code, kind: r.kind, valueNum: num(r.value_num), valueUnit: r.value_unit,
    minOrderCents: num(r.min_order_cents), maxDiscountCents: num(r.max_discount_cents), conditionsRaw: r.conditions_raw,
    audience: r.audience, audienceText: r.audience_text, eligibleOnReadAccount: r.eligible_on_read_account,
    scopeKind: r.scope_kind, scope: r.scope ?? {}, sourceUrl: r.source_url, validFrom: r.valid_from, validUntil: r.valid_until,
    validitySource: r.validity_source, state: r.state, firstSeenAt: r.first_seen_at, streakStartedAt: r.streak_started_at,
    lastSeenAt: r.last_seen_at, verifiedAt: r.verified_at, lastPagePriceCents: num(r.last_page_price_cents),
  };
}

export interface FindVerifiedCouponsInput extends ScopeTarget {
  networkSlug: CouponNetwork;
  /** Idade maxima da ultima verificacao. Regra do conselho: 120 (2 h). */
  maxAgeMinutes?: number;
  /** Preco atual da oferta (centavos): cupom com minimo de compra acima dele e descartado. */
  priceCents?: number;
  now?: Date;
  allowNoExpiry?: boolean;
  limit?: number;
}

/**
 * Cupons que PODEM entrar em uma mensagem agora: verificados nas ultimas `maxAgeMinutes`, com prazo lido no futuro, escopo casando
 * com a oferta/produto e minimo de compra alcancado. Sem a migration 0029 (tabela ausente) devolve [] : a mensagem sai sem cupom.
 */
export async function findVerifiedCoupons(input: FindVerifiedCouponsInput): Promise<StoredCoupon[]> {
  const now = input.now ?? new Date();
  const maxAge = input.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES;
  const since = new Date(now.getTime() - maxAge * 60_000).toISOString();
  let rows: Row[];
  try {
    rows = (await db.execute<Row>(sql`
      SELECT ${SELECT_COLS} FROM coupon_items
      WHERE network_slug = ${input.networkSlug} AND state = 'verificado' AND source_kind <> 'manual_dono' AND verified_at >= ${since}::timestamptz
      ORDER BY verified_at DESC LIMIT ${Math.min(Math.max(1, input.limit ?? 200), 500)}`)) as unknown as Row[];
  } catch (e) {
    if (isMissingCouponTable(e)) return [];
    throw e;
  }
  return rows
    .map(mapRow)
    .filter((c) => isUsableForMessage(c, { now, maxAgeMinutes: maxAge, allowNoExpiry: input.allowNoExpiry }))
    .filter((c) => matchesScope(c, input))
    .filter((c) => meetsMinimum(c, input.priceCents));
}

/** Cupons conhecidos e ainda nao vencidos (para a rotina reverificar). */
export async function listActiveCoupons(network: CouponNetwork | null, limit = 200): Promise<StoredCoupon[]> {
  const rows = (await db.execute<Row>(sql`
    SELECT ${SELECT_COLS} FROM coupon_items
    WHERE state IN ('nao_verificado', 'verificado') AND source_kind <> 'manual_dono' AND (valid_until IS NULL OR valid_until > now())
      ${network ? sql`AND network_slug = ${network}` : sql``}
    ORDER BY last_seen_at DESC LIMIT ${Math.min(Math.max(1, limit), 500)}`)) as unknown as Row[];
  return rows.map(mapRow);
}

export interface IngestSummary {
  recebidos: number;
  gravados: number;
  novos: number;
  verificados: number;
  fora_de_ordem: number;
  vencidos_por_ausencia: number;
  vencidos_por_prazo: number;
  rejeitados: { index: number; reason: string }[];
}

async function upsertOne(c: NormalizedCoupon, summary: IngestSummary): Promise<void> {
  const found = (await db.execute<{ id: string; state: StoredCoupon['state']; streak_started_at: string; last_seen_at: string }>(sql`
    SELECT id::text AS id, state, ${ts('streak_started_at')}, ${ts('last_seen_at')} FROM coupon_items
    WHERE network_slug = ${c.network} AND dedup_hash = ${c.dedupHash}`)) as unknown as { id: string; state: StoredCoupon['state']; streak_started_at: string; last_seen_at: string }[];
  const ex = found[0];
  const d = decideState(ex ? { state: ex.state, streakStartedAt: ex.streak_started_at, lastSeenAt: ex.last_seen_at } : null, c);
  if (!d.applies) { summary.fora_de_ordem++; return; }

  const scope = JSON.stringify(c.scope);
  const conditions = JSON.stringify(c.conditions);
  const verifiedAt = d.state === 'verificado' ? d.verifiedAt : null;
  const verifiedBy = d.state === 'verificado' ? VERIFIED_BY : null;
  let id: string;
  if (!ex) {
    const ins = (await db.execute<{ id: string }>(sql`
      INSERT INTO coupon_items (network_slug, code, kind, value_num, value_unit, min_order_cents, max_discount_cents, conditions_raw, conditions,
        audience, audience_text, eligible_on_read_account, read_account, scope_kind, scope, source_url, source_kind, raw_text,
        valid_from, valid_until, validity_source, validity_raw, state, state_reason, first_seen_at, streak_started_at, last_seen_at,
        verified_at, verified_by, last_page_price_cents, dedup_hash)
      VALUES (${c.network}, ${c.code}, ${c.kind}, ${c.valueNum}, ${c.valueUnit}, ${c.minOrderCents}, ${c.maxDiscountCents}, ${c.conditionsRaw}, ${conditions}::jsonb,
        ${c.audience}, ${c.audienceText}, ${c.eligibleOnReadAccount}, ${c.readAccount}, ${c.scopeKind}, ${scope}::jsonb, ${c.sourceUrl}, ${c.sourceKind}, ${c.rawText},
        ${c.validFrom}::timestamptz, ${c.validUntil}::timestamptz, ${c.validitySource}, ${c.validityRaw}, ${d.state}, ${d.reason}, ${c.readAt}::timestamptz,
        ${d.streakStartedAt}::timestamptz, ${c.readAt}::timestamptz, ${verifiedAt}::timestamptz, ${verifiedBy}, ${c.pagePriceCents}, ${c.dedupHash})
      ON CONFLICT (network_slug, dedup_hash) DO NOTHING
      RETURNING id::text AS id`)) as unknown as { id: string }[];
    if (!ins[0]) { summary.fora_de_ordem++; return; } // corrida com outra requisicao: a proxima leitura reprocessa
    id = ins[0].id;
    summary.novos++;
  } else {
    id = ex.id;
    await db.execute(sql`
      UPDATE coupon_items SET kind = ${c.kind}, value_num = ${c.valueNum}, value_unit = ${c.valueUnit}, conditions_raw = ${c.conditionsRaw}, conditions = ${conditions}::jsonb,
        audience_text = ${c.audienceText}, eligible_on_read_account = ${c.eligibleOnReadAccount}, read_account = ${c.readAccount}, source_url = ${c.sourceUrl},
        source_kind = ${c.sourceKind}, raw_text = ${c.rawText}, valid_from = ${c.validFrom}::timestamptz, valid_until = ${c.validUntil}::timestamptz,
        validity_source = ${c.validitySource}, validity_raw = ${c.validityRaw}, state = ${d.state}, state_reason = ${d.reason},
        streak_started_at = ${d.streakStartedAt}::timestamptz, last_seen_at = ${c.readAt}::timestamptz, verified_at = ${verifiedAt}::timestamptz,
        verified_by = ${verifiedBy}, last_page_price_cents = ${c.pagePriceCents}, updated_at = now()
      WHERE id = ${id}::uuid`);
  }
  await db.execute(sql`
    INSERT INTO coupon_reads (coupon_id, read_at, source_url, state_seen, evidence_hash, page_price_cents, state_after)
    VALUES (${id}::uuid, ${c.readAt}::timestamptz, ${c.sourceUrl}, 'visto', ${c.evidenceHash}, ${c.pagePriceCents}, ${d.state})`);
  summary.gravados++;
  if (d.state === 'verificado') summary.verificados++;
  if (d.state === 'vencido') summary.vencidos_por_prazo++;
}

/** Grava um lote ja validado. O SERVIDOR decide o estado; a aba so informa o que leu. */
export async function ingestCouponBatch(v: BatchValidation): Promise<IngestSummary> {
  const { network, batchSourceUrl, readAt } = v.context;
  const summary: IngestSummary = {
    recebidos: v.coupons.length + v.rejected.length, gravados: 0, novos: 0, verificados: 0, fora_de_ordem: 0,
    vencidos_por_ausencia: 0, vencidos_por_prazo: 0, rejeitados: v.rejected,
  };
  for (const c of v.coupons) await upsertOne(c, summary);

  if (v.complete) {
    // Releitura COMPLETA da fonte: o que o servidor conhece dessa fonte e nao veio agora sumiu da pagina -> vencido (ausencia nao prova validade).
    const seen = v.coupons.map((c) => c.dedupHash);
    const notSeen: SQL = seen.length ? sql`AND dedup_hash NOT IN (${sql.join(seen.map((h) => sql`${h}`), sql`, `)})` : sql``;
    const gone = (await db.execute<{ id: string }>(sql`
      UPDATE coupon_items SET state = 'vencido', state_reason = 'sumiu_da_releitura_completa', verified_at = NULL, updated_at = now()
      WHERE network_slug = ${network} AND source_url = ${batchSourceUrl} AND source_kind <> 'manual_dono' AND state IN ('nao_verificado', 'verificado')
        AND last_seen_at < ${readAt}::timestamptz ${notSeen}
      RETURNING id::text AS id`)) as unknown as { id: string }[];
    summary.vencidos_por_ausencia = gone.length;
    if (gone.length) {
      const evidence = sha256(JSON.stringify(seen.sort()));
      for (const g of gone) {
        await db.execute(sql`
          INSERT INTO coupon_reads (coupon_id, read_at, source_url, state_seen, evidence_hash, page_price_cents, state_after)
          VALUES (${g.id}::uuid, ${readAt}::timestamptz, ${batchSourceUrl}, 'ausente', ${evidence}, NULL, 'vencido')`);
      }
    }
  }
  // Varredura por prazo lido (nao depende da fonte): vencido por data.
  const expired = (await db.execute<{ id: string }>(sql`
    UPDATE coupon_items SET state = 'vencido', state_reason = 'prazo_lido_vencido', verified_at = NULL, updated_at = now()
    WHERE network_slug = ${network} AND source_kind <> 'manual_dono' AND state IN ('nao_verificado', 'verificado') AND valid_until IS NOT NULL AND valid_until <= ${readAt}::timestamptz
    RETURNING id::text AS id`)) as unknown as { id: string }[];
  summary.vencidos_por_prazo += expired.length;
  return summary;
}

/** Registro da leitura em collector_runs (job 'cupons-assistida'). Falha aqui nunca derruba a ingestao. */
export async function recordCouponRun(network: CouponNetwork, startedAtMs: number, summary: IngestSummary, meta: Record<string, unknown>): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, offers_created, errors, meta)
      VALUES ('cupons-assistida', ${network}, ${new Date(startedAtMs).toISOString()}::timestamptz, now(), ${Date.now() - startedAtMs}, 'ok',
        ${summary.recebidos}, ${summary.gravados}, 0, ${summary.rejeitados.length}, ${JSON.stringify({ ...meta, ...summary, rejeitados: summary.rejeitados.slice(0, 20) })}::jsonb)`);
  } catch (e) {
    console.error('[cupons] falha ao registrar collector_runs', e);
  }
}

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { SELECT_COLS, mapRow, isMissingCouponTable, type Row } from './store';
import { CAMPAIGN_SOURCE_KIND, CAMPAIGN_VERIFIED_BY, isCampaignUsable, type ValidCampaign } from './campaign';
import type { CouponNetwork, StoredCoupon } from './types';

/**
 * Banco dos codigos de campanha do dono (coupon_items com source_kind = 'manual_dono'; exige a migration 0035, alem da 0029).
 * Toda gravacao deixa uma linha em coupon_reads (evidencia: quem, quando, URL). Nada aqui le portal: so o que o dono digitou.
 */

export function isMissingManualKind(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? '') + String((e as { cause?: { message?: string } })?.cause?.message ?? '');
  return /coupon_items_srckind_chk/.test(m);
}

/** Cadastra (ou confirma de novo, se o mesmo codigo+regra ja existir) um codigo de campanha. Estado 'verificado' (validade futura e fonte ja checadas). */
export async function saveCampaignCoupon(c: ValidCampaign, now: Date = new Date()): Promise<{ id: string; created: boolean }> {
  const nowIso = now.toISOString();
  const scope = JSON.stringify(c.scope);
  const conditions = JSON.stringify({ origem: 'cadastro_do_dono', observacao: c.note, onde_visto: c.sourceUrl });
  const found = (await db.execute<{ id: string }>(sql`
    SELECT id::text AS id FROM coupon_items WHERE network_slug = ${c.network} AND dedup_hash = ${c.dedupHash}`)) as unknown as { id: string }[];
  let id: string;
  let created = false;
  if (found[0]) {
    id = found[0].id;
    await db.execute(sql`
      UPDATE coupon_items SET conditions_raw = ${c.conditionsRaw}, conditions = ${conditions}::jsonb, source_url = ${c.sourceUrl}, raw_text = ${c.rawText},
        valid_until = ${c.validUntil}::timestamptz, validity_source = 'texto_da_pagina', validity_raw = 'informado pelo dono',
        state = 'verificado', state_reason = 'confirmado_pelo_dono', last_seen_at = ${nowIso}::timestamptz, verified_at = ${nowIso}::timestamptz,
        verified_by = ${CAMPAIGN_VERIFIED_BY}, updated_at = now()
      WHERE id = ${id}::uuid`);
  } else {
    const ins = (await db.execute<{ id: string }>(sql`
      INSERT INTO coupon_items (network_slug, code, kind, value_num, value_unit, min_order_cents, max_discount_cents, conditions_raw, conditions,
        audience, scope_kind, scope, source_url, source_kind, raw_text, valid_from, valid_until, validity_source, validity_raw, state, state_reason,
        first_seen_at, streak_started_at, last_seen_at, verified_at, verified_by, dedup_hash)
      VALUES (${c.network}, ${c.code}, ${c.kind}, ${c.valueNum}, ${c.valueUnit}, ${c.minOrderCents}, ${c.maxDiscountCents}, ${c.conditionsRaw}, ${conditions}::jsonb,
        'todos', ${c.scopeKind}, ${scope}::jsonb, ${c.sourceUrl}, ${CAMPAIGN_SOURCE_KIND}, ${c.rawText}, NULL, ${c.validUntil}::timestamptz,
        'texto_da_pagina', 'informado pelo dono', 'verificado', 'cadastrado_pelo_dono', ${nowIso}::timestamptz, ${nowIso}::timestamptz, ${nowIso}::timestamptz,
        ${nowIso}::timestamptz, ${CAMPAIGN_VERIFIED_BY}, ${c.dedupHash})
      ON CONFLICT (network_slug, dedup_hash) DO NOTHING
      RETURNING id::text AS id`)) as unknown as { id: string }[];
    if (!ins[0]) throw new Error('corrida_no_cadastro');
    id = ins[0].id;
    created = true;
  }
  await db.execute(sql`
    INSERT INTO coupon_reads (coupon_id, read_at, source_url, state_seen, evidence_hash, page_price_cents, state_after)
    VALUES (${id}::uuid, ${nowIso}::timestamptz, ${c.sourceUrl}, 'visto', ${createHash('sha256').update(c.rawText).digest('hex')}, NULL, 'verificado')`);
  return { id, created };
}

/** Botao "Confirmar de novo": o dono viu que o codigo ainda vale. So renova se a validade cadastrada ainda esta no futuro. */
export async function reconfirmCampaignCoupon(id: string, now: Date = new Date()): Promise<boolean> {
  const nowIso = now.toISOString();
  const r = (await db.execute<{ id: string; source_url: string }>(sql`
    UPDATE coupon_items SET state = 'verificado', state_reason = 'confirmado_pelo_dono', last_seen_at = ${nowIso}::timestamptz,
      verified_at = ${nowIso}::timestamptz, verified_by = ${CAMPAIGN_VERIFIED_BY}, updated_at = now()
    WHERE id = ${id}::uuid AND source_kind = ${CAMPAIGN_SOURCE_KIND} AND valid_until > ${nowIso}::timestamptz AND state IN ('verificado', 'nao_verificado')
    RETURNING id::text AS id, source_url`)) as unknown as { id: string; source_url: string }[];
  if (!r[0]) return false;
  await db.execute(sql`
    INSERT INTO coupon_reads (coupon_id, read_at, source_url, state_seen, evidence_hash, page_price_cents, state_after)
    VALUES (${id}::uuid, ${nowIso}::timestamptz, ${r[0].source_url}, 'visto', ${createHash('sha256').update(`reconfirmado|${id}|${nowIso}`).digest('hex')}, NULL, 'verificado')`);
  return true;
}

/** Botao "Encerrar": o codigo sai de toda mensagem na hora (estado vencido). Historico fica. */
export async function endCampaignCoupon(id: string, now: Date = new Date()): Promise<boolean> {
  const nowIso = now.toISOString();
  const r = (await db.execute<{ source_url: string }>(sql`
    UPDATE coupon_items SET state = 'vencido', state_reason = 'encerrado_pelo_dono', verified_at = NULL, updated_at = now()
    WHERE id = ${id}::uuid AND source_kind = ${CAMPAIGN_SOURCE_KIND} AND state IN ('verificado', 'nao_verificado')
    RETURNING source_url`)) as unknown as { source_url: string }[];
  if (!r[0]) return false;
  await db.execute(sql`
    INSERT INTO coupon_reads (coupon_id, read_at, source_url, state_seen, evidence_hash, page_price_cents, state_after)
    VALUES (${id}::uuid, ${nowIso}::timestamptz, ${r[0].source_url}, 'ausente', ${createHash('sha256').update(`encerrado|${id}|${nowIso}`).digest('hex')}, NULL, 'vencido')`);
  return true;
}

/** Lista para a tela do admin: ativos (nao vencidos, nao encerrados) e os ultimos encerrados/vencidos. */
export async function listCampaignCoupons(limit = 100): Promise<StoredCoupon[]> {
  try {
    const rows = (await db.execute<Row>(sql`
      SELECT ${SELECT_COLS} FROM coupon_items WHERE source_kind = ${CAMPAIGN_SOURCE_KIND}
      ORDER BY (state = 'verificado' AND valid_until > now()) DESC, valid_until DESC LIMIT ${Math.min(Math.max(1, limit), 300)}`)) as unknown as Row[];
    return rows.map(mapRow);
  } catch (e) {
    if (isMissingCouponTable(e)) return [];
    throw e;
  }
}

/**
 * Codigos de campanha que PODEM entrar numa mensagem agora, para a rede: cadastrados pelo dono, verificados, prazo futuro e
 * confirmados nas ultimas 24 h. Vencido nunca volta. Sem a tabela, devolve [] (a mensagem sai sem cupom).
 */
export async function findCampaignCoupons(networkSlug: CouponNetwork, now: Date = new Date()): Promise<StoredCoupon[]> {
  const nowIso = now.toISOString();
  let rows: Row[];
  try {
    rows = (await db.execute<Row>(sql`
      SELECT ${SELECT_COLS} FROM coupon_items
      WHERE network_slug = ${networkSlug} AND source_kind = ${CAMPAIGN_SOURCE_KIND} AND state = 'verificado'
        AND valid_until > ${nowIso}::timestamptz AND code IS NOT NULL
      ORDER BY verified_at DESC LIMIT 100`)) as unknown as Row[];
  } catch (e) {
    if (isMissingCouponTable(e)) return [];
    throw e;
  }
  return rows.map(mapRow).filter((c) => isCampaignUsable(c, now));
}

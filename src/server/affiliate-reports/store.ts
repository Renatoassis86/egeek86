import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers } from '@/db/schema';
import type { ImportSummary, NormalizedConversion, RejectedRow } from './types';

/**
 * Upsert idempotente em affiliate_conversions (migration 0021 PENDENTE, ver
 * drizzle/migrations/0021_affiliate_conversions.PENDING.sql). Reimportar o mesmo
 * relatório atualiza status/valores; nunca duplica (UNIQUE source+external_id).
 * Atribuição: só quando o dado traz o item e ele casa com affiliate_offers.external_ref.
 * Sem item reconhecido a conversão fica com offer_id/master_product_id NULL.
 */

const CHUNK = 200;

interface Attribution {
  offerId: string | null;
  masterProductId: string | null;
}

async function resolveAttributions(refs: string[]): Promise<Map<string, Attribution>> {
  const map = new Map<string, Attribution>();
  if (!refs.length) return map;
  const found = await db
    .select({ id: affiliateOffers.id, ref: affiliateOffers.externalRef, mp: affiliateOffers.masterProductId })
    .from(affiliateOffers)
    .where(inArray(affiliateOffers.externalRef, refs));
  const grouped = new Map<string, { ids: Set<string>; mps: Set<string> }>();
  for (const r of found) {
    if (!r.ref) continue;
    const g = grouped.get(r.ref) ?? { ids: new Set(), mps: new Set() };
    g.ids.add(r.id);
    g.mps.add(r.mp);
    grouped.set(r.ref, g);
  }
  // Ambíguo (mesmo ref em várias ofertas): oferta fica NULL; produto só se todas apontam ao mesmo.
  for (const [ref, g] of grouped) {
    map.set(ref, {
      offerId: g.ids.size === 1 ? [...g.ids][0] : null,
      masterProductId: g.mps.size === 1 ? [...g.mps][0] : null,
    });
  }
  return map;
}

export async function upsertConversions(
  rows: NormalizedConversion[],
  ctx: { batch: string; rejected?: RejectedRow[]; received?: number }
): Promise<ImportSummary> {
  const source = rows[0]?.source ?? 'ml_csv';
  const refs = [...new Set(rows.map((r) => r.itemRef).filter((x): x is string => !!x))];
  const attrib = await resolveAttributions(refs);

  let inserted = 0;
  let updated = 0;
  let attributed = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r) => {
      const a = r.itemRef ? attrib.get(r.itemRef) : undefined;
      if (a?.masterProductId) attributed++;
      const how = a?.masterProductId ? 'item_ref' : 'none';
      return sql`(${r.source}, ${r.networkSlug}, ${r.externalId}, ${r.orderId}, ${r.orderStatus}, ${r.rawStatus},
        ${r.clickAt ? r.clickAt.toISOString() : null}::timestamptz, ${r.purchaseAt ? r.purchaseAt.toISOString() : null}::timestamptz,
        ${r.itemRef}, ${r.itemName}, ${r.quantity}, ${r.itemPriceCents}, ${r.commissionCents}, ${r.netCommissionCents}, ${r.refundCents},
        ${r.subId}, ${r.attributionType}, ${a?.offerId ?? null}::uuid, ${a?.masterProductId ?? null}::uuid, ${how},
        ${ctx.batch}, ${JSON.stringify(r.raw)}::jsonb)`;
    });
    const res = await db.execute<{ inserted: boolean }>(sql`
      INSERT INTO affiliate_conversions (
        source, network_slug, external_id, order_id, order_status, raw_status,
        click_at, purchase_at,
        item_ref, item_name, quantity, item_price_cents, commission_cents, net_commission_cents, refund_cents,
        sub_id, attribution_type, offer_id, master_product_id, attribution_method,
        import_batch, raw
      ) VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (source, external_id) DO UPDATE SET
        order_status = EXCLUDED.order_status,
        raw_status = EXCLUDED.raw_status,
        click_at = COALESCE(EXCLUDED.click_at, affiliate_conversions.click_at),
        purchase_at = COALESCE(EXCLUDED.purchase_at, affiliate_conversions.purchase_at),
        quantity = COALESCE(EXCLUDED.quantity, affiliate_conversions.quantity),
        item_price_cents = COALESCE(EXCLUDED.item_price_cents, affiliate_conversions.item_price_cents),
        commission_cents = COALESCE(EXCLUDED.commission_cents, affiliate_conversions.commission_cents),
        net_commission_cents = COALESCE(EXCLUDED.net_commission_cents, affiliate_conversions.net_commission_cents),
        refund_cents = COALESCE(EXCLUDED.refund_cents, affiliate_conversions.refund_cents),
        offer_id = COALESCE(EXCLUDED.offer_id, affiliate_conversions.offer_id),
        master_product_id = COALESCE(EXCLUDED.master_product_id, affiliate_conversions.master_product_id),
        attribution_method = CASE WHEN EXCLUDED.master_product_id IS NOT NULL THEN EXCLUDED.attribution_method
                                  ELSE affiliate_conversions.attribution_method END,
        import_batch = EXCLUDED.import_batch,
        raw = EXCLUDED.raw,
        updated_at = now()
      RETURNING (xmax = 0) AS inserted
    `);
    for (const r of res) r.inserted ? inserted++ : updated++;
  }

  return {
    source,
    batch: ctx.batch,
    received: ctx.received ?? rows.length,
    valid: rows.length,
    rejected: ctx.rejected ?? [],
    inserted,
    updated,
    attributedToOffer: attributed,
    unattributed: rows.length - attributed,
  };
}

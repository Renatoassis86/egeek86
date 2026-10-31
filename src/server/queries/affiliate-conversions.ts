import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/** Leitura de affiliate_conversions (migration 0021 pendente: falha até ser aplicada). */

export interface ConversionSummaryRow {
  networkSlug: string;
  orderStatus: string;
  conversions: number;
  commissionCents: number;
  attributedConversions: number;
}

/** Conversões por rede e status no período (data da compra). Comissão pode ser estimada enquanto 'pending'. */
export async function getConversionSummary(from: Date, to: Date): Promise<ConversionSummaryRow[]> {
  const rows = await db.execute<{
    network_slug: string;
    order_status: string;
    conversions: number;
    commission_cents: string | null;
    attributed: number;
  }>(sql`
    SELECT network_slug, order_status,
      COUNT(*)::int AS conversions,
      COALESCE(SUM(commission_cents), 0)::bigint AS commission_cents,
      COUNT(*) FILTER (WHERE master_product_id IS NOT NULL)::int AS attributed
    FROM affiliate_conversions
    WHERE COALESCE(purchase_at, click_at) >= ${from.toISOString()}::timestamptz
      AND COALESCE(purchase_at, click_at) < ${to.toISOString()}::timestamptz
    GROUP BY network_slug, order_status
    ORDER BY network_slug, order_status
  `);
  return rows.map((r) => ({
    networkSlug: r.network_slug,
    orderStatus: r.order_status,
    conversions: Number(r.conversions),
    commissionCents: Number(r.commission_cents ?? 0),
    attributedConversions: Number(r.attributed),
  }));
}

export interface ConversionByProductRow {
  masterProductId: string;
  productName: string;
  conversions: number;
  commissionCents: number;
}

/** Só conversões ATRIBUÍDAS a produto (as sem item ficam fora, por regra). Exclui canceladas/reembolsadas. */
export async function getConversionsByProduct(from: Date, to: Date, limit = 50): Promise<ConversionByProductRow[]> {
  const rows = await db.execute<{ id: string; name: string; conversions: number; commission_cents: string | null }>(sql`
    SELECT mp.id, mp.name, COUNT(*)::int AS conversions, COALESCE(SUM(c.commission_cents), 0)::bigint AS commission_cents
    FROM affiliate_conversions c
    JOIN master_products mp ON mp.id = c.master_product_id
    WHERE c.order_status NOT IN ('cancelled', 'refunded')
      AND COALESCE(c.purchase_at, c.click_at) >= ${from.toISOString()}::timestamptz
      AND COALESCE(c.purchase_at, c.click_at) < ${to.toISOString()}::timestamptz
    GROUP BY mp.id, mp.name
    ORDER BY conversions DESC, commission_cents DESC
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `);
  return rows.map((r) => ({
    masterProductId: r.id,
    productName: r.name,
    conversions: Number(r.conversions),
    commissionCents: Number(r.commission_cents ?? 0),
  }));
}

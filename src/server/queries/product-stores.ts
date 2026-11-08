import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicOffersCtes } from '@/server/queries/public-offers';
import { GAMES } from '@/lib/catalog/verticais';

/** Menor preço PÚBLICO por loja de um master_product, da loja mais barata para a mais cara. */
export interface ProductStoreRow {
  networkId: string;
  storeName: string;
  priceCents: number;
  offerSlug: string;
  offerCount: number;
  /** ISO da última verificação de preço. */
  checkedAt: string | null;
  /** true quando há URL http(s) para sair (o botão "Ir à loja" só aparece com ela). */
  hasOutbound: boolean;
}

interface Row extends Record<string, unknown> {
  network_id: string;
  store_name: string;
  price: string | number;
  slug: string;
  n: number;
  checked_at: string | Date | null;
  has_url: boolean;
}

export async function getProductStores(masterProductId: string): Promise<ProductStoreRow[]> {
  if (!/^[0-9a-f-]{36}$/i.test(masterProductId)) return [];
  const rows = await db.execute<Row>(sql`
    WITH ${publicOffersCtes(GAMES)}
    SELECT DISTINCT ON (o.network_id)
           o.network_id, n.name AS store_name, o.current_price_cents AS price, o.slug,
           COUNT(*) OVER (PARTITION BY o.network_id)::int AS n,
           o.last_checked_at AS checked_at,
           (o.affiliate_url ~* '^https?://') AS has_url
    FROM public_offers p
    INNER JOIN affiliate_offers o ON o.id = p.id
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE p.master_product_id = ${masterProductId}
    ORDER BY o.network_id, o.current_price_cents ASC, o.id
  `);
  return [...rows]
    .map((r) => ({
      networkId: String(r.network_id),
      storeName: String(r.store_name),
      priceCents: Number(r.price),
      offerSlug: String(r.slug),
      offerCount: Number(r.n),
      checkedAt: r.checked_at ? new Date(r.checked_at).toISOString() : null,
      hasOutbound: r.has_url === true,
    }))
    .sort((a, b) => a.priceCents - b.priceCents || a.storeName.localeCompare(b.storeName));
}

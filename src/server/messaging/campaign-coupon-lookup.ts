import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { findCampaignCoupons } from '@/server/coupons/campaign-store';
import { pickCampaignCoupon, campaignToCouponInfo } from '@/server/coupons/campaign-pick';
import type { CouponInfo } from '@/lib/messaging/group-messages';

/**
 * Codigo de CAMPANHA cadastrado pelo dono (ex.: TODOSITE1111) para uma oferta. Mesmo formato CouponInfo do coupon-lookup, mas
 * aqui `code` e o codigo DIGITAVEL. Devolve null (a mensagem sai sem cupom) se: a rede nao e ML/Shopee, nao ha codigo verificado
 * e dentro da validade, o escopo (site | categoria | loja) nao casa com a oferta ou a compra minima nao e alcancada.
 * Ligacao ao ciclo de envio: chamar junto de lookupVerifiedCoupon e escolher um dos dois (campanha tem prioridade quando existir:
 * e o codigo que o publico digita). Nao toca em coupon-lookup.ts.
 */
export async function lookupCampaignCoupon(offerId: string, now: Date = new Date()): Promise<CouponInfo | null> {
  const rows = await db.execute<{ net: string; net_name: string; vertical: string | null; price: string; nick: string | null; ext_seller: string | null; store: string | null }>(sql`
    SELECT n.slug AS net, n.name AS net_name, m.vertical AS vertical, o.current_price_cents::text AS price,
           s.nickname AS nick, s.external_seller_id AS ext_seller, o.store_name AS store
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.id = ${offerId}::uuid LIMIT 1`);
  const o = rows[0];
  if (!o || (o.net !== 'mercado-livre' && o.net !== 'shopee')) return null;
  const found = await findCampaignCoupons(o.net, now);
  if (!found.length) return null;
  const best = pickCampaignCoupon(found, {
    category: o.vertical ?? undefined,
    sellerCandidates: [o.nick, o.ext_seller, o.store].filter((x): x is string => !!x),
    priceCents: Number(o.price) || undefined,
  });
  return best ? campaignToCouponInfo(best, o.net_name) : null;
}

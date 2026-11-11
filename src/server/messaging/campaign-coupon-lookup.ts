import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { findCampaignCoupons } from '@/server/coupons/campaign-store';
import { rankCampaignCoupons } from '@/server/coupons/campaign-pick';
import { campaignToCouponInfo } from '@/server/coupons/campaign-pick';
import { evaluateAgulha, type AgulhaRule, type MissTrace } from '@/lib/coupons/agulha';
import type { CouponInfo } from '@/lib/messaging/group-messages';
import type { CouponRefMeta } from '@/lib/coupons/guardiao-model';

/**
 * Codigo de CAMPANHA cadastrado pelo dono (ex.: TODOSITE1111) para uma oferta. Mesmo formato CouponInfo do coupon-lookup, mas
 * aqui `code` e o codigo DIGITAVEL. Devolve null (a mensagem sai sem cupom) se: a rede nao e ML/Shopee/Amazon, nao ha codigo verificado
 * e dentro da validade, o escopo (site | categoria | loja) nao casa com a oferta, a compra minima nao e alcancada ou o cupom
 * reprova na agulha (frescor de 24 h do dono, validade com folga, preco final coerente com % e teto).
 * Ligacao ao ciclo de envio: chamar junto de lookupVerifiedCoupon e escolher um dos dois (campanha tem prioridade quando existir:
 * e o codigo que o publico digita). Nao toca em coupon-lookup.ts.
 */
export async function lookupCampaignCoupon(offerId: string, trace?: MissTrace, now: Date = new Date()): Promise<(CouponInfo & CouponRefMeta) | null> {
  const rows = await db.execute<{ net: string; net_name: string; vertical: string | null; price: string; nick: string | null; ext_seller: string | null; store: string | null }>(sql`
    SELECT n.slug AS net, n.name AS net_name, m.vertical AS vertical, o.current_price_cents::text AS price,
           s.nickname AS nick, s.external_seller_id AS ext_seller, o.store_name AS store
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.id = ${offerId}::uuid LIMIT 1`);
  const o = rows[0];
  if (!o) { trace?.('oferta_inexistente'); return null; }
  if (o.net !== 'mercado-livre' && o.net !== 'shopee' && o.net !== 'amazon') { trace?.('rede_sem_leitura_autorizada'); return null; }
  const found = await findCampaignCoupons(o.net, now);
  if (!found.length) { trace?.('sem_codigo_do_dono_ativo'); return null; }
  const ranked = rankCampaignCoupons(found, {
    category: o.vertical ?? undefined,
    sellerCandidates: [o.nick, o.ext_seller, o.store].filter((x): x is string => !!x),
    priceCents: Number(o.price) || undefined,
  });
  if (!ranked.length) { trace?.('codigo_do_dono_nao_casa_com_a_oferta'); return null; }
  let lastReason: string | null = null;
  for (const c of ranked) {
    const rule: AgulhaRule = {
      kind: c.kind, valueNum: c.valueNum, minOrderCents: c.minOrderCents, maxDiscountCents: c.maxDiscountCents, validUntil: c.validUntil,
      state: c.state, audience: c.audience, eligibleOnReadAccount: c.eligibleOnReadAccount, scopeKind: c.scopeKind, categorias: c.scope.categorias,
      conditionsRaw: c.conditionsRaw,
    };
    const verdict = evaluateAgulha({
      source: 'campanha', now, offer: { network: o.net, vertical: o.vertical, priceCents: Number(o.price) }, verifiedAt: c.verifiedAt, validUntil: c.validUntil, rule,
    });
    if (verdict.ok) return campaignToCouponInfo(c, o.net_name);
    lastReason = verdict.reason;
  }
  trace?.(lastReason ?? 'reprovou_agulha');
  return null;
}

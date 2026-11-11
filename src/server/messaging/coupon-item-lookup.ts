import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { CouponInfo } from '@/lib/messaging/group-messages';

/**
 * Cupom POR ANÚNCIO (dono, 2026-11-11): a aba logada lê a página do item e grava o "preço com cupom" (offer_coupon_reads). Vale 2 horas.
 * O que aparece na mensagem é exatamente o que a página mostrou: o preço com cupom e a campanha (regra do cupom lida na lista de
 * cupons, quando houver). Nada é inventado: sem leitura recente, sem cupom.
 */
const fmt = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function lookupItemCoupon(offerId: string): Promise<CouponInfo | null> {
  const rows = await db.execute<{
    price_with: number; price_seen: number | null; read_at: string | Date; campaign: string | null; status: string | null;
    kind: string | null; value_num: string | null; min_cents: string | null; cap_cents: string | null; valid_until: string | Date | null; cur: string;
  }>(sql`
    SELECT r.price_with_coupon_cents AS price_with, r.price_seen_cents AS price_seen, r.read_at, r.campaign_id AS campaign, r.status,
           c.kind, c.value_num::text AS value_num, c.min_order_cents::text AS min_cents, c.max_discount_cents::text AS cap_cents, c.valid_until,
           o.current_price_cents::text AS cur
    FROM offer_coupon_reads r
    JOIN affiliate_offers o ON o.id = r.offer_id AND o.status = 'active'
    LEFT JOIN LATERAL (
      SELECT ci.kind, ci.value_num, ci.min_order_cents, ci.max_discount_cents, ci.valid_until
      FROM coupon_items ci
      WHERE ci.network_slug = 'mercado-livre' AND r.campaign_id IS NOT NULL AND ci.conditions->>'campanha_id' = r.campaign_id
      ORDER BY ci.last_seen_at DESC LIMIT 1
    ) c ON true
    WHERE r.offer_id = ${offerId}::uuid AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '120 minutes'
    ORDER BY r.read_at DESC, r.price_with_coupon_cents ASC LIMIT 1`);
  const r = rows[0];
  if (!r) return null;
  const withCoupon = Number(r.price_with);
  const current = Number(r.cur);
  // O preço da oferta pode ter mudado depois da leitura: o cupom só vale se ainda ficar abaixo do preço de agora.
  if (!(withCoupon > 0) || withCoupon >= current) return null;
  if (r.valid_until && new Date(r.valid_until).getTime() <= Date.now()) return null;
  const parts: string[] = [];
  if (r.kind === 'percentual' && r.value_num) parts.push(`${Number(r.value_num)}% OFF`);
  else if (r.kind === 'valor_fixo' && r.value_num) parts.push(`R$ ${Number(r.value_num)} OFF`);
  if (r.min_cents) parts.push(`compra mínima ${fmt(Number(r.min_cents))}`);
  if (r.cap_cents) parts.push(`desconto até ${fmt(Number(r.cap_cents))}`);
  const rule = parts.length ? `${parts.join(', ')}. ` : '';
  return {
    code: `${fmt(withCoupon)} com cupom`,
    conditions: `${rule}Ative em Cupons no Mercado Livre antes de pagar. Preço lido na página do anúncio`,
    expiresAt: r.valid_until ? new Date(r.valid_until).toISOString() : null,
    verifiedAt: new Date(r.read_at).toISOString(),
  };
}

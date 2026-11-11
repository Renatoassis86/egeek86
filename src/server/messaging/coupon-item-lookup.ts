import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { CouponInfo } from '@/lib/messaging/group-messages';
import type { CouponRefMeta } from '@/lib/coupons/guardiao-model';
import { AGULHA, evaluateAgulha, ITEM_READ_NETWORKS, type AgulhaRule, type MissTrace } from '@/lib/coupons/agulha';
import { verticaisDaCategoria } from '@/lib/coupons/categoria-vertical';
import { agulhaRuleFromLabel } from '@/lib/coupons/page-read';

/**
 * Cupom POR ANÚNCIO (dono, 2026-11-11): a aba logada lê a página do item e grava o "preço com cupom" (offer_coupon_reads). Vale 2 horas.
 * O que aparece na mensagem é exatamente o que a página mostrou: o preço com cupom e a campanha (regra do cupom lida na lista de
 * cupons, quando houver). Nada é inventado: sem leitura recente, sem cupom.
 *
 * CUPOM NA AGULHA (src/lib/coupons/agulha.ts): toda leitura candidata passa por frescor (120 min), "seguir a loja", condição contra a
 * oferta (compra mínima, estado, público), preço lido sobre o preço de agora e coerência do cálculo com % e teto (quando a regra foi
 * lida). Falhou = descartada com motivo (`trace`); a mensagem de preço nunca é bloqueada.
 */
const fmt = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ReadRow = {
  pw: number | null; ps: number | null; read_at: string | Date; campaign: string | null; label: string | null; status: string | null;
  cur: string; ostatus: string; net: string; vertical: string | null;
  c_kind: string | null; c_value: string | null; c_min: string | null; c_cap: string | null; c_valid: string | Date | null; c_state: string | null;
  c_aud: string | null; c_elig: boolean | null; c_scope: string | null; c_cats: string | null; c_raw: string | null; c_title: string | null;
};

export async function lookupItemCoupon(offerId: string, trace?: MissTrace, now: Date = new Date()): Promise<(CouponInfo & CouponRefMeta) | null> {
  const rows = (await db.execute<ReadRow>(sql`
    SELECT r.price_with_coupon_cents AS pw, r.price_seen_cents AS ps, r.read_at, r.campaign_id AS campaign, r.label, r.status,
           o.current_price_cents::text AS cur, o.status::text AS ostatus, nn.slug AS net, o.vertical,
           c.kind AS c_kind, c.value_num::text AS c_value, c.min_order_cents::text AS c_min, c.max_discount_cents::text AS c_cap, c.valid_until AS c_valid,
           c.state AS c_state, c.audience AS c_aud, c.eligible_on_read_account AS c_elig, c.scope_kind AS c_scope, c.scope->'categorias'->>0 AS c_cats, c.conditions_raw AS c_raw, c.title AS c_title
    FROM offer_coupon_reads r
    JOIN affiliate_offers o ON o.id = r.offer_id
    JOIN affiliate_networks nn ON nn.id = o.network_id
    LEFT JOIN LATERAL (
      SELECT ci.kind, ci.value_num, ci.min_order_cents, ci.max_discount_cents, ci.valid_until, ci.state, ci.audience, ci.eligible_on_read_account,
             ci.scope_kind, ci.scope, ci.conditions_raw, split_part(ci.raw_text, ' | ', 1) AS title
      FROM coupon_items ci
      WHERE ci.network_slug = 'mercado-livre' AND r.campaign_id IS NOT NULL AND ci.conditions->>'campanha_id' = r.campaign_id
      ORDER BY ci.last_seen_at DESC LIMIT 1
    ) c ON true
    WHERE r.offer_id = ${offerId}::uuid AND r.read_at > ${now.toISOString()}::timestamptz - make_interval(mins => ${AGULHA.ITEM_FRESH_MIN}::int)
    ORDER BY r.read_at DESC, r.price_with_coupon_cents ASC NULLS LAST LIMIT 30`)) as unknown as ReadRow[];

  const first = rows[0];
  if (!first) { trace?.('sem_leitura'); return null; }
  if (first.ostatus !== 'active') { trace?.('oferta_inativa'); return null; }
  if (!(ITEM_READ_NETWORKS as readonly string[]).includes(first.net)) { trace?.('rede_sem_leitura_autorizada'); return null; }

  // Leitura mais nova SEM cupom: a página deixou de mostrar, então nenhuma leitura positiva anterior a ela vale mais.
  const negAt = rows.filter((r) => r.pw == null).map((r) => new Date(r.read_at).getTime()).reduce((m, t) => Math.max(m, t), -Infinity);
  const positives = rows.filter((r) => r.pw != null && new Date(r.read_at).getTime() > negAt);
  if (!positives.length) { trace?.(rows.some((r) => r.pw != null) ? 'sumiu_na_releitura' : 'lida_sem_cupom'); return null; }
  // Mesma rodada de leitura (até 60 s da mais nova): vale o menor preço com cupom, como a página mostra.
  const newestPos = new Date(positives[0].read_at).getTime();
  const cycle = positives.filter((r) => newestPos - new Date(r.read_at).getTime() <= 60_000).sort((a, b) => Number(a.pw) - Number(b.pw));

  const current = Number(first.cur);
  let lastReason: string | null = null;
  for (const r of cycle) {
    // ML: regra da lista de cupons (campanha lida no anúncio). Amazon/Shopee: a regra escrita no próprio selo da página (sem lista de cupons).
    const rule: AgulhaRule | null = r.net !== 'mercado-livre' ? (r.label ? agulhaRuleFromLabel(r.label) : null) : r.c_kind
      ? {
          kind: r.c_kind as AgulhaRule['kind'], valueNum: r.c_value != null ? Number(r.c_value) : null,
          minOrderCents: r.c_min != null ? Number(r.c_min) : null, maxDiscountCents: r.c_cap != null ? Number(r.c_cap) : null,
          validUntil: r.c_valid ? new Date(r.c_valid).toISOString() : null, state: r.c_state ?? undefined, audience: r.c_aud ?? undefined,
          eligibleOnReadAccount: r.c_elig, scopeKind: (r.c_scope ?? undefined) as AgulhaRule['scopeKind'], categorias: r.c_cats ? [r.c_cats] : undefined,
          conditionsRaw: r.c_raw,
        }
      : null;
    const readIso = new Date(r.read_at).toISOString();
    const verdict = evaluateAgulha({
      source: 'item', now, offer: { network: r.net, vertical: r.vertical, priceCents: current }, verifiedAt: readIso,
      priceWithCents: r.pw, priceSeenCents: r.ps, label: r.label, rule, categoriaVerticais: rule?.categorias?.flatMap((c) => verticaisDaCategoria(c)),
    });
    if (!verdict.ok) { lastReason = verdict.reason; continue; }
    const parts: string[] = [];
    // Nome do cupom: o título que a loja deu à campanha (lista de cupons). Sem título lido, o nome é o selo da regra; sem regra, "Cupom do anúncio".
    const title = (r.c_title ?? '').trim();
    let name = title;
    if (!name && rule?.kind === 'percentual' && rule.valueNum) name = `${rule.valueNum}% OFF`;
    if (!name && rule?.kind === 'valor_fixo' && rule.valueNum) name = `R$ ${rule.valueNum} OFF`;
    if (!name) name = 'Cupom do anúncio';
    // Quanto ele dá: diferença real entre o preço da oferta e o preço com cupom lido na página.
    const off = current - Number(r.pw);
    const pct = current > 0 ? Math.round((off / current) * 1000) / 10 : 0;
    const dlinha = `Desconto de ${fmt(off)} (${String(pct).replace('.', ',')}%): de ${fmt(current)} por ${fmt(Number(r.pw))}. `;
    if (rule?.minOrderCents) parts.push(`Compra mínima ${fmt(rule.minOrderCents)}`);
    if (rule?.maxDiscountCents) parts.push(`desconto máximo ${fmt(rule.maxDiscountCents)}`);
    const ruleText = `${dlinha}${parts.length ? `${parts.join(', ')}. ` : ''}`;
    // Regra não lida na lista: o preço é o que a página mostrou, e a mensagem diz isso sem inventar compra mínima ou teto.
    const tail = verdict.ruleKnown ? 'Preço lido na página do anúncio' : 'Preço lido na página do anúncio; regra completa na tela do cupom';
    const ativar = r.net === 'amazon' ? 'Marque o cupom na página do produto antes de pagar.' : r.net === 'shopee' ? 'Aplique o voucher no carrinho antes de pagar.' : 'Ative em Cupons no Mercado Livre antes de pagar.';
    return {
      code: name,
      conditions: `${ruleText}${ativar} ${tail}`,
      expiresAt: rule?.validUntil ?? null,
      verifiedAt: readIso,
      couponRef: offerId,
      annKind: 'anuncio',
    };
  }
  trace?.(lastReason ?? 'reprovou_agulha');
  return null;
}

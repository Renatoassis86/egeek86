import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { findVerifiedCoupons } from '@/server/coupons/store';
import type { CouponInfo } from '@/lib/messaging/group-messages';
import type { CouponRefMeta } from '@/lib/coupons/guardiao-model';
import type { StoredCoupon } from '@/server/coupons/types';
import { evaluateAgulha, type AgulhaRule, type MissTrace } from '@/lib/coupons/agulha';
import { categoriaCasaComVertical, verticaisDaCategoria } from '@/lib/coupons/categoria-vertical';

/**
 * Liga o sistema de cupons (verificados em até 2 h, prazo lido no futuro, escopo que casa com a oferta) ao motor de mensagens.
 * Cupons do Mercado Livre NÃO têm código de digitar: são ativados na página de cupons. Por isso o "código" mostrado é o RÓTULO
 * do cupom montado só com o que foi lido (valor, unidade e categoria) e a condição diz onde ativar. Nada é inventado: sem cupom
 * verificado que case com a oferta, devolve null e a mensagem sai sem cupom.
 */
function label(c: StoredCoupon): string {
  const v = c.valueNum;
  const base =
    c.kind === 'frete' ? 'Frete grátis' :
    c.kind === 'cashback' ? (v != null ? `${v}${c.valueUnit === 'percentual' ? '%' : ' reais'} de cashback` : 'Cashback') :
    c.kind === 'percentual' && v != null ? `${v}% OFF` :
    v != null ? `R$ ${v} OFF` : 'Cupom';
  const cat = c.scope.categorias?.[0];
  return cat ? `${base} em ${cat}` : base;
}

function score(c: StoredCoupon): number {
  // Maior desconto em valor absoluto primeiro; percentual pesa mais que R$ pequeno.
  if (c.kind === 'percentual' && c.valueNum) return c.valueNum * 10;
  if (c.kind === 'valor_fixo' && c.valueNum) return c.valueNum;
  return 0;
}

export async function lookupVerifiedCoupon(offerId: string, trace?: MissTrace, now: Date = new Date()): Promise<(CouponInfo & CouponRefMeta) | null> {
  const rows = await db.execute<{ net: string; mid: string; price: string; ext: string | null; item: string | null; vertical: string | null; nick: string | null; ext_seller: string | null; url: string }>(sql`
    SELECT n.slug AS net, o.master_product_id::text AS mid, o.current_price_cents::text AS price, o.external_ref AS ext, o.external_item_id AS item, o.vertical AS vertical,
           s.nickname AS nick, s.external_seller_id AS ext_seller, o.affiliate_url AS url
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.id = ${offerId}::uuid LIMIT 1`);
  const o = rows[0];
  if (!o) { trace?.('oferta_inexistente'); return null; }
  if (o.net !== 'mercado-livre' && o.net !== 'shopee') { trace?.('rede_sem_leitura_autorizada'); return null; }
  const found = await findVerifiedCoupons({
    networkSlug: o.net,
    offerId,
    masterProductId: o.mid,
    // O id do ANÚNCIO (MLB do item) é o que as listas de cupom citam; external_ref é o id do catálogo (outro espaço de ids).
    externalItemId: o.item ?? o.ext ?? undefined,
    sellerId: o.nick ?? o.ext_seller ?? undefined,
    priceCents: Number(o.price) || undefined,
    maxAgeMinutes: 120,
    limit: 50,
    now,
    // Cupom de categoria cujo rótulo declara o departamento da oferta entra como CANDIDATO; a agulha decide (produtos selecionados => não).
    extraScopeMatch: (c) => c.scopeKind === 'categoria' && categoriaCasaComVertical(c.scope.categorias?.[0], o.vertical),
  });
  const ranked = found.filter((c) => c.kind !== 'cashback').sort((a, b) => score(b) - score(a));
  if (!ranked.length) { trace?.('sem_cupom_de_loja_para_a_oferta'); return null; }
  // Agulha: o melhor cupom que PASSA em frescor, validade, condição e preço final. Reprovado => tenta o próximo; nenhum => sem cupom.
  let lastReason: string | null = null;
  for (const best of ranked) {
    if (!best.verifiedAt) { lastReason = 'sem_leitura'; continue; }
    const rule: AgulhaRule = {
      kind: best.kind, valueNum: best.valueNum, minOrderCents: best.minOrderCents, maxDiscountCents: best.maxDiscountCents, validUntil: best.validUntil,
      state: best.state, audience: best.audience, eligibleOnReadAccount: best.eligibleOnReadAccount, scopeKind: best.scopeKind,
      categorias: best.scope.categorias, conditionsRaw: best.conditionsRaw,
    };
    const verdict = evaluateAgulha({
      source: 'loja_categoria', now, offer: { network: o.net, vertical: o.vertical, priceCents: Number(o.price) }, verifiedAt: best.verifiedAt,
      validUntil: best.validUntil, rule, categoriaVerticais: (best.scope.categorias ?? []).flatMap((c) => verticaisDaCategoria(c)),
    });
    if (!verdict.ok) { lastReason = verdict.reason; continue; }
    const min = best.minOrderCents ? ` Compra mínima R$ ${(best.minOrderCents / 100).toLocaleString('pt-BR')}.` : '';
    const cap = best.maxDiscountCents ? ` Limite de desconto R$ ${(best.maxDiscountCents / 100).toLocaleString('pt-BR')}.` : '';
    const where = o.net === 'mercado-livre' ? 'ative em Cupons no Mercado Livre' : 'resgate em Cupons na Shopee';
    return {
      code: label(best),
      conditions: `${where}.${min}${cap}`.replace(/\s+/g, ' ').trim(),
      expiresAt: best.validUntil,
      verifiedAt: best.verifiedAt,
      couponRef: best.id,
      annKind: best.scopeKind === 'categoria' ? 'categoria' : 'loja',
    };
  }
  trace?.(lastReason ?? 'reprovou_agulha');
  return null;
}

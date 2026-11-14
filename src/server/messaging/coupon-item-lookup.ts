import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { CouponInfo } from '@/lib/messaging/group-messages';
import type { CouponRefMeta } from '@/lib/coupons/guardiao-model';
import { AGULHA, evaluateAgulha, ITEM_READ_NETWORKS, type AgulhaRule, type MissTrace } from '@/lib/coupons/agulha';
import { verticaisDaCategoria } from '@/lib/coupons/categoria-vertical';
import { agulhaRuleFromLabel } from '@/lib/coupons/page-read';
import { resolveCouponUse, stepsText } from '@/lib/coupons/coupon-name';
import { promoPrimeMensagemLigada } from '@/lib/coupons/amazon-promocoes';

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
  c_aud: string | null; c_elig: boolean | null; c_scope: string | null; c_cats: string | null; c_raw: string | null; c_title: string | null; c_where: string | null; c_ativ: string | null;
  p_name: string | null; p_code: string | null;
  src: string | null; pc_valid: string | Date | null; pc_state: string | null; pc_title: string | null; pc_app: string | null; pc_termos: string | null;
  pc_aud: string | null; pc_prime: boolean | null;
};

/**
 * Detalhe estruturado do cupom do anúncio que passou na agulha (alimenta a mensagem 'Cupom ativo'). Tudo é o que a página mostrou:
 * o preço com cupom vem da leitura, o desconto é a diferença real; mínimo e teto só existem quando a lista de cupons os trouxe.
 */
export interface ItemCouponDetail {
  net: string;
  offerPriceCents: number;
  finalCents: number;
  offCents: number;
  pct: number;
  name: string;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  ruleKnown: boolean;
  activation: string;
  /** Nome do cupom (já em `name`) é da loja? false = sem nome: `name` é o rótulo do valor e `howTo` explica como usar. */
  named: boolean;
  /** Código digitável lido (tipo a), se houver. */
  code: string | null;
  /** Passo a passo curto da loja. */
  howTo: string[];
  readAt: string;
  priceSeenCents: number | null;
  validUntil: string | null;
  /** Promoção Prime NA FINALIZAÇÃO (dono, 2026-11-14): a mensagem diz "Exclusivo Prime" e que o desconto entra no fim do pedido. */
  exclusivePrime?: boolean;
}

export async function lookupItemCoupon(offerId: string, trace?: MissTrace, now: Date = new Date()): Promise<(CouponInfo & CouponRefMeta) | null> {
  return (await lookupItemCouponDetail(offerId, trace, now))?.info ?? null;
}

export async function lookupItemCouponDetail(offerId: string, trace?: MissTrace, now: Date = new Date()): Promise<{ info: CouponInfo & CouponRefMeta; detail: ItemCouponDetail } | null> {
  const rows = (await db.execute<ReadRow>(sql`
    SELECT r.price_with_coupon_cents AS pw, r.price_seen_cents AS ps, r.read_at, r.campaign_id AS campaign, r.label, r.status,
           o.current_price_cents::text AS cur, o.status::text AS ostatus, nn.slug AS net, o.vertical,
           c.kind AS c_kind, c.value_num::text AS c_value, c.min_order_cents::text AS c_min, c.max_discount_cents::text AS c_cap, c.valid_until AS c_valid,
           c.state AS c_state, c.audience AS c_aud, c.eligible_on_read_account AS c_elig, c.scope_kind AS c_scope, c.scope->'categorias'->>0 AS c_cats, c.conditions_raw AS c_raw, c.title AS c_title, c.onde AS c_where, c.ativ AS c_ativ,
           to_jsonb(r)->>'coupon_name' AS p_name, to_jsonb(r)->>'coupon_code' AS p_code,
           r.source AS src, pc.valid_until AS pc_valid, pc.state AS pc_state, pc.title AS pc_title, pc.so_app AS pc_app, pc.termos AS pc_termos, pc.aud AS pc_aud, pc.prime AS pc_prime
    FROM offer_coupon_reads r
    JOIN affiliate_offers o ON o.id = r.offer_id
    JOIN affiliate_networks nn ON nn.id = o.network_id
    LEFT JOIN LATERAL (
      SELECT ci.kind, ci.value_num, ci.min_order_cents, ci.max_discount_cents, ci.valid_until, ci.state, ci.audience, ci.eligible_on_read_account,
             ci.scope_kind, ci.scope, ci.conditions_raw, split_part(ci.raw_text, ' | ', 1) AS title, split_part(ci.raw_text, ' | ', 2) AS onde, ci.conditions->>'ativacao' AS ativ
      FROM coupon_items ci
      WHERE ci.network_slug = 'mercado-livre' AND r.campaign_id IS NOT NULL AND ci.conditions->>'campanha_id' = r.campaign_id
      ORDER BY ci.last_seen_at DESC LIMIT 1
    ) c ON true
    -- Promoção da Amazon (amazon-promocoes): validade, estado (2 leituras) e título vêm do cupom gravado em coupon_items (escopo produto da oferta).
    LEFT JOIN LATERAL (
      SELECT ci.valid_until, ci.state, split_part(ci.raw_text, ' | ', 1) AS title, ci.conditions->>'so_app' AS so_app, ci.conditions->>'termos' AS termos,
             ci.audience AS aud, (ci.conditions->>'prime_checkout' = 'true') AS prime
      FROM coupon_items ci
      WHERE r.source = 'amazon-promocoes' AND ci.network_slug = 'amazon' AND ci.conditions->>'promo_id' = r.campaign_id
        AND ci.scope->'offer_ids' @> to_jsonb(r.offer_id::text)
      ORDER BY ci.last_seen_at DESC LIMIT 1
    ) pc ON true
    WHERE r.offer_id = ${offerId}::uuid AND r.read_at > ${now.toISOString()}::timestamptz - make_interval(mins => ${AGULHA.ITEM_FRESH_MIN}::int)
    ORDER BY r.read_at DESC, r.price_with_coupon_cents ASC NULLS LAST LIMIT 30`)) as unknown as ReadRow[];

  const first = rows[0];
  if (!first) { trace?.('sem_leitura'); return null; }
  if (first.ostatus !== 'active') { trace?.('oferta_inativa'); return null; }
  if (!(ITEM_READ_NETWORKS as readonly string[]).includes(first.net)) { trace?.('rede_sem_leitura_autorizada'); return null; }

  // Leitura mais nova SEM cupom: a página deixou de mostrar, então nenhuma leitura positiva anterior a ela vale mais.
  // Promoção da Amazon (amazon-promocoes) e página do item são fontes DIFERENTES: o item sem selo de cupom não apaga a promoção (que não aparece no selo do item)
  // e vice-versa; cada fonte só é negada pela própria leitura "sem cupom".
  const isPromoRow = (r: ReadRow) => r.src === 'amazon-promocoes';
  const negAtOf = (promo: boolean) => rows.filter((r) => r.pw == null && isPromoRow(r) === promo).map((r) => new Date(r.read_at).getTime()).reduce((m, t) => Math.max(m, t), -Infinity);
  const negAt = { promo: negAtOf(true), item: negAtOf(false) };
  const positives = rows.filter((r) => r.pw != null && new Date(r.read_at).getTime() > (isPromoRow(r) ? negAt.promo : negAt.item));
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
    const isPromo = r.src === 'amazon-promocoes';
    // Promoção da Amazon: só vale com o cupom da promoção VERIFICADO (2 leituras separadas por 30 min) e com a validade LIDA na página; sem isso, nada sai.
    if (isPromo) {
      if (r.pc_state !== 'verificado') { lastReason = 'estado_nao_verificado'; continue; }
      if (!r.pc_valid) { lastReason = 'validade_nao_lida'; continue; }
      if (!rule) { lastReason = 'tipo_sem_preco_final'; continue; }
    }
    const rulePromo: AgulhaRule | null = isPromo && rule ? { ...rule, validUntil: new Date(r.pc_valid as string | Date).toISOString() } : rule;
    // Promoção Prime na finalização: só com GROUP_PROMO_PRIME=on E o cupom gravado como `assinantes` + prime_checkout pela leitura da promoção (nunca pelo rótulo).
    const primeOk = isPromo && promoPrimeMensagemLigada() && r.pc_prime === true && r.pc_aud === 'assinantes';
    const readIso = new Date(r.read_at).toISOString();
    const verdict = evaluateAgulha({
      source: 'item', now, offer: { network: r.net, vertical: r.vertical, priceCents: current }, verifiedAt: readIso,
      priceWithCents: r.pw, priceSeenCents: r.ps, label: r.label, rule: rulePromo, categoriaVerticais: rulePromo?.categorias?.flatMap((c) => verticaisDaCategoria(c)),
      permitirPrimeNaFinalizacao: primeOk,
    });
    if (!verdict.ok) { lastReason = verdict.reason; continue; }
    const parts: string[] = [];
    // Quanto ele dá: diferença real entre o preço da oferta e o preço com cupom lido na página.
    const off = current - Number(r.pw);
    const pct = current > 0 ? Math.round((off / current) * 1000) / 10 : 0;
    // NOME DO CUPOM (ordem do dono, 2026-11-12): prioridade ao nome lido na página, depois ao título da campanha na lista de cupons (com o escopo),
    // depois ao código digitável. Sem nome nenhum (cupom de clicar e ativar): rótulo do valor lido + passo a passo da loja. Nunca "Cupom do anúncio".
    // A barreira de termos proíbe '% OFF': o texto da loja é reescrito ('25% de desconto') dentro de resolveCouponUse.
    const use = resolveCouponUse({
      net: r.net, code: r.p_code, pageName: r.p_name, listTitle: isPromo ? r.pc_title : r.c_title, listScope: r.c_where, ativacao: r.c_ativ, offCents: off, pct,
      rule: rule ? { kind: rule.kind, valueNum: rule.valueNum } : null,
    });
    const name = use.name;
    if (isPromo) {
      // Promoção da Amazon não tem botão "Aplicar cupom" nem código: o desconto é aplicado pela Amazon (às vezes só no app). Sem inventar o fluxo do carrinho.
      const vendida = /vendidos pela Amazon/i.test(r.pc_termos ?? '') ? 'vale só para itens vendidos pela Amazon.com.br' : 'confira no anúncio se o item é vendido pela Amazon.com.br';
      use.howTo = primeOk ? ['Abra o anúncio (precisa ser membro Prime)', 'O desconto entra na finalização do pedido, aplicado pela própria Amazon; não tem código para digitar', 'Confira o preço final antes de pagar'] : [r.pc_app === 'true' ? 'Abra o anúncio no app da Amazon (a promoção vale só pelo app)' : 'Abra o anúncio', 'O desconto é aplicado pela própria Amazon; não tem código para digitar', `Confira o preço final antes de finalizar (${vendida})`];
      use.activation = stepsText(use.howTo);
    }
    const dlinha = `Desconto de ${fmt(off)} (${String(pct).replace('.', ',')}%): você paga ${fmt(Number(r.pw))}. `;
    if (rule?.minOrderCents) parts.push(`Compra mínima ${fmt(rule.minOrderCents)}`);
    if (rule?.maxDiscountCents) parts.push(`desconto máximo ${fmt(rule.maxDiscountCents)}`);
    const ruleText = `${dlinha}${parts.length ? `${parts.join(', ')}. ` : ''}`;
    // Regra não lida na lista: o preço é o que a página mostrou, e a mensagem diz isso sem inventar compra mínima ou teto.
    const tail = isPromo ? 'Preço calculado pela regra da promoção (a página não mostra o preço final)' : verdict.ruleKnown ? 'Preço lido na página do anúncio' : 'Preço lido na página do anúncio; regra completa na tela do cupom';
    const ativar = use.activation;
    return {
      info: {
        code: name,
        typedCode: use.code,
        unnamed: !use.named,
        conditions: `${ruleText}Como usar: ${ativar} ${tail}`,
        expiresAt: rulePromo?.validUntil ?? null,
        verifiedAt: readIso,
        couponRef: offerId,
        annKind: 'anuncio',
      },
      detail: {
        net: r.net, offerPriceCents: current, finalCents: Number(r.pw), offCents: off, pct, name,
        minOrderCents: rule?.minOrderCents ?? null, maxDiscountCents: rule?.maxDiscountCents ?? null, ruleKnown: verdict.ruleKnown,
        activation: ativar, named: use.named, code: use.code, howTo: use.howTo, readAt: readIso, priceSeenCents: r.ps, validUntil: rulePromo?.validUntil ?? null, ...(primeOk ? { exclusivePrime: true } : {}),
      },
    };
  }
  trace?.(lastReason ?? 'reprovou_agulha');
  return null;
}

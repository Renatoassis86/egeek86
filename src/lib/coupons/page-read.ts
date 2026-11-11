// LEITURA DE CUPOM NA PÁGINA DO ITEM para Amazon e Shopee (dono autorizou em 2026-11-11). Módulo PURO (sem banco, sem rede): valida o
// que a aba logada do dono leu e o transforma em linhas de `offer_coupon_reads` + a regra legível do rótulo. Nada é inventado:
//  - o preço com cupom é o que a página mostrou; quando a página só mostra o selo ("Aplicar cupom de R$ 20", "10% OFF"), o preço é
//    DERIVADO da regra escrita no próprio selo sobre o preço lido (status 'derivado_do_rotulo'), nunca de outra fonte;
//  - selo sem regra legível (ex.: "Cupom disponível") não vira preço: a leitura é descartada;
//  - `shopee_campaigns` (campanhas de comissão) NUNCA entram aqui.
import { finalPriceByRule, AGULHA, type AgulhaRule } from './agulha';

export type PageNetwork = 'amazon' | 'shopee';
export const PAGE_NETWORKS: readonly PageNetwork[] = ['amazon', 'shopee'];
export const PAGE_SOURCE: Record<PageNetwork, string> = { amazon: 'amazon-pagina', shopee: 'shopee-pagina' };
export const PAGE_STATUS_LIDO = 'lido_na_pagina';
export const PAGE_STATUS_DERIVADO = 'derivado_do_rotulo';

/** Origens (abas logadas do dono) autorizadas a enviar leitura, por rede. Origem fixa: nada além disto. */
export const COUPON_ORIGINS_BY_NETWORK: Record<'mercado-livre' | PageNetwork, readonly string[]> = {
  'mercado-livre': ['https://www.mercadolivre.com.br', 'https://mercadolivre.com.br', 'https://produto.mercadolivre.com.br'],
  amazon: ['https://www.amazon.com.br', 'https://amazon.com.br'],
  shopee: ['https://shopee.com.br', 'https://www.shopee.com.br'],
};

export function originAllowedForNetwork(origin: string, network: string): boolean {
  return (COUPON_ORIGINS_BY_NETWORK as Record<string, readonly string[]>)[network]?.includes(origin) ?? false;
}

/** "R$ 1.234,56" / "R$20" / "20,5" -> centavos; null se não for valor. */
export function brlToCents(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/i, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

const MONEY = String.raw`R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
const MIN_RE = new RegExp(String.raw`(?:m[ií]n(?:imo|\.)?\s*(?:de\s*)?(?:gasto|compra|pedido)?|compras?\s+(?:acima|a partir)\s+de|acima\s+de|a\s+partir\s+de)[^R\d]{0,12}${MONEY}`, 'i');
const MAX_RE = new RegExp(String.raw`(?:m[aá]x(?:imo|\.)?(?:\s*de)?|limite\s+de|at[eé])[^R\d]{0,12}${MONEY}`, 'i');
const PCT_RE = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;

export interface LabelRule {
  kind: 'percentual' | 'valor_fixo';
  /** % (10 = 10%) ou reais; null = selo sem valor legível. */
  valueNum: number | null;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
}

/** Lê a regra escrita no próprio selo/rótulo. Ambíguo (percentual e reais juntos fora de mín/máx) = valor nulo. */
export function ruleFromLabel(label: string): LabelRule {
  let text = label.replace(/\s+/g, ' ');
  const min = MIN_RE.exec(text);
  const minOrderCents = min ? brlToCents(min[1]) : null;
  if (min) text = text.replace(min[0], ' ');
  const max = MAX_RE.exec(text);
  const maxDiscountCents = max ? brlToCents(max[1]) : null;
  if (max) text = text.replace(max[0], ' ');
  const pct = PCT_RE.exec(text);
  const money = new RegExp(MONEY, 'i').exec(text);
  const pctV = pct ? Number(pct[1].replace(',', '.')) : null;
  const moneyC = money ? brlToCents(money[1]) : null;
  if (pctV != null && pctV > 0 && pctV <= AGULHA.MAX_PLAUSIBLE_DISCOUNT_PCT && moneyC == null) return { kind: 'percentual', valueNum: pctV, minOrderCents, maxDiscountCents };
  if (moneyC != null && pctV == null) return { kind: 'valor_fixo', valueNum: moneyC / 100, minOrderCents, maxDiscountCents };
  return { kind: 'valor_fixo', valueNum: null, minOrderCents, maxDiscountCents };
}

/** Regra de agulha derivada do rótulo (cupom lido na página, sem lista de cupons). Validade não existe na página: null (aceito só no anúncio). */
export function agulhaRuleFromLabel(label: string): AgulhaRule | null {
  const r = ruleFromLabel(label);
  if (r.valueNum == null && r.minOrderCents == null) return null;
  return {
    kind: r.kind, valueNum: r.valueNum, minOrderCents: r.minOrderCents, maxDiscountCents: r.maxDiscountCents, validUntil: null, state: 'verificado',
    conditionsRaw: label.slice(0, 200),
  };
}

export interface PageCouponIn {
  label?: unknown;
  /** Preço com cupom em centavos, SÓ quando a página o mostra. */
  price_with_cents?: unknown;
}
export interface PageRowIn {
  id?: unknown;
  /** ASIN (Amazon) ou itemId (Shopee) lido na própria página/URL: confere que a aba abriu o item certo. */
  ref?: unknown;
  /** Preço do item lido na página (centavos). */
  price_seen_cents?: unknown;
  coupons?: unknown;
}

export type PageRowResult =
  | { ok: true; seen: number; coupons: { label: string; priceWithCents: number; status: string }[] }
  | { ok: false; reason: 'id_invalido' | 'pagina_de_outro_item' | 'sem_preco_lido' | 'preco_lido_incoerente' };

/** `ref` esperado a partir do external_ref da oferta (amazon-<ASIN> / shopee-<itemId>). */
export function expectedPageRef(network: PageNetwork, externalRef: string | null | undefined): string | null {
  if (!externalRef) return null;
  const m = network === 'amazon' ? /^amazon-([A-Z0-9]{10})$/.exec(externalRef) : /^shopee-(\d{1,19})$/.exec(externalRef);
  return m ? m[1] : null;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Valida uma linha lida pela aba contra a oferta (preço e ref do banco). Retorna as leituras a gravar:
 * lista vazia = lido e SEM cupom. Preço lido precisa estar a no máximo 50% do preço da oferta (senão a aba leu outro elemento).
 */
export function normalizePageRow(network: PageNetwork, row: PageRowIn, offer: { externalRef: string | null; priceCents: number }): PageRowResult {
  if (expectedPageRef(network, offer.externalRef) == null || String(row.ref ?? '').toUpperCase() !== expectedPageRef(network, offer.externalRef)!.toUpperCase()) {
    return { ok: false, reason: 'pagina_de_outro_item' };
  }
  const seen = row.price_seen_cents;
  if (!isInt(seen) || seen <= 0) return { ok: false, reason: 'sem_preco_lido' };
  if (Math.abs(seen - offer.priceCents) > offer.priceCents * 0.5) return { ok: false, reason: 'preco_lido_incoerente' };
  const out: { label: string; priceWithCents: number; status: string }[] = [];
  for (const c of (Array.isArray(row.coupons) ? row.coupons : []).slice(0, 5) as PageCouponIn[]) {
    const label = String(c?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!label || !/cupom|voucher|cupon/i.test(label)) continue;
    const read = isInt(c.price_with_cents) ? c.price_with_cents : null;
    let priceWith: number | null = null;
    let status = PAGE_STATUS_LIDO;
    if (read != null) {
      priceWith = read;
    } else {
      const rule = ruleFromLabel(label);
      if (rule.valueNum != null) {
        priceWith = finalPriceByRule({ kind: rule.kind, valueNum: rule.valueNum, maxDiscountCents: rule.maxDiscountCents }, seen);
        status = PAGE_STATUS_DERIVADO;
      }
    }
    if (priceWith == null || !(priceWith > 0) || priceWith >= seen) continue;
    out.push({ label, priceWithCents: priceWith, status });
  }
  return { ok: true, seen, coupons: out };
}

/** URL de leitura da página do item (sem tag de afiliado). Amazon: /dp/<ASIN>. Shopee: só o link oficial da oferta em shopee.com.br. */
export function leituraUrlFor(network: PageNetwork, externalRef: string | null | undefined, affiliateUrl: string | null | undefined): string | null {
  const ref = expectedPageRef(network, externalRef);
  if (!ref) return null;
  if (network === 'amazon') return `https://www.amazon.com.br/dp/${ref}`;
  return affiliateUrl && /^https:\/\/([a-z0-9-]+\.)*shopee\.com\.br\/[^\s<>"]+$/i.test(affiliateUrl) ? affiliateUrl : null;
}

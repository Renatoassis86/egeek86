/**
 * Tipos do sistema de cupons lidos nos portais (ata 2026-11-10, secao 3). Nada aqui e inventado:
 * todo cupom nasce de uma LEITURA (fonte, URL, texto bruto, data/hora) feita pela aba logada do dono.
 */

export const COUPON_NETWORKS = ['mercado-livre', 'shopee', 'amazon'] as const;
export type CouponNetwork = (typeof COUPON_NETWORKS)[number];

export const COUPON_KINDS = ['percentual', 'valor_fixo', 'frete', 'cashback', 'vale'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export const COUPON_AUDIENCES = ['todos', 'assinantes', 'primeira_compra', 'cartao', 'conta', 'outro'] as const;
export type CouponAudience = (typeof COUPON_AUDIENCES)[number];

export const COUPON_SCOPES = ['loja_inteira', 'categoria', 'produto', 'lista_itens'] as const;
export type CouponScopeKind = (typeof COUPON_SCOPES)[number];

export const COUPON_STATES = ['nao_verificado', 'verificado', 'vencido', 'invalido'] as const;
export type CouponState = (typeof COUPON_STATES)[number];

export const VALIDITY_SOURCES = ['texto_da_pagina', 'contagem_regressiva', 'ausente'] as const;
export type ValiditySource = (typeof VALIDITY_SOURCES)[number];

export const SOURCE_KINDS = ['portal_listagem', 'pagina_do_item', 'api'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type ValueUnit = 'percentual' | 'reais';

export interface CouponScopeRef {
  categorias?: string[];
  vendedores?: string[];
  item_ids?: string[];
  urls?: string[];
  offer_ids?: string[];
  master_product_ids?: string[];
}

/** Lote de leituras enviado pela aba (contrato JSON; nomes em portugues, como combinado). */
export interface CouponBatchInput {
  rede: string;
  fonte_url: string;
  lidos_em: string;
  /** true = a aba leu a pagina/lista inteira; cupons conhecidos dessa fonte que nao vieram sao marcados vencidos. */
  leitura_completa?: boolean;
  /** Rotulo curto da conta usada na leitura ('principal' | 'secundaria'). Nunca dado pessoal. */
  conta_lida?: string;
  cupons: unknown[];
}

/** Cupom ja validado e normalizado (pronto para gravar). */
export interface NormalizedCoupon {
  network: CouponNetwork;
  code: string | null;
  kind: CouponKind;
  valueNum: number | null;
  valueUnit: ValueUnit | null;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  conditionsRaw: string;
  conditions: Record<string, string | number | boolean | null>;
  audience: CouponAudience;
  audienceText: string | null;
  eligibleOnReadAccount: boolean | null;
  readAccount: string | null;
  scopeKind: CouponScopeKind;
  scope: CouponScopeRef;
  sourceUrl: string;
  sourceKind: SourceKind;
  rawText: string;
  validFrom: string | null; // ISO UTC
  validUntil: string | null; // ISO UTC
  validitySource: ValiditySource;
  validityRaw: string | null;
  readAt: string; // ISO UTC
  pagePriceCents: number | null;
  dedupHash: string;
  evidenceHash: string;
}

export type ValidationResult = { ok: true; coupon: NormalizedCoupon } | { ok: false; reason: string };

/** Cupom como o banco guarda (leitura). Datas em ISO (ja convertidas). */
export interface StoredCoupon {
  id: string;
  network: CouponNetwork;
  code: string | null;
  kind: CouponKind;
  valueNum: number | null;
  valueUnit: ValueUnit | null;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  conditionsRaw: string;
  audience: CouponAudience;
  audienceText: string | null;
  eligibleOnReadAccount: boolean | null;
  scopeKind: CouponScopeKind;
  scope: CouponScopeRef;
  sourceUrl: string;
  validFrom: string | null;
  validUntil: string | null;
  validitySource: ValiditySource;
  state: CouponState;
  firstSeenAt: string;
  streakStartedAt: string;
  lastSeenAt: string;
  verifiedAt: string | null;
  lastPagePriceCents: number | null;
  /** Termos curtos lidos na página da promoção (Amazon); ausente nas demais redes. */
  termos?: string | null;
}

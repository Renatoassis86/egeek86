import { createHash } from 'node:crypto';
import {
  COUPON_AUDIENCES,
  COUPON_KINDS,
  COUPON_NETWORKS,
  COUPON_SCOPES,
  SOURCE_KINDS,
  VALIDITY_SOURCES,
  type CouponAudience,
  type CouponKind,
  type CouponNetwork,
  type CouponScopeKind,
  type CouponScopeRef,
  type NormalizedCoupon,
  type SourceKind,
  type ValidationResult,
  type ValiditySource,
    type ValueUnit,
} from './types';

/**
 * Normalizacao e validacao PURAS (sem banco, sem rede) do que a aba envia. Regra de ouro: nunca gerar, deduzir ou completar
 * dado. O que nao veio, fica nulo; o que veio incompleto para a regra, e REJEITADO com motivo (nunca "consertado").
 */

export const MAX_RAW_TEXT = 4000;
export const MAX_CONDITIONS_TEXT = 1500;
const MAX_SHORT = 200;
const MAX_REF_ITEMS = 50;
const CODE_RE = /^[A-Za-z0-9._-]{2,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const ACCOUNT_RE = /^[a-z0-9_-]{1,40}$/;

/** Hosts aceitos como "pagina onde foi lido", por rede (dominio exato ou subdominio). */
const NETWORK_HOSTS: Record<CouponNetwork, string[]> = {
  'mercado-livre': ['mercadolivre.com.br'],
  shopee: ['shopee.com.br'],
  amazon: ['amazon.com.br'],
};

export function isNetwork(v: unknown): v is CouponNetwork {
  return typeof v === 'string' && (COUPON_NETWORKS as readonly string[]).includes(v);
}

export function hostAllowedForNetwork(url: string, network: CouponNetwork): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return NETWORK_HOSTS[network].some((h) => host === h || host.endsWith(`.${h}`));
}

/** ISO 8601 com fuso explicito -> ISO UTC; qualquer outra coisa -> null (nao assumimos fuso). */
export function parseIsoStrict(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO_RE.test(v.trim())) return null;
  const t = Date.parse(v.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Remove caracteres de controle, preserva o texto. NAO reescreve o conteudo. */
export function cleanText(v: string): string {
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
}

/** Forma canonica para comparar/deduplicar textos (nao e o que se grava). */
export function canonText(v: string): string {
  return v.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function optString(v: unknown, max: number): string | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return 'invalid';
  const t = cleanText(v);
  if (!t) return null;
  return t.length > max ? 'invalid' : t;
}

function optCents(v: unknown): number | null | 'invalid' {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0 || v > 100_000_000) return 'invalid';
  return v;
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function strList(v: unknown): string[] | undefined | 'invalid' {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > MAX_REF_ITEMS) return 'invalid';
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return 'invalid';
    const t = cleanText(x);
    if (!t || t.length > 500) return 'invalid';
    out.push(t);
  }
  return out.length ? out : undefined;
}

const SCOPE_KEYS = ['categorias', 'vendedores', 'item_ids', 'urls', 'offer_ids', 'master_product_ids'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeScope(kind: CouponScopeKind, ref: unknown): CouponScopeRef | string {
  const out: CouponScopeRef = {};
  if (ref !== undefined && ref !== null) {
    if (typeof ref !== 'object' || Array.isArray(ref)) return 'escopo_ref_invalido';
    const r = ref as Record<string, unknown>;
    for (const k of Object.keys(r)) if (!(SCOPE_KEYS as readonly string[]).includes(k)) return `escopo_ref_chave_desconhecida:${k}`;
    for (const k of SCOPE_KEYS) {
      const l = strList(r[k]);
      if (l === 'invalid') return `escopo_ref_invalido:${k}`;
      if (l) out[k] = l;
    }
    for (const k of ['offer_ids', 'master_product_ids'] as const) {
      if (out[k]?.some((x) => !UUID_RE.test(x))) return `escopo_ref_invalido:${k}`;
    }
  }
  const has = (k: keyof CouponScopeRef) => (out[k]?.length ?? 0) > 0;
  if (kind === 'categoria' && !has('categorias')) return 'escopo_categoria_sem_categorias';
  if (kind === 'produto' || kind === 'lista_itens') {
    if (!has('item_ids') && !has('urls') && !has('offer_ids') && !has('master_product_ids') && !has('vendedores')) return 'escopo_itens_sem_referencia';
    if (kind === 'produto') {
      // produto = UM item (varias referencias do mesmo item, como item_id + url, sao aceitas); varios itens = lista_itens.
      if ((out.item_ids?.length ?? 0) > 1 || (out.offer_ids?.length ?? 0) > 1 || (out.master_product_ids?.length ?? 0) > 1 || has('vendedores')) {
        return 'escopo_produto_com_varios_itens_use_lista_itens';
      }
    }
  }
  // loja_inteira = vale para a rede toda: qualquer referencia contradiz o escopo (cupom de UM vendedor e lista_itens com vendedores).
  if (kind === 'loja_inteira' && Object.keys(out).length > 0) return 'escopo_loja_inteira_nao_aceita_referencia';
  return out;
}

function sortedScope(scope: CouponScopeRef): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const k of SCOPE_KEYS) if (scope[k]?.length) o[k] = [...scope[k]!].map(canonText).sort();
  return o;
}

function normalizeConditions(v: unknown): Record<string, string | number | boolean | null> | string {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) return 'condicoes_invalidas';
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > 20) return 'condicoes_demais_chaves';
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, val] of entries) {
    if (!/^[a-z0-9_]{1,40}$/.test(k)) return `condicoes_chave_invalida:${k}`;
    if (val === null || typeof val === 'boolean') out[k] = val;
    else if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'string' && val.length <= MAX_SHORT) out[k] = cleanText(val);
    else return `condicoes_valor_invalido:${k}`;
  }
  return out;
}

export interface BatchContext {
  network: CouponNetwork;
  /** URL da fonte do lote (usada quando o cupom nao traz a sua). */
  batchSourceUrl: string;
  /** ISO UTC ja validado do lote. */
  readAt: string;
  readAccount: string | null;
}

/** Valida e normaliza UM cupom bruto. Rejeita (com motivo) tudo que nao tem fonte, texto bruto ou valor coerente. */
export function validateCoupon(raw: unknown, ctx: BatchContext): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'cupom_nao_e_objeto' };
  const r = raw as Record<string, unknown>;
  const network = ctx.network;

  // --- fonte (obrigatoria: sem URL lida, nao existe cupom)
  const sourceUrl = typeof r.fonte_url === 'string' && r.fonte_url ? r.fonte_url.trim() : ctx.batchSourceUrl;
  if (!sourceUrl) return { ok: false, reason: 'sem_fonte_url' };
  if (sourceUrl.length > 1000 || !hostAllowedForNetwork(sourceUrl, network)) return { ok: false, reason: 'fonte_url_fora_da_rede' };
  const sourceKind: SourceKind | null = r.fonte_tipo === undefined ? 'portal_listagem' : oneOf(SOURCE_KINDS, r.fonte_tipo);
  if (!sourceKind) return { ok: false, reason: 'fonte_tipo_invalido' };

  // --- texto bruto da pagina e da condicao (obrigatorios)
  const rawText = optString(r.texto_bruto, MAX_RAW_TEXT);
  if (rawText === 'invalid') return { ok: false, reason: 'texto_bruto_invalido_ou_grande' };
  if (!rawText) return { ok: false, reason: 'sem_texto_bruto' };
  const conditionsRaw = optString(r.condicoes_texto, MAX_CONDITIONS_TEXT);
  if (conditionsRaw === 'invalid') return { ok: false, reason: 'condicoes_texto_invalido_ou_grande' };
  if (!conditionsRaw) return { ok: false, reason: 'sem_condicoes_texto' };
  const conditions = normalizeConditions(r.condicoes);
  if (typeof conditions === 'string') return { ok: false, reason: conditions };

  // --- tipo, valor, unidade
  const kind: CouponKind | null = oneOf(COUPON_KINDS, r.tipo);
  if (!kind) return { ok: false, reason: 'tipo_invalido' };
  let valueNum: number | null = null;
  if (r.valor !== undefined && r.valor !== null) {
    if (typeof r.valor !== 'number' || !Number.isFinite(r.valor) || r.valor <= 0 || r.valor > 1_000_000) return { ok: false, reason: 'valor_invalido' };
    valueNum = Math.round(r.valor * 100) / 100;
  }
  let valueUnit: ValueUnit | null = null;
  if (r.valor_unidade !== undefined && r.valor_unidade !== null) {
    if (r.valor_unidade !== 'percentual' && r.valor_unidade !== 'reais') return { ok: false, reason: 'valor_unidade_invalida' };
    valueUnit = r.valor_unidade;
  }
  if (kind === 'percentual') {
    if (valueNum === null) return { ok: false, reason: 'percentual_sem_valor' };
    if (valueUnit && valueUnit !== 'percentual') return { ok: false, reason: 'unidade_incoerente_com_tipo' };
    valueUnit = 'percentual';
    if (valueNum > 100) return { ok: false, reason: 'percentual_acima_de_100' };
  } else if (kind === 'valor_fixo') {
    if (valueNum === null) return { ok: false, reason: 'valor_fixo_sem_valor' };
    if (valueUnit && valueUnit !== 'reais') return { ok: false, reason: 'unidade_incoerente_com_tipo' };
    valueUnit = 'reais';
  } else if (kind === 'cashback') {
    if (valueNum === null) return { ok: false, reason: 'cashback_sem_valor' };
    if (!valueUnit) return { ok: false, reason: 'cashback_sem_unidade' };
    if (valueUnit === 'percentual' && valueNum > 100) return { ok: false, reason: 'percentual_acima_de_100' };
  } else {
    // frete e vale: valor opcional; se vier, a unidade tem que vir junto (nunca deduzida)
    if (valueNum !== null && !valueUnit) return { ok: false, reason: 'valor_sem_unidade' };
    if (valueNum === null) valueUnit = null;
    if (valueUnit === 'percentual' && valueNum !== null && valueNum > 100) return { ok: false, reason: 'percentual_acima_de_100' };
  }

  // --- codigo (opcional)
  let code: string | null = null;
  if (r.codigo !== undefined && r.codigo !== null && r.codigo !== '') {
    if (typeof r.codigo !== 'string' || !CODE_RE.test(r.codigo.trim())) return { ok: false, reason: 'codigo_invalido' };
    code = r.codigo.trim();
  }

  // --- minimo e teto
  const minOrderCents = optCents(r.minimo_compra_centavos);
  const maxDiscountCents = optCents(r.teto_desconto_centavos);
  if (minOrderCents === 'invalid') return { ok: false, reason: 'minimo_compra_invalido' };
  if (maxDiscountCents === 'invalid') return { ok: false, reason: 'teto_desconto_invalido' };
  if (kind === 'valor_fixo' && valueNum !== null && minOrderCents !== null && valueNum * 100 > minOrderCents) {
    return { ok: false, reason: 'valor_fixo_maior_que_minimo_incoerente' };
  }

  // --- publico
  const audience: CouponAudience | null = r.publico === undefined ? 'todos' : oneOf(COUPON_AUDIENCES, r.publico);
  if (!audience) return { ok: false, reason: 'publico_invalido' };
  const audienceText = optString(r.publico_texto, MAX_SHORT);
  if (audienceText === 'invalid') return { ok: false, reason: 'publico_texto_invalido' };
  if (audience !== 'todos' && !audienceText) return { ok: false, reason: 'publico_restrito_sem_texto_lido' };
  let eligible: boolean | null = null;
  if (r.elegivel_na_conta !== undefined && r.elegivel_na_conta !== null) {
    if (typeof r.elegivel_na_conta !== 'boolean') return { ok: false, reason: 'elegivel_na_conta_invalido' };
    eligible = r.elegivel_na_conta;
  }

  // --- escopo
  const scopeKind: CouponScopeKind | null = oneOf(COUPON_SCOPES, r.escopo);
  if (!scopeKind) return { ok: false, reason: 'escopo_invalido' };
  const scope = normalizeScope(scopeKind, r.escopo_ref);
  if (typeof scope === 'string') return { ok: false, reason: scope };

  // --- validade (so o que foi lido; fim presente exige origem declarada; ausente e declarado)
  const validFrom = r.validade_inicio === undefined || r.validade_inicio === null ? null : parseIsoStrict(r.validade_inicio);
  if (r.validade_inicio !== undefined && r.validade_inicio !== null && !validFrom) return { ok: false, reason: 'validade_inicio_invalida' };
  const validUntil = r.validade_fim === undefined || r.validade_fim === null ? null : parseIsoStrict(r.validade_fim);
  if (r.validade_fim !== undefined && r.validade_fim !== null && !validUntil) return { ok: false, reason: 'validade_fim_invalida' };
  const validitySource: ValiditySource | null = r.validade_origem === undefined ? (validUntil ? null : 'ausente') : oneOf(VALIDITY_SOURCES, r.validade_origem);
  if (!validitySource) return { ok: false, reason: validUntil ? 'validade_fim_sem_origem' : 'validade_origem_invalida' };
  if (validUntil && validitySource === 'ausente') return { ok: false, reason: 'validade_fim_com_origem_ausente' };
  if (!validUntil && validitySource !== 'ausente') return { ok: false, reason: 'validade_origem_sem_fim' };
  if (validFrom && validUntil && Date.parse(validUntil) < Date.parse(validFrom)) return { ok: false, reason: 'validade_fim_antes_do_inicio' };
  const validityRaw = optString(r.validade_texto, MAX_SHORT);
  if (validityRaw === 'invalid') return { ok: false, reason: 'validade_texto_invalido' };
  if (validUntil && !validityRaw) return { ok: false, reason: 'validade_fim_sem_texto_lido' };

  // --- preco com cupom exibido pela loja (opcional)
  const pagePrice = optCents(r.preco_com_cupom_centavos);
  if (pagePrice === 'invalid') return { ok: false, reason: 'preco_com_cupom_invalido' };

  // --- hash de deduplicacao: conteudo normalizado, SEM validade (prazo prorrogado e o mesmo cupom)
  const dedupHash = sha256(
    JSON.stringify([
      network, code ? code.toUpperCase() : null, kind, valueNum, valueUnit, minOrderCents, maxDiscountCents,
      scopeKind, sortedScope(scope), audience, canonText(conditionsRaw),
    ])
  );

  return {
    ok: true,
    coupon: {
      network, code, kind, valueNum, valueUnit, minOrderCents, maxDiscountCents,
      conditionsRaw, conditions, audience, audienceText, eligibleOnReadAccount: eligible, readAccount: ctx.readAccount,
      scopeKind, scope, sourceUrl, sourceKind, rawText, validFrom, validUntil, validitySource, validityRaw,
      readAt: ctx.readAt, pagePriceCents: pagePrice, dedupHash, evidenceHash: sha256(rawText),
    },
  };
}

export interface BatchValidation {
  ok: true;
  context: BatchContext;
  complete: boolean;
  coupons: NormalizedCoupon[];
  rejected: { index: number; reason: string }[];
}

/**
 * Valida o envelope {rede, fonte_url, lidos_em, cupons}. `lidos_em` nao pode estar no futuro (> 5 min) nem ter mais de 6 h:
 * ele e a hora REAL da leitura e sustenta a regra das 2 horas; nunca e substituido pela hora do servidor.
 */
export function validateBatch(body: unknown, now: Date, maxCoupons = 150): BatchValidation | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'corpo_invalido' };
  const b = body as Record<string, unknown>;
  if (!isNetwork(b.rede)) return { ok: false, error: 'rede_invalida' };
  const network = b.rede;
  if (typeof b.fonte_url !== 'string' || !hostAllowedForNetwork(b.fonte_url.trim(), network)) return { ok: false, error: 'fonte_url_invalida' };
  const readAt = parseIsoStrict(b.lidos_em);
  if (!readAt) return { ok: false, error: 'lidos_em_invalido' };
  const delta = now.getTime() - Date.parse(readAt);
  if (delta < -5 * 60_000) return { ok: false, error: 'lidos_em_no_futuro' };
  if (delta > 6 * 3_600_000) return { ok: false, error: 'lidos_em_antigo_demais' };
  if (!Array.isArray(b.cupons)) return { ok: false, error: 'cupons_nao_e_lista' };
  if (b.cupons.length > maxCoupons) return { ok: false, error: 'cupons_demais' };
  if (b.leitura_completa !== undefined && typeof b.leitura_completa !== 'boolean') return { ok: false, error: 'leitura_completa_invalido' };
  let readAccount: string | null = null;
  if (b.conta_lida !== undefined && b.conta_lida !== null) {
    if (typeof b.conta_lida !== 'string' || !ACCOUNT_RE.test(b.conta_lida)) return { ok: false, error: 'conta_lida_invalida' };
    readAccount = b.conta_lida;
  }
  const context: BatchContext = { network, batchSourceUrl: b.fonte_url.trim(), readAt, readAccount };
  const coupons: NormalizedCoupon[] = [];
  const rejected: { index: number; reason: string }[] = [];
  const seen = new Set<string>();
  b.cupons.forEach((c, index) => {
    const v = validateCoupon(c, context);
    if (!v.ok) { rejected.push({ index, reason: v.reason }); return; }
    if (seen.has(v.coupon.dedupHash)) { rejected.push({ index, reason: 'duplicado_no_lote' }); return; }
    seen.add(v.coupon.dedupHash);
    coupons.push(v.coupon);
  });
  return { ok: true, context, complete: b.leitura_completa === true, coupons, rejected };
}

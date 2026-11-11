import { createHash } from 'node:crypto';
import { z } from 'zod';
import { COUPON_NETWORKS, type CouponNetwork, type StoredCoupon } from './types';

/**
 * CODIGO DE CAMPANHA cadastrado pelo dono (2026-11-11): ex.: "TODOSITE1111" (Mercado Livre, valido no site todo).
 * Nada e inventado: o dono digita o codigo, a regra, a validade (FIM obrigatorio) e ONDE viu (URL https obrigatoria).
 * Sem validade futura ou sem fonte, o cadastro e RECUSADO (nunca vira "verificado" por omissao). Funcoes puras, sem banco.
 */

export const CAMPAIGN_SOURCE_KIND = 'manual_dono';
export const CAMPAIGN_VERIFIED_BY = 'manual_dono';
/**
 * Idade maxima da confirmacao do dono para o cupom entrar em mensagem. Cupom de campanha nao e relido pela aba a cada 2 h;
 * quem confirma e o dono (botao "Confirmar de novo"). 24 h: passou disso sem confirmar, a linha some da mensagem.
 */
export const CAMPAIGN_MAX_AGE_MINUTES = 24 * 60;

export const CAMPAIGN_KINDS = ['percentual', 'valor_fixo', 'frete'] as const;
export const CAMPAIGN_SCOPES = ['site', 'categoria', 'loja'] as const;
export type CampaignScope = (typeof CAMPAIGN_SCOPES)[number];

const CATEGORIES = ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte', 'impressao3d'] as const;

/** Reais digitados ("1.234,56", "100", "R$ 30") para centavos. null se vazio; NaN-safe (devolve 'invalid'). */
export function parseBRLToCents(v: string | undefined | null): number | null | 'invalid' {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const s = raw.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+\.\d{1,2}$/.test(s)) return 'invalid';
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return 'invalid';
  return Math.round(n * 100);
}

/** "2026-11-12T23:59" (datetime-local, horario de Brasilia) ou ISO com fuso para ISO UTC. null se invalido. */
export function parseCampaignEnd(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/.test(s);
  const withSeconds = /T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
  const iso = hasZone ? withSeconds : `${withSeconds}-03:00`;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(iso)) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const schema = z.object({
  network: z.enum(COUPON_NETWORKS),
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, 'codigo_invalido')),
  kind: z.enum(CAMPAIGN_KINDS),
  value: z.string().optional(),
  minOrder: z.string().optional(),
  cap: z.string().optional(),
  scope: z.enum(CAMPAIGN_SCOPES),
  scopeValue: z.string().trim().max(120).optional(),
  validUntil: z.string(),
  sourceUrl: z.string().trim().max(1000),
  note: z.string().trim().max(500).optional(),
});

export interface CampaignCouponInput {
  network: string;
  code: string;
  kind: string;
  value?: string;
  minOrder?: string;
  cap?: string;
  scope: string;
  scopeValue?: string;
  validUntil: string;
  sourceUrl: string;
  note?: string;
}

export interface ValidCampaign {
  network: CouponNetwork;
  code: string;
  kind: (typeof CAMPAIGN_KINDS)[number];
  valueNum: number | null;
  valueUnit: 'percentual' | 'reais' | null;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  scopeKind: 'loja_inteira' | 'categoria' | 'lista_itens';
  scope: { categorias?: string[]; vendedores?: string[] };
  scopeValue: string | null;
  validUntil: string;
  sourceUrl: string;
  note: string | null;
  conditionsRaw: string;
  rawText: string;
  dedupHash: string;
}

export type CampaignValidation = { ok: true; campaign: ValidCampaign } | { ok: false; reason: string };

function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Valor digitado: "10" (percentual ou reais) com virgula opcional; devolve numero ou null/'invalid'. */
function parseValue(v: string | undefined): number | null | 'invalid' {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const n = Number(raw.replace(/^R\$\s*/i, '').replace('%', '').replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : 'invalid';
}

/** Texto da regra (so o que o dono informou) + onde vale. */
export function describeRule(c: Pick<ValidCampaign, 'kind' | 'valueNum' | 'valueUnit' | 'minOrderCents' | 'maxDiscountCents' | 'scopeKind' | 'scopeValue'>, networkName: string): string {
  const base =
    c.kind === 'frete' ? 'Frete grátis' :
    c.kind === 'percentual' ? `${String(c.valueNum).replace('.', ',')}% de desconto` :
    `${fmtBRL(Math.round((c.valueNum ?? 0) * 100))} de desconto`;
  const parts = [base];
  if (c.minOrderCents) parts.push(`em compras a partir de ${fmtBRL(c.minOrderCents)}`);
  if (c.maxDiscountCents) parts.push(`com teto de ${fmtBRL(c.maxDiscountCents)}`);
  const where =
    c.scopeKind === 'loja_inteira' ? `Vale no site todo do ${networkName}` :
    c.scopeKind === 'categoria' ? `Vale na categoria ${c.scopeValue ?? ''}`.trim() :
    `Vale na loja ${c.scopeValue ?? ''}`.trim();
  return `${parts.join(', ')}. ${where}.`;
}

export function validateCampaignInput(input: CampaignCouponInput, now: Date = new Date()): CampaignValidation {
  const p = schema.safeParse(input);
  if (!p.success) {
    const issue = p.error.issues[0];
    const path = String(issue.path[0] ?? '');
    return { ok: false, reason: issue.message === 'codigo_invalido' ? 'codigo_invalido' : `campo_invalido:${path || 'form'}` };
  }
  const d = p.data;
  const end = parseCampaignEnd(d.validUntil);
  if (!end) return { ok: false, reason: 'validade_fim_obrigatoria_ou_invalida' };
  if (Date.parse(end) <= now.getTime() + 60_000) return { ok: false, reason: 'validade_ja_vencida' };

  let src: URL;
  try { src = new URL(d.sourceUrl); } catch { return { ok: false, reason: 'fonte_url_obrigatoria' }; }
  if (src.protocol !== 'https:' || !src.hostname.includes('.')) return { ok: false, reason: 'fonte_url_deve_ser_https' };

  const value = parseValue(d.value);
  if (value === 'invalid') return { ok: false, reason: 'valor_invalido' };
  if (d.kind !== 'frete' && value === null) return { ok: false, reason: 'valor_obrigatorio' };
  if (d.kind === 'percentual' && value !== null && value > 100) return { ok: false, reason: 'percentual_acima_de_100' };
  const min = parseBRLToCents(d.minOrder);
  const cap = parseBRLToCents(d.cap);
  if (min === 'invalid') return { ok: false, reason: 'compra_minima_invalida' };
  if (cap === 'invalid') return { ok: false, reason: 'teto_invalido' };

  const scopeValue = d.scopeValue?.trim() || null;
  if (d.scope !== 'site' && !scopeValue) return { ok: false, reason: 'escopo_sem_valor' };
  if (d.scope === 'categoria' && !(CATEGORIES as readonly string[]).includes(scopeValue!)) return { ok: false, reason: 'categoria_desconhecida' };

  const scopeKind = d.scope === 'site' ? 'loja_inteira' : d.scope === 'categoria' ? 'categoria' : 'lista_itens';
  const scope = d.scope === 'categoria' ? { categorias: [scopeValue!] } : d.scope === 'loja' ? { vendedores: [scopeValue!] } : {};
  const valueUnit = d.kind === 'percentual' ? 'percentual' : d.kind === 'valor_fixo' ? 'reais' : null;
  const netName = d.network === 'mercado-livre' ? 'Mercado Livre' : d.network === 'shopee' ? 'Shopee' : 'Amazon';
  const partial = { kind: d.kind, valueNum: value, valueUnit, minOrderCents: min, maxDiscountCents: cap, scopeKind, scopeValue } as const;
  const conditionsRaw = describeRule(partial, netName);
  const note = d.note || null;
  const rawText = `Cadastrado pelo dono. Código ${d.code}. ${conditionsRaw} Válido até ${end}. Visto em ${src.toString()}.${note ? ` Obs.: ${note}` : ''}`.slice(0, 4000);
  // Prefixo "manual|" separa o hash de qualquer cupom lido pela aba (mesma unique rede+hash).
  const dedupHash = createHash('sha256')
    .update(['manual', d.network, d.code, d.kind, value ?? '', min ?? '', cap ?? '', scopeKind, scopeValue ?? ''].join('|'))
    .digest('hex');
  return {
    ok: true,
    campaign: {
      network: d.network, code: d.code, kind: d.kind, valueNum: value, valueUnit, minOrderCents: min, maxDiscountCents: cap,
      scopeKind, scope, scopeValue, validUntil: end, sourceUrl: src.toString(), note, conditionsRaw, rawText, dedupHash,
    },
  };
}

/** Pode entrar em mensagem agora? Verificado, feito pelo dono, prazo futuro, confirmado nas ultimas 24 h. Pura. */
export function isCampaignUsable(c: Pick<StoredCoupon, 'state' | 'validUntil' | 'validFrom' | 'verifiedAt' | 'code'>, now: Date, maxAgeMinutes = CAMPAIGN_MAX_AGE_MINUTES): boolean {
  if (c.state !== 'verificado' || !c.code || !c.validUntil || !c.verifiedAt) return false;
  const nowMs = now.getTime();
  if (Date.parse(c.validUntil) <= nowMs) return false;
  if (c.validFrom && Date.parse(c.validFrom) > nowMs) return false;
  const v = Date.parse(c.verifiedAt);
  if (!Number.isFinite(v) || v > nowMs + 5 * 60_000 || nowMs - v > maxAgeMinutes * 60_000) return false;
  return true;
}

/**
 * R-107 (dono, 2026-11-20): métricas de decisão de compra em TODA mensagem de produto: parcelamento, preço no Pix e frete grátis.
 * Módulo PURO (sem banco, sem rede). Cada métrica só existe com PROVA no item: valor lido (nunca derivado de percentual), leitura dentro da
 * janela de frescor da rede e coerente com o preço atual da oferta. Sem prova a linha NÃO aparece (nunca placeholder, nunca estimativa).
 */
import { amazonFrescorMin } from './confirmacao-preco';

export interface MetricasLinha {
  installmentsQty: number | null;
  installmentCents: number | null;
  installmentsNoInterest: boolean | null;
  installmentsSeenAt: Date | null;
  pixCents: number | null;
  pixSeenAt: Date | null;
  freeShipping: boolean | null;
  shippingSeenAt: Date | null;
}

export interface MetricasCompra {
  /** `semJuros` só é true quando a leitura disse "sem juros" E a conta fecha (parcelas x valor = preço atual). */
  parcelas?: { qty: number; cents: number; semJuros: boolean };
  /** Preço final no Pix, lido (nunca derivado de percentual). */
  pixCents?: number;
  freteGratis?: true;
}

export const METRICAS_FRESCOR_HORAS_PADRAO = 12;

export function metricasCompraLigado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.METRICAS_COMPRA ?? '').trim().toLowerCase() !== 'off';
}

/** Janela de frescor em minutos: Amazon = a mesma do preço (R-81/R-88, AMAZON_FRESCOR_MIN, 45 min); demais redes = METRICAS_COMPRA_FRESCOR_H (12 h). */
export function frescorMetricasMin(amazon: boolean, env: Record<string, string | undefined> = process.env): number {
  if (amazon) return amazonFrescorMin(env);
  const h = Number(env.METRICAS_COMPRA_FRESCOR_H);
  return (Number.isFinite(h) && h > 0 && h <= 72 ? h : METRICAS_FRESCOR_HORAS_PADRAO) * 60;
}

function fresca(seen: Date | null, now: Date, limiteMin: number): boolean {
  if (!(seen instanceof Date) || isNaN(seen.getTime())) return false;
  const idadeMin = (now.getTime() - seen.getTime()) / 60_000;
  return idadeMin >= -5 && idadeMin <= limiteMin;
}

const inteiro = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** Faixa do Pix sobre o preço cheio atual (mesma da R-69): fora dela a leitura não é confiável (ou o preço mudou depois da leitura). */
const PIX_RAZAO_MIN = 0.7;
const PIX_RAZAO_MAX = 0.9995;

/**
 * Decide o que está PROVADO para a oferta. `priceCents` = preço atual gravado (Amazon: o cheio, R-69).
 * - Parcelas: 2..24x, valor > 0, leitura fresca; total (n x valor) nunca abaixo do preço (com 0,5 % de folga de arredondamento) nem
 *   acima de 1,8x; "sem juros" só se o texto lido disse e o total fecha com o preço (1 % de folga). Parcela de outro preço = descartada.
 * - Pix: valor lido, leitura fresca, razão sobre o preço atual entre 0,70 e 0,9995.
 * - Frete: flag true lida dentro da janela. false/nulo = nada aparece.
 */
export function provarMetricas(row: MetricasLinha | null | undefined, ctx: { amazon: boolean; priceCents: number; now: Date; env?: Record<string, string | undefined> }): MetricasCompra | null {
  if (!row || !metricasCompraLigado(ctx.env ?? process.env) || !inteiro(ctx.priceCents)) return null;
  const lim = frescorMetricasMin(ctx.amazon, ctx.env ?? process.env);
  const out: MetricasCompra = {};
  const n = row.installmentsQty;
  const c = row.installmentCents;
  if (inteiro(n) && inteiro(c) && n >= 2 && n <= 24 && fresca(row.installmentsSeenAt, ctx.now, lim)) {
    const total = n * c;
    if (total >= ctx.priceCents * 0.995 && total <= ctx.priceCents * 1.8) {
      const semJuros = row.installmentsNoInterest === true && Math.abs(total - ctx.priceCents) <= ctx.priceCents * 0.01 + n;
      out.parcelas = { qty: n, cents: c, semJuros };
    }
  }
  const px = row.pixCents;
  if (inteiro(px) && px < ctx.priceCents && fresca(row.pixSeenAt, ctx.now, lim)) {
    const r = px / ctx.priceCents;
    if (r >= PIX_RAZAO_MIN && r <= PIX_RAZAO_MAX) out.pixCents = px;
  }
  if (row.freeShipping === true && fresca(row.shippingSeenAt, ctx.now, lim)) out.freteGratis = true;
  return out.parcelas || out.pixCents || out.freteGratis ? out : null;
}

/** Valida o parcelamento lido pelo leitor assistido da Amazon (`par`): 2..24 parcelas inteiras, valor inteiro em centavos > 0. Qualquer outra coisa = null (nunca consertado). */
export function parcelaDoLeitor(par: unknown): { qty: number; cents: number; semJuros: boolean } | null {
  const p = par as { n?: unknown; c?: unknown; sj?: unknown } | null | undefined;
  if (!p || typeof p !== 'object' || !inteiro(p.n) || !inteiro(p.c) || p.n < 2 || p.n > 24 || p.c > 100_000_000) return null;
  return { qty: p.n, cents: p.c, semJuros: p.sj === 1 };
}

/** Interpreta "em até 12x de R$ 793,32" / "10x de R$ 845,91 sem juros" de um texto lido. Sem padrão claro: null. */
export function parseParcelaTexto(texto: string): { qty: number; cents: number; semJuros: boolean } | null {
  const t = String(texto ?? '').replace(/\s+/g, ' ');
  const m = /(\d{1,2})\s*x\s+(?:de\s+)?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i.exec(t);
  if (!m) return null;
  const qty = Number(m[1]);
  const cents = Math.round(Number(m[2].replace(/\./g, '').replace(',', '.')) * 100);
  if (!(qty >= 2 && qty <= 24) || !(cents > 0)) return null;
  return { qty, cents, semJuros: /sem juros/i.test(t) };
}

const dataOuNula = (v: unknown): Date | null => (v == null ? null : new Date(v as string | number | Date));
const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

/** Linha crua do banco (colunas de affiliate_offers) -> MetricasLinha. Coluna ausente (migração não aplicada) = nulo = nada aparece. */
export function metricasDaLinha(r: Record<string, unknown>): MetricasLinha {
  return {
    installmentsQty: numOuNulo(r.installments_qty),
    installmentCents: numOuNulo(r.installment_cents),
    installmentsNoInterest: typeof r.installments_no_interest === 'boolean' ? r.installments_no_interest : null,
    installmentsSeenAt: dataOuNula(r.installments_seen_at),
    pixCents: numOuNulo(r.pix_cents),
    pixSeenAt: dataOuNula(r.pix_visto_em),
    freeShipping: typeof r.free_shipping === 'boolean' ? r.free_shipping : null,
    shippingSeenAt: dataOuNula(r.shipping_seen_at),
  };
}

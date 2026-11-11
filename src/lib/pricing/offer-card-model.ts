// Módulo PURO (sem banco, sem server-only, sem React): modelo e geometria do CARD DE OFERTA (PNG 1080x1080) para Telegram e WhatsApp
// (pedido do dono, 2026-11-11: "o menos é mais"). Aqui só se ESCOLHE e FORMATA o que já foi medido; nada é inventado nem estimado.
// O insight afirma apenas fato medido (comparação com valores numéricos reais de entrada); nunca promessa de preço futuro,
// nunca "de/por" nem "% OFF" de marketplace.
import { formatMoney, formatPct, formatStamp, truncateTitle } from '@/lib/pricing/price-card-model';

export { formatMoney, formatStamp, truncateTitle };

export const OFFER_CARD_SIZE = 1080;
/** Séries com menos dias medidos que isto não sustentam "menor registrado" nem "média" (mesmo piso do cartão de histórico). */
export const OFFER_CARD_MIN_DAYS = 3;
/** Queda mínima contra o último preço conhecido da própria oferta para virar insight. */
export const INSIGHT_DROP_MIN_PCT = 5;
/** Distância mínima abaixo da média única das lojas para virar insight. */
export const INSIGHT_BELOW_AVG_MIN_PCT = 10;
/** Até esta distância acima do menor registrado vale o insight "a X% do menor preço registrado". */
export const INSIGHT_NEAR_MIN_PCT = 3;
/** Média única só vale com 3 ou mais ofertas distintas (mesma regra do site). */
export const INSIGHT_MIN_OFFERS_FOR_AVG = 5; // dono, 2026-11-11: média com menos de 5 ofertas não vira "abaixo da média" no card (caso PS5)
/** Preço vivo: Mercado Livre/Shopee até 6 h; Amazon até 24 h (contrato do cache de preço dela). */
export const OFFER_CARD_MAX_AGE_MS = 6 * 3_600_000;
export const OFFER_CARD_MAX_AGE_AMAZON_MS = 24 * 3_600_000;
export const OFFER_TITLE_MAX_CHARS = 78;
export const OFFER_TITLE_NOCOVER_MAX_CHARS = 110;
export const INSIGHT_MAX_CHARS = 58;

export const OFFER_CARD_COLORS = {
  canvas: '#0B0908',
  surface: '#161311',
  text: '#F2E9D8',
  secondary: '#B8AD98',
  gold: '#D4AF37',
  grid: '#2A241E',
} as const;

/** Números já medidos pelo banco (todos opcionais: ausente = insight correspondente não existe). */
export interface OfferCardStats {
  /** Menor preço diário medido ANTES de hoje na série sem Amazon (mesma regra do site). */
  recordCents: number | null;
  /** Primeiro dia da série medida (YYYY-MM-DD). */
  seriesFirstDay: string | null;
  /** Dias medidos na série sem Amazon. */
  measuredDays: number;
  /** Média única oferta-dia (ADR 0004) sem Amazon e quantas ofertas distintas a formam. */
  avgCents: number | null;
  distinctOffers: number;
  /** Último preço conhecido da PRÓPRIA oferta antes de hoje (price_daily_offer.last_cents) e o dia dele. */
  prev: { cents: number; day: string } | null;
}

export interface OfferCardInput {
  title: string;
  platformLabel: string | null;
  /** Nome da rede ("Mercado Livre", "Shopee", "Amazon"...). */
  store: string;
  /** Loja/vendedor que dá ESTE preço (dono, 2026-11-11): destaque no card. null = não informado. */
  sellerName?: string | null;
  isAmazon: boolean;
  /** Só Amazon com PRICE_AMAZON_MODE=on (games): a média das stats inclui a Amazon. 'market' = média do mercado; 'amazon' = produto só na Amazon (média na Amazon). */
  amazonAvg?: 'market' | 'amazon' | null;
  priceCents: number;
  /** Última confirmação do preço (carimbo do rodapé). */
  checkedAt: Date;
  /** URL da capa (affiliate_offers.image_url); null = card sem capa. */
  imageUrl: string | null;
  /** Hoje em America/Sao_Paulo (YYYY-MM-DD). */
  today: string;
  stats: OfferCardStats;
}

export type InsightKind = 'new_record' | 'drop' | 'below_avg' | 'near_record' | 'equal_record';
export interface Insight {
  kind: InsightKind;
  text: string;
}

/** '2026-11-10' -> '10/11'. */
export function dayShort(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

function prevDayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Reais inteiros arredondados com milhar: 18734 -> "R$ 187"; 123456 -> "R$ 1.235". */
export function formatReaisRounded(cents: number): string {
  const r = Math.round(Math.abs(cents) / 100);
  return `R$ ${String(r).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Percentual inteiro (mínimo 1 quando a diferença é positiva). */
function pctInt(pct: number): string {
  return `${Math.max(1, Math.round(pct))}%`;
}

/**
 * Escolhe UM insight, em ordem de prioridade:
 *  1. novo menor registrado (preço < menor diário medido antes de hoje; série >= 3 dias; não vale para Amazon);
 *  2. queda >= 5% contra o último preço da PRÓPRIA oferta (vale para Amazon, só histórico dela mesma);
 *  3. >= 10% abaixo da média única das lojas (>= 3 ofertas; não vale para Amazon);
 *  4. perto do menor registrado (até 3% acima, ou igual; não vale para Amazon);
 *  5. omitir (null).
 */
export function chooseInsight(input: OfferCardInput): Insight | null {
  const p = input.priceCents;
  if (!(p > 0)) return null;
  const s = input.stats;
  const serieOk = !input.isAmazon && s.recordCents != null && s.recordCents > 0 && s.measuredDays >= OFFER_CARD_MIN_DAYS && s.seriesFirstDay != null;

  if (serieOk && p < (s.recordCents as number)) {
    return { kind: 'new_record', text: `Menor preço desde ${dayShort(s.seriesFirstDay as string)}` };
  }
  if (s.prev && s.prev.cents > 0 && p < s.prev.cents) {
    const pct = ((s.prev.cents - p) / s.prev.cents) * 100;
    if (pct >= INSIGHT_DROP_MIN_PCT) {
      const since = s.prev.day === prevDayOf(input.today) ? 'desde ontem' : `desde ${dayShort(s.prev.day)}`;
      return { kind: 'drop', text: `Caiu ${pctInt(pct)} ${since}` };
    }
  }
  const amzAvg = input.isAmazon ? input.amazonAvg ?? null : null;
  if ((!input.isAmazon || amzAvg) && s.avgCents != null && s.avgCents > 0 && s.distinctOffers >= INSIGHT_MIN_OFFERS_FOR_AVG && p < s.avgCents) {
    const pct = ((s.avgCents - p) / s.avgCents) * 100;
    // Amazon nunca diz "média das lojas": 'market' = do mercado; 'amazon' (produto só na Amazon) = média na Amazon.
    const label = amzAvg === 'amazon' ? 'média na Amazon' : amzAvg === 'market' ? 'média do mercado' : 'média das lojas';
    if (pct >= INSIGHT_BELOW_AVG_MIN_PCT) return { kind: 'below_avg', text: `${formatReaisRounded(s.avgCents - p)} abaixo da ${label}` };
  }
  if (serieOk) {
    const rec = s.recordCents as number;
    if (p === rec) return { kind: 'equal_record', text: 'Igual ao menor preço registrado' };
    const pct = ((p - rec) / rec) * 100;
    if (pct > 0 && pct <= INSIGHT_NEAR_MIN_PCT) return { kind: 'near_record', text: `A ${pctInt(pct)} do menor preço registrado` };
  }
  return null;
}

/** Fecha o insight em uma linha (nunca passa de INSIGHT_MAX_CHARS). */
export function fitInsight(text: string | null): string | null {
  if (!text) return null;
  return truncateTitle(text, INSIGHT_MAX_CHARS);
}

/** "no Mercado Livre", "na Amazon", "na Shopee", "no Magalu"; desconhecida: "em {nome}". */
export function storePhrase(store: string): string {
  const n = store.trim();
  const k = n.toLowerCase();
  if (k === 'amazon' || k === 'shopee') return `na ${n}`;
  if (k === 'mercado livre' || k === 'magalu' || k === 'magazine luiza') return `no ${n}`;
  return `em ${n}`;
}

/** Carimbo do rodapé: "Conferido em 11/11 às 09:41 (Brasília)". */
export function stampLine(d: Date): string {
  return `Conferido em ${formatStamp(d)} (Brasília)`;
}

/** Preço de uma oferta ainda vale como "vivo"? (idade da confirmação e preço positivo) */
export function isFreshForCard(priceCents: number, checkedAt: Date, isAmazon: boolean, now: Date): boolean {
  if (!(priceCents > 0)) return false;
  const age = now.getTime() - checkedAt.getTime();
  return age >= -60_000 && age <= (isAmazon ? OFFER_CARD_MAX_AGE_AMAZON_MS : OFFER_CARD_MAX_AGE_MS);
}

// ------------------------------------------------------------------------------------------------
// Geometria (pixels, 1080x1080)
// ------------------------------------------------------------------------------------------------

const PAD = 64;
export const OFFER_GEOM = {
  pad: PAD,
  logoH: 60,
  logoW: Math.round((60 * 4220) / 1568),
  logoTop: 50,
  panel: { x: PAD, y: 138, w: OFFER_CARD_SIZE - 2 * PAD, h: 480 },
  panelPad: 28,
  titleTop: 646,
  titleFont: 38,
  titleLine: 48,
  priceTop: 756,
  priceBoxH: 150,
  insightTop: 926,
  insightFont: 34,
  footerTop: 1000,
  contentW: OFFER_CARD_SIZE - 2 * PAD,
} as const;

/** Nome da loja para exibir: sem URL, sem _ , até 26 caracteres. Igual ao nome da rede ou vazio = null. */
export function sellerLabel(raw: string | null | undefined, network?: string): string | null {
  let s = (raw ?? '').replace(/https?:\/\/\S+/gi, ' ').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 2) return null;
  if (network && s.toLowerCase().replace(/\.com(\.br)?$/, '') === network.trim().toLowerCase()) return null;
  if (s.length > 26) s = `${s.slice(0, 25).trimEnd()}…`;
  return s;
}

/** Tamanho do preço: o maior (até 140) em que preço + loja cabem lado a lado na largura útil. */
export function priceFontSize(priceText: string, storeText: string, contentW: number = OFFER_GEOM.contentW): { price: number; store: number } {
  const store = 30;
  const storeW = storeText.length * store * 0.56 + 24;
  const fit = Math.floor((contentW - storeW) / (priceText.length * 0.6));
  return { price: Math.max(72, Math.min(140, fit)), store };
}

/** Caixa (contain) da capa dentro do painel: devolve a área útil; a imagem é desenhada com objectFit contain. */
export function coverBox(): { x: number; y: number; w: number; h: number } {
  const g = OFFER_GEOM;
  return { x: g.panel.x + g.panelPad, y: g.panel.y + g.panelPad, w: g.panel.w - 2 * g.panelPad, h: g.panel.h - 2 * g.panelPad };
}

/** Texto alternativo (acessibilidade e fallback da mensagem). */
export function buildOfferAlt(input: OfferCardInput, insight: string | null): string {
  const parts = [
    `${truncateTitle(input.title, 120)}${input.platformLabel ? ` (${input.platformLabel})` : ''}`,
    `${formatMoney(input.priceCents)} ${storePhrase(input.store)}.`,
    insight ? `${insight}.` : '',
    stampLine(input.checkedAt) + '.',
  ];
  return parts.filter(Boolean).join(' ');
}

export { formatPct };

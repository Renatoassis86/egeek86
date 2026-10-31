/**
 * Funções PURAS de veredito de preço (sem I/O, sem server-only: servem a
 * server e client components). Alimentadas por `MasterProductPriceStats`
 * (src/server/queries/product-price-stats.ts). Decisões do dono em
 * docs/08-decisoes-adr/0001-fonte-unica-estatistica-de-preco.md.
 *
 * Nunca inventa valor: histórico curto => `insufficient`, sem preencher.
 */

/** Mínimo de cotações reais para exibir selo e veredito. */
export const MIN_QUOTES_FOR_VERDICT = 5;
/** Mínimo de dias de histórico (primeira à última cotação) para exibir selo e veredito. */
export const MIN_HISTORY_DAYS_FOR_VERDICT = 14;
/** Faixa "em linha com o normal": +-5% da média única. */
export const INLINE_BAND_PERCENT = 5;
/** Preço-alvo sugerido do alerta: menor preço histórico + 5%. */
export const SUGGESTED_TARGET_MARKUP_PERCENT = 5;

/**
 * ADR 0002 (piso de plausibilidade e frescor das ofertas PÚBLICAS). Constantes
 * únicas: server (SQL em src/server/queries/public-offers.ts) e UI leem daqui.
 */
/** Oferta só é pública com última coleta real em até N dias. */
export const OFFER_FRESHNESS_DAYS = 7;
/** Oferta abaixo desse % da mediana do produto é descartada do público (quando há >= PLAUSIBILITY_MIN_OFFERS). */
export const PLAUSIBILITY_FLOOR_PERCENT = 35;
/** Nº mínimo de ofertas ativas e frescas do produto para a mediana valer como régua. */
export const PLAUSIBILITY_MIN_OFFERS = 3;
/** "Preço em queda": queda mínima (%) entre o preço anterior confirmado e o atual. */
export const PRICE_DROP_MIN_PERCENT = INLINE_BAND_PERCENT;
/** "Preço em queda": a mudança de preço precisa ter no máximo N dias. */
export const PRICE_DROP_WINDOW_DAYS = 7;

export interface HistorySufficiencyInput {
  quoteCount: number;
  historyDays: number;
}

export type InsufficientReason = 'few_quotes' | 'short_history' | 'few_quotes_and_short_history';

export interface Eligibility {
  eligible: boolean;
  /** Preenchido quando !eligible; a UI diz "histórico curto" sem preencher nada. */
  reason: InsufficientReason | null;
  quoteCount: number;
  historyDays: number;
  minQuotes: number;
  minDays: number;
}

/** Elegível = >= 5 cotações E >= 14 dias de histórico. */
export function checkEligibility({ quoteCount, historyDays }: HistorySufficiencyInput): Eligibility {
  const fewQuotes = quoteCount < MIN_QUOTES_FOR_VERDICT;
  const shortHistory = historyDays < MIN_HISTORY_DAYS_FOR_VERDICT;
  return {
    eligible: !fewQuotes && !shortHistory,
    reason: fewQuotes && shortHistory ? 'few_quotes_and_short_history' : fewQuotes ? 'few_quotes' : shortHistory ? 'short_history' : null,
    quoteCount,
    historyDays,
    minQuotes: MIN_QUOTES_FOR_VERDICT,
    minDays: MIN_HISTORY_DAYS_FOR_VERDICT,
  };
}

export type VerdictKind = 'below' | 'inline' | 'above' | 'insufficient';

export interface PriceVerdict {
  kind: VerdictKind;
  /** current - avg, em centavos (negativo = abaixo do normal). null se insufficient. */
  deltaCents: number | null;
  /** (current - avg) / avg * 100, 1 casa decimal. null se insufficient. */
  deltaPercent: number | null;
  eligibility: Eligibility;
}

export interface VerdictInput extends HistorySufficiencyInput {
  currentCents: number | null | undefined;
  /** Média única do produto (todas as lojas, todo o histórico, filtro 2x). */
  avgCents: number | null | undefined;
}

/**
 * Veredito contra a média única do PRODUTO. `inline` quando |delta| <= 5% da
 * média; `below`/`above` fora da faixa. Sem preço atual, sem média ou com
 * histórico curto => `insufficient`.
 */
export function computeVerdict(input: VerdictInput): PriceVerdict {
  const eligibility = checkEligibility(input);
  const { currentCents, avgCents } = input;
  if (!eligibility.eligible || !currentCents || currentCents <= 0 || !avgCents || avgCents <= 0) {
    return { kind: 'insufficient', deltaCents: null, deltaPercent: null, eligibility };
  }
  const deltaCents = currentCents - avgCents;
  const rawPercent = (deltaCents / avgCents) * 100;
  const deltaPercent = Math.round(rawPercent * 10) / 10;
  const kind: VerdictKind =
    Math.abs(rawPercent) <= INLINE_BAND_PERCENT ? 'inline' : rawPercent < 0 ? 'below' : 'above';
  return { kind, deltaCents, deltaPercent, eligibility };
}

export interface LowBadgeInput extends HistorySufficiencyInput {
  currentCents: number | null | undefined;
  /** Menor preço histórico do produto (inclui cotações de ofertas encerradas). */
  lowestCents: number | null | undefined;
}

/**
 * Selo "Menor preço já registrado": preço atual <= menor histórico (o menor
 * histórico já contém a cotação atual quando ela é a mais barata, então
 * igualdade é o caso normal de "estamos no mínimo"). Exige elegibilidade, o
 * que corrige o falso positivo de 1 snapshot (`isLowestEver` trivial).
 * Preço atual abaixo do menor registrado (cotação ainda não gravada) também
 * conta. Nunca retorna true sem histórico suficiente.
 */
export function computeLowBadge(input: LowBadgeInput): boolean {
  const { currentCents, lowestCents } = input;
  if (!checkEligibility(input).eligible) return false;
  if (!currentCents || currentCents <= 0 || !lowestCents || lowestCents <= 0) return false;
  return currentCents <= lowestCents;
}

export interface PriceDropInput extends HistorySufficiencyInput {
  currentCents: number | null | undefined;
  /** Preço anterior confirmado da oferta exibida (affiliate_offers.previous_price_cents). */
  previousCents: number | null | undefined;
  /** Quando o preço da oferta mudou pela última vez (ISO ou Date). */
  changedAt: string | Date | null | undefined;
  /** Injetável para teste; padrão = agora. */
  now?: Date;
}

export interface PriceDrop {
  /** Queda em % (1 casa), sempre positiva. */
  percent: number;
  fromCents: number;
  toCents: number;
  /** ISO da mudança de preço. */
  at: string;
}

/**
 * Selo "Preço em queda": só com histórico elegível (>= 5 cotações e >= 14
 * dias), queda real >= PRICE_DROP_MIN_PERCENT entre o preço anterior
 * confirmado e o atual, e mudança dentro de PRICE_DROP_WINDOW_DAYS. Caso
 * contrário null (a UI não mostra o selo). Substitui o `trend === 'down'`
 * trivial (últimos 2 snapshots de uma oferta isolada).
 */
export function computePriceDrop(input: PriceDropInput): PriceDrop | null {
  if (!checkEligibility(input).eligible) return null;
  const { currentCents, previousCents, changedAt } = input;
  if (!currentCents || currentCents <= 0 || !previousCents || previousCents <= currentCents || !changedAt) return null;
  const at = new Date(changedAt);
  const now = input.now ?? new Date();
  if (Number.isNaN(at.getTime()) || now.getTime() - at.getTime() > PRICE_DROP_WINDOW_DAYS * 86_400_000) return null;
  const percent = Math.round(((previousCents - currentCents) / previousCents) * 1000) / 10;
  if (percent < PRICE_DROP_MIN_PERCENT) return null;
  return { percent, fromCents: previousCents, toCents: currentCents, at: at.toISOString() };
}

/**
 * Preço-alvo sugerido para alerta: menor preço histórico + 5%, arredondado ao
 * centavo para cima. null sem menor histórico. Hoje é só constante/sugestão;
 * a UI de alerta com preço-alvo vem em etapa posterior.
 */
export function suggestTargetPriceCents(lowestCents: number | null | undefined): number | null {
  if (!lowestCents || lowestCents <= 0) return null;
  return Math.ceil((lowestCents * (100 + SUGGESTED_TARGET_MARKUP_PERCENT)) / 100);
}

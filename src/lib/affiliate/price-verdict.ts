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
/**
 * Zona de suspeita (parecer do Estatístico, 2026-11-01): cotação entre o piso
 * duro (35%) e este % da mediana continua nos indicadores, mas NÃO ganha o selo
 * "Menor preço já registrado" sem corroboração de outros vendedores.
 */
export const PLAUSIBILITY_SOFT_FLOOR_PERCENT = 50;
/** Corroboração: nº mínimo de vendedores distintos com preço dentro da banda abaixo (inclui o próprio). */
export const LOW_BADGE_MIN_DISTINCT_SELLERS = 2;
/** Banda de corroboração: +-10% do preço que pede o selo. */
export const LOW_BADGE_CORROBORATION_BAND_PERCENT = 10;
/** Teto SÓ dos agregados (média e máximo): cotação acima de N x a mediana do produto sai deles. Nunca vale para a oferta pública. */
export const AGGREGATE_CEILING_MEDIAN_MULTIPLE = 3;
/** Dispersão (máximo limpo / mínimo limpo) acima disso => baixa confiança: sem selo e sem "abaixo do normal". */
export const DISPERSION_LOW_CONFIDENCE_RATIO = 3;
/** Vendedor com menos vendas que isto (e sem power seller) não define o menor preço histórico nem ganha selo. */
export const SELLER_MIN_SALES_FOR_LOW = 10;
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
  /** true quando o produto é muito disperso: "abaixo do normal" foi rebaixado para "em linha" (aviso "preço muito disperso"). */
  lowConfidence?: boolean;
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
  /** Produto com dispersão alta (> DISPERSION_LOW_CONFIDENCE_RATIO): nunca "abaixo do normal". */
  lowConfidence?: boolean;
}

/** Texto único do veredito de 3 faixas. Tabela, cards e página usam só este. */
export function verdictLabel(kind: VerdictKind): { label: string; tone: 'good' | 'neutral' | 'warn' | 'muted' } {
  switch (kind) {
    case 'below':
      return { label: 'Abaixo do normal', tone: 'good' };
    case 'inline':
      return { label: 'Em linha com o normal', tone: 'neutral' };
    case 'above':
      return { label: 'Acima do normal', tone: 'warn' };
    default:
      return { label: 'Histórico curto', tone: 'muted' };
  }
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
  let kind: VerdictKind =
    Math.abs(rawPercent) <= INLINE_BAND_PERCENT ? 'inline' : rawPercent < 0 ? 'below' : 'above';
  const lowConfidence = input.lowConfidence === true;
  if (lowConfidence && kind === 'below') kind = 'inline';
  return { kind, deltaCents, deltaPercent, eligibility, ...(lowConfidence ? { lowConfidence: true } : {}) };
}

export interface LowBadgeInput extends HistorySufficiencyInput {
  currentCents: number | null | undefined;
  /** Menor preço histórico do produto (inclui cotações de ofertas encerradas). */
  lowestCents: number | null | undefined;
  /** Bloqueio vindo de `lowBadgeBlockReason` (isca, vendedor fraco, dispersão). true => sem selo. */
  blocked?: boolean;
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
  if (input.blocked) return false;
  if (!checkEligibility(input).eligible) return false;
  if (!currentCents || currentCents <= 0 || !lowestCents || lowestCents <= 0) return false;
  return currentCents <= lowestCents;
}

export type SellerTier = 'low' | 'unverified' | 'ok';

export interface SellerSignals {
  reputationLevel?: string | null;
  totalSales?: number | null;
  powerSellerStatus?: string | null;
}

/**
 * Confiança do vendedor para selo, destaque e menor preço histórico.
 * `low`: reputação vermelha/laranja, ou vendas conhecidas < SELLER_MIN_SALES_FOR_LOW sem power seller.
 * `unverified`: sem dado (Shopee, reputação ainda não buscada). NÃO é reputação baixa: não exclui nada.
 * `ok`: o resto. ESPELHA `weakSellerSql` (public-offers.ts); mexeu aqui, mexa lá.
 */
export function sellerTier(seller: SellerSignals | null | undefined): SellerTier {
  if (!seller) return 'unverified';
  const level = seller.reputationLevel ?? '';
  if (/(red|orange)$/.test(level)) return 'low';
  if (seller.powerSellerStatus) return 'ok';
  if (seller.totalSales != null && seller.totalSales < SELLER_MIN_SALES_FOR_LOW) return 'low';
  if (/(green|yellow)$/.test(level) || (seller.totalSales ?? 0) >= SELLER_MIN_SALES_FOR_LOW) return 'ok';
  return 'unverified';
}

/** Destaques de vitrine excluem só vendedor de reputação baixa (sem dado continua elegível). */
export function isHighlightEligibleSeller(seller: SellerSignals | null | undefined): boolean {
  return sellerTier(seller) !== 'low';
}

export type LowBadgeBlockReason = 'low_confidence' | 'weak_seller' | 'suspect_price';

export interface LowBadgeGuardInput {
  currentCents: number | null | undefined;
  /** Mediana das cotações do produto (só com régua, >= PLAUSIBILITY_MIN_OFFERS); null => sem zona de suspeita. */
  medianCents: number | null | undefined;
  lowConfidence: boolean;
  sellerTier: SellerTier;
  /** Vendedores distintos com preço dentro de +-10% do atual, contando o próprio. */
  corroboratingSellers: number;
}

/**
 * Por que o selo "Menor preço já registrado" NÃO vale (null = pode ganhar). A
 * oferta continua pública e comparável; só o selo é retido.
 */
export function lowBadgeBlockReason(i: LowBadgeGuardInput): LowBadgeBlockReason | null {
  if (i.lowConfidence) return 'low_confidence';
  if (i.sellerTier === 'low') return 'weak_seller';
  if (
    i.currentCents &&
    i.medianCents &&
    i.currentCents < (i.medianCents * PLAUSIBILITY_SOFT_FLOOR_PERCENT) / 100 &&
    i.corroboratingSellers < LOW_BADGE_MIN_DISTINCT_SELLERS
  ) {
    return 'suspect_price';
  }
  return null;
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

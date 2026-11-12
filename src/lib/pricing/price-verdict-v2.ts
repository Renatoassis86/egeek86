// Leitura V2 do preço: fatos (preço agora vs mediana das lojas hoje), juízo (DESLIGADO por config até o backtest),
// base de dados e estado de histórico curto. Módulo PURO (sem banco, sem server-only): testável sem rede.
// Base: mesmas ofertas e mesmo preço oferta-dia do gráfico e das tabelas sombra (ADR 0004, emenda 2026-11-05).
// Decisões do dono (2026-11-05): D-A (mediana das lojas como fato; juízo só pela série de mínimos diários de 30 dias, após backtest).
import { MIN_DISTINCT_OFFERS_FOR_VERDICT, MIN_OFFER_DAYS_FOR_VERDICT, MIN_SPAN_DAYS_FOR_VERDICT, addDays, inBand, medianCont, plausibleBand } from '@/lib/pricing/daily-state';
import {
  CORROBORATION_BAND_PERCENT,
  CORROBORATION_RECHECK_MIN_MS,
  JUDGEMENT_HYSTERESIS_FRACTION,
  JUDGEMENT_MAD_K,
  JUDGEMENT_MEASURED_WINDOW_DAYS,
  JUDGEMENT_MIN_BAND_PERCENT,
  JUDGEMENT_MIN_DAYS_FOR_PERCENTILE,
  JUDGEMENT_MIN_MEASURED_DAYS,
} from '@/lib/pricing/price-metrics-config';

export type ShortReason = 'ofertas_distintas' | 'oferta_dias' | 'historico_dias';

export interface PeriodSufficiency {
  /** Ofertas distintas com preço oferta-dia na janela. */
  distinctOffers: number;
  /** Oferta-dias (uma oferta, um dia). */
  offerDays: number;
  /** Dias corridos entre o primeiro e o último dia com dado. */
  spanDays: number;
}

/** Suficiência do período (>= 3 ofertas distintas, >= 5 oferta-dias e >= 14 dias; constantes de daily-state.ts). */
export function periodShortReasons(p: PeriodSufficiency): ShortReason[] {
  const r: ShortReason[] = [];
  if (p.distinctOffers < MIN_DISTINCT_OFFERS_FOR_VERDICT) r.push('ofertas_distintas');
  if (p.offerDays < MIN_OFFER_DAYS_FOR_VERDICT) r.push('oferta_dias');
  if (p.spanDays < MIN_SPAN_DAYS_FOR_VERDICT) r.push('historico_dias');
  return r;
}

// ------------------------------------------------------------------------------------------------
// Fato: preço agora vs mediana das lojas HOJE (vale desde o primeiro dia, não depende de histórico)
// ------------------------------------------------------------------------------------------------

export interface StoreOffer {
  /** Vendedor quando existe, senão a rede (mesma chave de loja do estado do dia). */
  storeKey: string;
  priceCents: number;
  /** Oferta "fora da média" (0044): quem filtra a comparação usa este campo; `storesToday` em si não o lê. */
  avgExcluded?: boolean;
}

/** Mediana entre lojas só existe com 3 ou mais lojas DISTINTAS: com 2, a "mediana" é o ponto médio e um preço baixo vira "43% abaixo" por construção. */
export const MIN_STORES_FOR_MEDIAN = 3;

export interface StoresToday {
  /** Lojas DISTINTAS (storeKey) com preço fresco, dentro da faixa plausível. Nunca anúncios. */
  storeCount: number;
  /** Mediana dos menores preços de cada loja. null com menos de MIN_STORES_FOR_MEDIAN lojas distintas. */
  medianCents: number | null;
  /** Menor preço de cada loja (centavos), crescente. */
  storePrices: number[];
}

export function storesToday(offers: StoreOffer[]): StoresToday {
  const valid = offers.filter((o) => o.priceCents > 0);
  const band = plausibleBand(valid.map((o) => o.priceCents));
  const best = new Map<string, number>();
  for (const o of valid) {
    if (!inBand(o.priceCents, band)) continue;
    const cur = best.get(o.storeKey);
    if (cur == null || o.priceCents < cur) best.set(o.storeKey, o.priceCents);
  }
  const prices = [...best.values()].sort((a, b) => a - b);
  const median = prices.length >= MIN_STORES_FOR_MEDIAN ? medianCont(prices) : null;
  return { storeCount: prices.length, medianCents: median != null ? Math.round(median) : null, storePrices: prices };
}

export interface StoreComparison {
  /** Percentual INTEIRO (arredondado) do preço agora contra a mediana das lojas hoje; negativo = abaixo. */
  percent: number;
  /** Percentual com uma casa decimal (para o texto "praticamente igual (-0,5%)"). */
  exactPercent: number;
  /** 'equal' = diferença realmente zero; 'near' = diferença não nula que arredonda para 0%. */
  direction: 'below' | 'equal' | 'near' | 'above';
}

export function compareToStoresMedian(currentCents: number | null, medianCents: number | null): StoreComparison | null {
  if (!currentCents || !medianCents || currentCents <= 0 || medianCents <= 0) return null;
  const raw = ((currentCents - medianCents) / medianCents) * 100;
  const percent = Math.round(raw) || 0;
  const exactPercent = Math.round(raw * 10) / 10 || 0;
  const direction = currentCents === medianCents ? 'equal' : percent === 0 ? 'near' : percent < 0 ? 'below' : 'above';
  return { percent, exactPercent, direction };
}

/** "-0,5%" / "+0,3%" (vírgula decimal, sinal explícito). */
export function formatSignedPercent1(v: number): string {
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v < 0 ? '-' : '+'}${s}%`;
}

/**
 * A frase de decisão do topo (UMA frase de fato, sem juízo). Sem comparação possível, diz por quê.
 * Menos de 3 lojas ou menor preço de vendedor de baixa reputação: nunca um percentual contra a mediana (só os fatos).
 */
export function decisionSentence(cmp: StoreComparison | null, storeCount: number, opts: { weakHolder?: boolean } = {}): string {
  if (storeCount <= 1) return 'Só uma loja com preço verificado hoje: ainda não há comparação entre lojas.';
  if (storeCount < MIN_STORES_FOR_MEDIAN) return `Só ${storeCount} lojas com preço verificado hoje: a comparação com a mediana das lojas exige ${MIN_STORES_FOR_MEDIAN}.`;
  if (opts.weakHolder) return 'O menor preço é de vendedor de baixa reputação: não comparamos em percentual com a mediana das lojas.';
  if (!cmp) return 'Sem comparação entre lojas hoje.';
  if (cmp.direction === 'equal') return 'Igual à mediana das lojas hoje.';
  if (cmp.direction === 'near') return `Praticamente igual à mediana das lojas hoje (${formatSignedPercent1(cmp.exactPercent)}).`;
  return `${Math.abs(cmp.percent)}% ${cmp.direction === 'below' ? 'abaixo' : 'acima'} da mediana das lojas hoje.`;
}

/**
 * Períodos 30d / 90d / tudo coincidem quando todos cobrem os MESMOS dias medidos (histórico mais curto que a menor janela):
 * as três colunas seriam idênticas, então a tela mostra uma só ("Período medido (N dias)").
 */
export function periodsCoincide(p: { d30: { coveredDays: number; offerDays: number } | null; d90: { coveredDays: number; offerDays: number } | null; all: { coveredDays: number; offerDays: number } | null }): boolean {
  const { d30, d90, all } = p;
  if (!d30 || !d90 || !all || all.coveredDays <= 0) return false;
  return d30.coveredDays === all.coveredDays && d90.coveredDays === all.coveredDays && d30.offerDays === all.offerDays && d90.offerDays === all.offerDays;
}

// ------------------------------------------------------------------------------------------------
// Juízo (DESLIGADO por VERDICT_JUDGEMENT_ENABLED até o backtest): série dos mínimos diários de 30 dias
// ------------------------------------------------------------------------------------------------

export type JudgementKind = 'below' | 'normal' | 'above';
export type JudgementTone = 'success' | 'neutral' | 'warn';

/** Exatamente três níveis (ata 2026-11-05). */
export const JUDGEMENT_LABEL: Record<JudgementKind, { label: string; tone: JudgementTone }> = {
  below: { label: 'Abaixo do usual', tone: 'success' },
  normal: { label: 'Preço normal', tone: 'neutral' },
  above: { label: 'Acima do usual', tone: 'warn' },
};

const MAD_TO_SIGMA = 1.4826;

/** Mediana e dispersão robusta relativa (MAD escalado / mediana), em %. null sem série ou com mediana <= 0. */
export function robustDispersion(values: number[]): { medianCents: number; madCents: number; relativePercent: number } | null {
  if (!values.length) return null;
  const med = medianCont(values);
  if (med == null || med <= 0) return null;
  const mad = medianCont(values.map((v) => Math.abs(v - med))) ?? 0;
  return { medianCents: med, madCents: mad, relativePercent: ((MAD_TO_SIGMA * mad) / med) * 100 };
}

/** Limiar INTEIRO (%) = max(piso, k x dispersão robusta relativa), arredondado para cima. */
export function judgementThresholdPercent(values: number[], k: number = JUDGEMENT_MAD_K, minBand: number = JUDGEMENT_MIN_BAND_PERCENT): number {
  const d = robustDispersion(values);
  return Math.ceil(Math.max(minBand, d ? k * d.relativePercent : 0) - 1e-9);
}

/** Frase de uma linha que explica o limiar ao cliente. */
export function thresholdExplanation(thresholdPercent: number, minBand: number = JUDGEMENT_MIN_BAND_PERCENT): string {
  return thresholdPercent <= minBand
    ? `Limiar de ${thresholdPercent}%: faixa mínima em torno da mediana dos menores preços dos últimos 30 dias.`
    : `Limiar de ${thresholdPercent}%: este produto oscila mais que o normal, então a faixa de "usual" é maior que ${minBand}%.`;
}

/** Dias (dentre os últimos `windowDays` até `lastDay`) com pelo menos `minStores` lojas DISTINTAS. */
export function countMeasuredDays(days: Array<{ day: string; nStores: number }>, lastDay: string, windowDays: number, minStores: number): number {
  const from = addDays(lastDay, -(windowDays - 1));
  return days.filter((d) => d.day >= from && d.day <= lastDay && d.nStores >= minStores).length;
}

export type JudgementReason = 'sem_preco_atual' | 'dias_medidos' | 'serie_curta';

export interface JudgementInput {
  currentCents: number | null;
  /** Mínimo diário de cada dia dos últimos 30 dias, SEM o dia de hoje (o preço agora é comparado com o passado). */
  dailyMinsCents: number[];
  /** Dias medidos com >= 3 lojas distintas dentre os últimos 14 (ver countMeasuredDays). */
  measuredDays: number;
  /** Rótulo anterior (histerese). null = sem estado anterior. */
  previousKind?: JudgementKind | null;
  currentHolderIsWeak: boolean;
  weakIncludedInLows: boolean;
  /** Resultado de isLowestCorroborated. */
  corroborated: boolean;
  k?: number;
  minBand?: number;
  hysteresisFraction?: number;
  minMeasuredDays?: number;
}

export interface Judgement {
  /** false = sem juízo (o motivo está em `reasons`; nada é preenchido). */
  ready: boolean;
  reasons: JudgementReason[];
  kind: JudgementKind | null;
  label: string | null;
  tone: JudgementTone | null;
  /** Percentual INTEIRO contra a mediana dos mínimos diários; negativo = abaixo. */
  deltaPercent: number | null;
  thresholdPercent: number | null;
  medianMinsCents: number | null;
  /** "Mais barato que X% dos dias": só com >= 10 dias de mínimos. */
  cheaperThanPercent: number | null;
  /** "O menor de N dias": preço agora <= menor da série (usado antes de haver 10 dias para o percentil). */
  lowestOfDays: number | null;
  seriesDays: number;
  /** Selo "Menor preço do período": abaixo do usual, <= menor da série, sem vendedor fraco e COM corroboração. */
  lowestPeriod: boolean;
}

function notReady(reasons: JudgementReason[], seriesDays: number): Judgement {
  return {
    ready: false, reasons, kind: null, label: null, tone: null, deltaPercent: null, thresholdPercent: null,
    medianMinsCents: null, cheaperThanPercent: null, lowestOfDays: null, seriesDays, lowestPeriod: false,
  };
}

/**
 * Juízo do preço AGORA contra a série dos mínimos diários de 30 dias (decisão D-A).
 *  - exige >= 10 dos últimos 14 dias medidos com >= 3 lojas distintas, preço atual e série de pelo menos o mesmo tamanho;
 *  - delta = (agora - mediana da série) / mediana, em percentual INTEIRO; limiar = max(5%, k x MAD/mediana), inteiro;
 *  - 3 níveis: abaixo (<= -limiar), normal, acima (>= +limiar); histerese: quem já estava abaixo/acima só volta a "normal"
 *    quando o desvio recua `fração x limiar` (pelo menos 1 ponto) de dentro do limiar;
 *  - percentil ("mais barato que X% dos dias") só com >= 10 dias de mínimos; antes disso, "o menor de N dias";
 *  - "Menor preço do período" só com corroboração, sem vendedor fraco (salvo config) e no nível 'abaixo'.
 */
export function computeJudgement(i: JudgementInput): Judgement {
  const series = i.dailyMinsCents.filter((v) => v > 0);
  const minDays = i.minMeasuredDays ?? JUDGEMENT_MIN_MEASURED_DAYS;
  const reasons: JudgementReason[] = [];
  if (!i.currentCents || i.currentCents <= 0) reasons.push('sem_preco_atual');
  if (i.measuredDays < minDays) reasons.push('dias_medidos');
  if (series.length < minDays) reasons.push('serie_curta');
  if (reasons.length) return notReady(reasons, series.length);

  const current = i.currentCents as number;
  const disp = robustDispersion(series);
  if (!disp) return notReady(['serie_curta'], series.length);
  const T = judgementThresholdPercent(series, i.k ?? JUDGEMENT_MAD_K, i.minBand ?? JUDGEMENT_MIN_BAND_PERCENT);
  const delta = Math.round(((current - disp.medianCents) / disp.medianCents) * 100);
  const h = Math.max(1, Math.round(T * (i.hysteresisFraction ?? JUDGEMENT_HYSTERESIS_FRACTION)));
  let kind: JudgementKind = delta <= -T ? 'below' : delta >= T ? 'above' : 'normal';
  if (kind === 'normal') {
    if (i.previousKind === 'below' && delta <= -(T - h)) kind = 'below';
    else if (i.previousKind === 'above' && delta >= T - h) kind = 'above';
  }
  const n = series.length;
  const seriesMin = Math.min(...series);
  const cheaperThan = n >= JUDGEMENT_MIN_DAYS_FOR_PERCENTILE ? Math.round((series.filter((s) => s > current).length / n) * 100) : null;
  const lowestOfDays = n < JUDGEMENT_MIN_DAYS_FOR_PERCENTILE && current <= seriesMin ? n : null;
  const weakBlocks = i.currentHolderIsWeak && !i.weakIncludedInLows;
  const lowestPeriod = kind === 'below' && current <= seriesMin && current < disp.medianCents && !weakBlocks && i.corroborated;
  return {
    ready: true, reasons: [], kind, ...JUDGEMENT_LABEL[kind], deltaPercent: delta, thresholdPercent: T,
    medianMinsCents: Math.round(disp.medianCents), cheaperThanPercent: cheaperThan, lowestOfDays, seriesDays: n, lowestPeriod,
  };
}

export interface CorroborationInput {
  currentCents: number;
  /** Folga entre a última checagem e a última cotação da oferta que detém o preço (ms). null = sem dado. */
  holderRecheckGapMs: number | null;
  /** Os dois últimos preços gravados da oferta que detém o preço (mais recente primeiro). */
  holderLastPrices: number[];
  /** Preço (centavos) de cada OUTRA loja distinta com oferta fresca. */
  otherStorePricesCents: number[];
  bandPercent?: number;
  recheckMinMs?: number;
}

/**
 * Corroboração do "menor preço" (anti erro de anúncio): vale se (a) o preço foi gravado em 2 coletas seguidas, ou uma checagem
 * posterior à cotação o reconfirmou (a coleta só grava cotação quando o preço muda, então reconfirmação = checagem depois da cotação), ou
 * (b) outra loja distinta cobra até `bandPercent` acima do preço agora.
 */
export function isLowestCorroborated(i: CorroborationInput): boolean {
  const band = i.bandPercent ?? CORROBORATION_BAND_PERCENT;
  const recheck = i.recheckMinMs ?? CORROBORATION_RECHECK_MIN_MS;
  const twoSame = i.holderLastPrices.length >= 2 && i.holderLastPrices[0] === i.currentCents && i.holderLastPrices[1] === i.currentCents;
  const rechecked = i.holderRecheckGapMs != null && i.holderRecheckGapMs >= recheck;
  const secondStore = i.otherStorePricesCents.some((p) => p >= i.currentCents && p <= i.currentCents * (1 + band / 100));
  return twoSame || rechecked || secondStore;
}

// ------------------------------------------------------------------------------------------------
// Base de dados (substitui "confiança"): ampla / média / pequena, com n e faixa observada
// ------------------------------------------------------------------------------------------------

export type DataBaseLevel = 'none' | 'small' | 'medium' | 'large';

export const DATA_BASE_LABEL: Record<DataBaseLevel, string> = {
  none: 'Sem dado',
  small: 'Pequena',
  medium: 'Média',
  large: 'Ampla',
};

export interface DataBaseInput {
  hasCurrent: boolean;
  /** Dias medidos com >= 3 lojas distintas nos últimos 30 dias. */
  measuredDays30: number;
  /** Lojas distintas com preço fresco hoje. */
  storesToday: number;
  /** Ofertas frescas hoje. */
  freshOffers: number;
}

/** pequena: menos de 3 lojas hoje ou menos de 7 dias medidos; ampla: >= 20 dias medidos, >= 3 lojas e >= 5 ofertas; média: o resto. */
export function computeDataBase(i: DataBaseInput): DataBaseLevel {
  if (!i.hasCurrent) return 'none';
  if (i.storesToday < 3 || i.measuredDays30 < 7) return 'small';
  if (i.measuredDays30 >= 20 && i.freshOffers >= 5) return 'large';
  return 'medium';
}

export interface ObservedRange {
  minCents: number;
  maxCents: number;
  days: number;
}

/** Faixa observada dos menores preços diários (fato, sem estimativa). */
export function observedRange(dailyMinsCents: number[]): ObservedRange | null {
  const v = dailyMinsCents.filter((x) => x > 0);
  if (!v.length) return null;
  return { minCents: Math.min(...v), maxCents: Math.max(...v), days: v.length };
}

/**
 * Data estimada de liberação do juízo: só se calculável. Precisa de um produto que HOJE já tenha >= 3 lojas (os próximos
 * dias tendem a qualificar) e do juízo ligado; senão null (não se chuta data). Conta 1 dia medido por dia a partir de hoje.
 */
export function estimateUnlockDay(opts: { measuredDays: number; today: string; qualifiesToday: boolean; needed?: number; windowDays?: number }): string | null {
  const needed = opts.needed ?? JUDGEMENT_MIN_MEASURED_DAYS;
  const windowDays = opts.windowDays ?? JUDGEMENT_MEASURED_WINDOW_DAYS;
  if (opts.measuredDays >= needed) return null;
  if (!opts.qualifiesToday || needed > windowDays) return null;
  const missing = needed - opts.measuredDays;
  // Hoje já conta se qualifica e ainda não entrou em measuredDays (o chamador conta só dias fechados); o próximo marco é hoje + (faltam - 1).
  return addDays(opts.today, Math.max(0, missing - 1));
}

// ------------------------------------------------------------------------------------------------
// Aviso de vendedor fraco nos mínimos (curto)
// ------------------------------------------------------------------------------------------------

export type WeakSellerNotice = 'none' | 'footer' | 'prominent';

export interface WeakSellerNoticeInput {
  /** Preço agora (centavos). null = sem oferta fresca. */
  nowCents: number | null;
  /** Menor preço dos últimos 30 dias (já aplicada a regra do vendedor fraco). null = sem dado. */
  low30Cents: number | null;
  /** Os mínimos ignoram vendedor fraco (config). */
  weakExcluded: boolean;
  /** Excluir o vendedor fraco de fato mudou algum mínimo (30d, 90d ou de sempre) em relação a incluí-lo. */
  weakChangedLows: boolean;
}

/**
 * Aviso de "mínimos ignoram vendedor de baixa reputação". Só existe quando há dado e a regra de fato alterou um mínimo:
 *  - 'prominent': preço agora < menor de 30 dias (o cliente vê um preço abaixo do "menor" e precisa saber por quê);
 *  - 'footer': a regra alterou algum mínimo mas o preço agora não está abaixo do menor de 30 dias;
 *  - 'none': regra desligada, sem dado ou sem efeito (não se avisa de regra que não mudou nada).
 */
export function weakSellerNotice(i: WeakSellerNoticeInput): WeakSellerNotice {
  if (!i.weakExcluded || !i.weakChangedLows) return 'none';
  if (i.nowCents != null && i.low30Cents != null && i.nowCents < i.low30Cents) return 'prominent';
  return 'footer';
}

/** Frase do último evento do menor preço (topo do bloco V2): só fatos do evento, sem afirmar nada sobre a oferta atual. */
export function lastEventSentence(e: { cents: number; prevCents: number | null; store: string | null }, atLabel: string, brl: (cents: number) => string): string {
  return `Último evento do menor preço: ${brl(e.cents)} em ${atLabel}${e.store ? ` (${e.store})` : ''}${e.prevCents != null ? `, antes ${brl(e.prevCents)}` : ' (primeiro registro)'}.`;
}

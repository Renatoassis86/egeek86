// Módulo PURO (sem banco, sem server-only): a REGRA ÚNICA de elegibilidade e cálculo das métricas de preço
// por oferta-dia, do estado diário do produto e dos eventos do menor preço. Job, backfill, gancho da coleta
// e script de comparação em sombra usam SÓ estas funções (ADR 0004, emenda de 2026-11-05).
import {
  AGGREGATE_CEILING_MEDIAN_MULTIPLE,
  OFFER_FRESHNESS_DAYS,
  PLAUSIBILITY_FLOOR_PERCENT,
  PLAUSIBILITY_MIN_OFFERS,
} from '@/lib/affiliate/price-verdict';

/**
 * ============================================================================================
 * FÓRMULAS (dia civil = America/Sao_Paulo; nada é interpolado, lacuna fica lacuna)
 * ============================================================================================
 * Elegibilidade da OFERTA (aplicada no SQL por `src/server/pricing/eligibility-sql.ts`, mesma regra do site):
 *   item novo + identidade visível (sem Open Box/usado/cross-gen), fora de quarentena (`quarantined_at`),
 *   (oferta com `avg_excluded_at` segue visível: conta no mínimo/máximo, NÃO na média/mediana/n_offers/members),
 *   produto aprovado pelo porteiro do catálogo, preço > 0.
 *
 * Preço da oferta no dia (cada oferta vale 1, não importa quantas vezes foi coletada):
 *   - com cotação medida no dia: MEDIANA do dia = percentile_disc(0.5) (preço realmente observado);
 *   - sem cotação no dia: carry-forward do ÚLTIMO preço medido, SÓ se a oferta está "fresca" (última cotação
 *     há no máximo FRESH_MAX_AGE_MS = 48 h no instante de referência) e "viva" (status ativo agora, ou
 *     com cotação posterior ao instante de referência: oferta expirada não ressuscita).
 *   - "ativa no dia" = teve cotação nos OFERTA_ACTIVE_DAYS (7) dias até o instante de referência;
 *     "stale" = ativa no dia mas última cotação há mais de 48 h: é contada (stale_offers) e NÃO entra em
 *     média, mínimo nem mediana.
 *   - instante de referência = min(agora, fim do dia). Dia fechado usa o fim do dia.
 *
 * Faixa plausível (só com >= PLAUSIBILITY_MIN_OFFERS (3) ofertas frescas no dia; sem régua, passa):
 *   piso ESTRITO preço > 35 % da mediana das ofertas frescas, teto preço <= 3x essa mediana
 *   (mesmas constantes de price-verdict.ts). Oferta fora da faixa vira `outlier_offers`.
 *
 * Do dia (sobre as ofertas frescas e plausíveis, N = n_offers):
 *   avg_cents (M_d) = MÉDIA SIMPLES dos preços oferta-dia (soma dos preços / N), SÓ com N >= 3 (senão NULL);
 *   median_offer_day_cents = mediana (contínua, igual a `medianSql`) dos mesmos preços (grava com N >= 1);
 *   min_cents    = MÍNIMO das cotações BRUTAS elegíveis do dia (mínimo medido de cada oferta; se esse
 *                  mínimo bruto cai fora da faixa plausível, vale a mediana do dia da oferta, que já passou);
 *                  oferta só carregada contribui com o último preço conhecido;
 *   max_cents    = análogo (máximo bruto dentro do teto);
 *   n_stores     = lojas/vendedores distintos entre as N ofertas; n_quotes = cotações brutas medidas no dia.
 * Qualidade: gap (0 ofertas frescas: tudo nulo, a lacuna aparece como lacuna), partial (1 a 2 ofertas:
 * grava mínimo e mediana, média NULL), complete (3 ou mais), legacy (dia anterior a PRICE_DAILY_REGIME_START: regime de coleta antigo,
 * só contagem, sem recalcular).
 *
 * Decomposição (Dutot encadeado) entre dias consecutivos d1 -> d2, C = ofertas presentes nos dois:
 *   M_C(t) = média simples dos preços de C no dia t;  matched_change_pct = M_C(d2) / M_C(d1) - 1;
 *   M2 - M1 = [M_C(2) - M_C(1)] + efeito composição;  composition_flag = |efeito composição| > 50 % de |M2 - M1|
 *   (só quando M1 e M2 existem, isto é, N >= 3 nos dois dias).
 * Média do PERÍODO = soma dos preços oferta-dia / nº de oferta-dias (ponderada por oferta-dia, NÃO a média das
 * médias diárias). Elegível a veredito: >= 3 ofertas distintas, >= 5 oferta-dias e >= 14 dias de histórico.
 */

/** Primeiro dia do regime atual de coleta (1 cotação por oferta por dia, confirmado em 2026-10-31). */
export const PRICE_DAILY_REGIME_START = '2026-10-31';
/** Oferta "fresca": última cotação há no máximo 48 h. */
export const FRESH_MAX_AGE_MS = 48 * 3600_000;
/** Oferta "ativa no dia": cotação nos últimos 7 dias (mesma janela pública OFFER_FRESHNESS_DAYS). */
export const OFFER_ACTIVE_DAYS = OFFER_FRESHNESS_DAYS;
const DAY_MS = 86_400_000;
const FLOOR = PLAUSIBILITY_FLOOR_PERCENT / 100;

/** Média do dia só com 3 ou mais ofertas (com menos, é a opinião de uma ou duas lojas). */
export const MIN_OFFERS_FOR_AVG = 3;
const NO_TRANSITION = { matchedOffers: null, matchedChangePct: null, compositionFlag: null } as const;

export type DayQuality = 'complete' | 'partial' | 'gap' | 'legacy';

/** Linha de `price_daily_offer` (uma oferta, um dia com cotação medida). */
export interface OfferDayRow {
  day: string; // YYYY-MM-DD (America/Sao_Paulo)
  medianCents: number;
  lastCents: number;
  minCents: number;
  maxCents: number;
  nCollected: number;
  lastObservedAt: Date;
}

/**
 * Frescor por CONFIRMAÇÃO de preço (ADR 0010, D2): a Amazon só grava cotação quando o preço MUDA, então a idade da última cotação não
 * diz se a oferta está viva. Com `freshness`, a idade passa a ser contada desde `confirmedAt` (last_price_confirmed_at, atualizado a
 * cada leitura da coleta assistida), com teto `maxAgeMs` (24 h). Premissa: entre a última cotação e a confirmação o preço não mudou
 * (se tivesse mudado, haveria cotação nova). Instante de referência anterior à confirmação conta como confirmado (idade 0).
 * Sem `freshness` (Mercado Livre, Shopee...): regra de sempre, 48 h desde a última cotação.
 */
export interface OfferFreshness {
  confirmedAt: Date;
  maxAgeMs: number;
}

/** Idade efetiva e teto de frescor da oferta no instante `ref` (ms). */
function ageOf(freshness: OfferFreshness | null | undefined, lastAt: Date, ref: number): { age: number; max: number } {
  if (!freshness) return { age: ref - lastAt.getTime(), max: FRESH_MAX_AGE_MS };
  const anchor = Math.max(lastAt.getTime(), Math.min(freshness.confirmedAt.getTime(), ref));
  return { age: ref - anchor, max: freshness.maxAgeMs };
}

export interface OfferInput {
  offerId: string;
  /** Oferta da rede Amazon (marcação para o modo sombra; não muda o cálculo). */
  isAmazon?: boolean;
  /** Frescor por confirmação (só Amazon, modo `on`). */
  freshness?: OfferFreshness | null;
  /** Chave da loja: vendedor quando existe, senão a rede (mesma chave da corroboração do selo). */
  storeKey: string;
  networkId?: string | null;
  sellerId?: string | null;
  /** Status 'active' agora. */
  active: boolean;
  /**
   * Oferta "fora da média" (affiliate_offers.avg_excluded_at, migration 0044): continua VISÍVEL (menor preço, máximo, lojas) mas NÃO
   * entra em média, mediana, n_offers, members nem na régua de plausibilidade. Ausente/false = comportamento de sempre.
   */
  avgExcluded?: boolean;
  rows: OfferDayRow[];
}

// ------------------------------------------------------------------------------------------------
// Dia civil
// ------------------------------------------------------------------------------------------------

const spFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia civil (YYYY-MM-DD) de um instante em America/Sao_Paulo. */
export function spDay(d: Date): string {
  return spFmt.format(d);
}

/**
 * Início e fim (exclusivo) do dia civil. O Brasil não tem horário de verão desde 2019 (Decreto 9.772), então
 * o deslocamento é fixo -03:00. O SQL do job usa `AT TIME ZONE 'America/Sao_Paulo'`; o teste confere os dois.
 */
export function spDayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00-03:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------------------------------------
// Estatística básica (uma definição só)
// ------------------------------------------------------------------------------------------------

/** percentile_disc(0.5): o valor observado na posição ceil(n/2) (mediana inferior). */
export function medianDisc(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.ceil(s.length / 2) - 1];
}

/** percentile_cont(0.5): igual a `medianSql` do site. */
export function medianCont(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Agrega as cotações medidas de UMA oferta em UM dia (equivale ao SQL do job). */
export function aggregateOfferDay(quotes: Array<{ priceCents: number; at: Date }>): Omit<OfferDayRow, 'day'> | null {
  const q = quotes.filter((x) => x.priceCents > 0);
  if (!q.length) return null;
  const byTime = [...q].sort((a, b) => a.at.getTime() - b.at.getTime());
  const prices = q.map((x) => x.priceCents);
  const last = byTime[byTime.length - 1];
  return {
    medianCents: medianDisc(prices) as number,
    lastCents: last.priceCents,
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
    nCollected: q.length,
    lastObservedAt: last.at,
  };
}

/** Faixa plausível sobre os preços frescos do dia. Sem régua (poucas ofertas) => tudo passa. */
export function plausibleBand(values: number[]): { applied: boolean; floor: number | null; ceiling: number | null; median: number | null } {
  if (values.length < PLAUSIBILITY_MIN_OFFERS) return { applied: false, floor: null, ceiling: null, median: null };
  const median = medianCont(values) as number;
  return { applied: true, floor: median * FLOOR, ceiling: median * AGGREGATE_CEILING_MEDIAN_MULTIPLE, median };
}

export function inBand(price: number, band: ReturnType<typeof plausibleBand>): boolean {
  if (!band.applied) return true;
  return price > (band.floor as number) && price <= (band.ceiling as number);
}

// ------------------------------------------------------------------------------------------------
// Estado do dia
// ------------------------------------------------------------------------------------------------

export interface DayState {
  day: string;
  minCents: number | null;
  minOfferId: string | null;
  avgCents: number | null;
  medianCents: number | null;
  maxCents: number | null;
  nOffers: number;
  nStores: number;
  nQuotes: number;
  freshOffers: number;
  staleOffers: number;
  outlierOffers: number;
  quality: DayQuality;
  /** offerId -> preço oferta-dia das ofertas que entraram no dia. Persistido em `members`. */
  members: Record<string, number>;
  matchedOffers: number | null;
  matchedChangePct: number | null;
  compositionFlag: boolean | null;
}

interface Resolved {
  offer: OfferInput;
  value: number;
  /** true = cotação medida no dia; false = carry-forward. */
  measured: boolean;
  row: OfferDayRow | null;
  lastAt: Date;
}

/**
 * Resolve cada oferta para o dia: medida, carregada (fresca) ou stale. `alive(offer)` decide se a oferta
 * pode ser carregada sem cotação própria no dia (status ativo agora ou cotação posterior ao instante de
 * referência); oferta com cotação MEDIDA no dia sempre conta (é medição real).
 */
function resolveOffers(day: string, now: Date, offers: OfferInput[]): { fresh: Resolved[]; stale: number } {
  const { end } = spDayBounds(day);
  const ref = new Date(Math.min(now.getTime(), end.getTime()));
  const fresh: Resolved[] = [];
  let stale = 0;
  for (const offer of offers) {
    const rows = offer.rows.filter((r) => r.day <= day && r.lastObservedAt.getTime() <= ref.getTime());
    if (!rows.length) continue;
    const last = rows.reduce((a, b) => (b.lastObservedAt.getTime() > a.lastObservedAt.getTime() ? b : a));
    const { age, max } = ageOf(offer.freshness, last.lastObservedAt, ref.getTime());
    if (age > OFFER_ACTIVE_DAYS * DAY_MS) continue; // fora da janela de 7 dias: não é ativa no dia
    const today = rows.find((r) => r.day === day) ?? null;
    if (today) {
      fresh.push({ offer, value: today.medianCents, measured: true, row: today, lastAt: today.lastObservedAt });
      continue;
    }
    const alive = offer.active || offer.rows.some((r) => r.lastObservedAt.getTime() > ref.getTime());
    if (!alive) continue; // oferta expirada não é carregada para dias sem cotação
    if (age <= max) fresh.push({ offer, value: last.lastCents, measured: false, row: null, lastAt: last.lastObservedAt });
    else stale++;
  }
  return { fresh, stale };
}

/** Calcula o estado de UM produto em UM dia a partir das ofertas ELEGÍVEIS (filtro de elegibilidade já aplicado no SQL). */
export function computeDayState(day: string, now: Date, offers: OfferInput[]): DayState {
  if (day < PRICE_DAILY_REGIME_START) throw new Error(`computeDayState: ${day} é anterior ao regime atual; use legacyDayState`);
  const { fresh, stale } = resolveOffers(day, now, offers);
  // A régua de plausibilidade nasce SÓ das ofertas que contam na média; a oferta "fora da média" é conferida contra ela (para o mínimo).
  const inAvg = fresh.filter((f) => !f.offer.avgExcluded);
  const band = plausibleBand(inAvg.map((f) => f.value));
  const kept = fresh.filter((f) => inBand(f.value, band));
  const outliers = fresh.length - kept.length;
  const base = { day, freshOffers: fresh.length, staleOffers: stale, outlierOffers: outliers };
  if (!kept.length) {
    return { ...base, ...NO_TRANSITION, members: {}, minCents: null, minOfferId: null, avgCents: null, medianCents: null, maxCents: null, nOffers: 0, nStores: 0, nQuotes: 0, quality: 'gap' };
  }
  // Mínimo e máximo BRUTOS do dia por oferta (inclui a "fora da média": é preço real e visível); se o bruto cai fora da faixa, vale o preço oferta-dia (já plausível).
  let min = Infinity;
  let minOffer: Resolved | null = null;
  let max = -Infinity;
  for (const k of kept) {
    const rawMin = k.row ? k.row.minCents : k.value;
    const rawMax = k.row ? k.row.maxCents : k.value;
    const lo = inBand(rawMin, band) ? rawMin : k.value;
    const hi = inBand(rawMax, band) ? rawMax : k.value;
    if (lo < min || (lo === min && minOffer && k.offer.offerId < minOffer.offer.offerId)) {
      min = lo;
      minOffer = k;
    }
    if (hi > max) max = hi;
  }
  // Média, mediana, n_offers, lojas, members e qualidade: SÓ ofertas que contam na média.
  const avgSet = kept.filter((k) => !k.offer.avgExcluded);
  const values = avgSet.map((k) => k.value);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    ...base,
    ...NO_TRANSITION,
    members: Object.fromEntries(avgSet.map((k) => [k.offer.offerId, k.value])),
    minCents: min,
    minOfferId: (minOffer as Resolved).offer.offerId,
    avgCents: avgSet.length >= MIN_OFFERS_FOR_AVG ? sum / values.length : null,
    medianCents: medianCont(values),
    maxCents: max,
    nOffers: avgSet.length,
    nStores: new Set(avgSet.map((k) => k.offer.storeKey)).size,
    nQuotes: kept.reduce((a, k) => a + (k.row?.nCollected ?? 0), 0),
    quality: avgSet.length >= PLAUSIBILITY_MIN_OFFERS ? 'complete' : 'partial',
  };
}

/**
 * Mediana oferta-dia dos últimos `windowDays` dias (anteriores a `toDay`) de UMA oferta, com carry-forward do último preço medido quando o
 * dia não tem cotação e a oferta estava fresca (mesma `resolveOffers`). Base da régua de 10% da Amazon-only (ADR 0010, D3): o ASIN só se
 * compara com o próprio histórico. Menos de `minDays` dias de série => null (nada é inventado).
 */
export function ownSeriesMedian(offer: OfferInput, toDay: string, now: Date, windowDays = 14, minDays = 7): { cents: number; days: number } | null {
  const vals: number[] = [];
  for (let i = windowDays; i >= 1; i--) {
    const d = addDays(toDay, -i);
    if (d < PRICE_DAILY_REGIME_START) continue;
    const { fresh } = resolveOffers(d, now, [offer]);
    if (fresh[0]) vals.push(fresh[0].value);
  }
  if (vals.length < minDays) return null;
  return { cents: Math.round(medianCont(vals) as number), days: vals.length };
}

/** Dia anterior ao regime: só contagem medida, nada recalculado (marcador "histórico antigo"). */
export function legacyDayState(day: string, nQuotes: number, nOffers: number): DayState {
  return { day, ...NO_TRANSITION, members: {}, minCents: null, minOfferId: null, avgCents: null, medianCents: null, maxCents: null, nOffers, nStores: 0, nQuotes, freshOffers: 0, staleOffers: 0, outlierOffers: 0, quality: 'legacy' };
}

/**
 * Dia fechado nunca é reescrito. Dia futuro nunca é gravado. Dia anterior a `today` é recalculado uma última vez
 * (com o instante de referência = fim do dia) e fechado; "hoje" é recalculado a cada ciclo e fica aberto.
 */
export function stateWriteAction(existing: { closed: boolean } | null, day: string, today: string): { action: 'insert' | 'update' | 'skip'; close: boolean } {
  if (day > today) return { action: 'skip', close: false };
  if (existing?.closed) return { action: 'skip', close: false };
  return { action: existing ? 'update' : 'insert', close: day < today };
}

// ------------------------------------------------------------------------------------------------
// Menor preço do momento e eventos
// ------------------------------------------------------------------------------------------------

export interface LiveMin {
  minCents: number;
  offerId: string;
  networkId: string | null;
  sellerId: string | null;
  /** Instante da cotação da oferta que detém o mínimo. */
  observedAt: Date;
  freshOffers: number;
  quality: 'complete' | 'partial';
}

/**
 * Menor preço elegível AGORA: ofertas ativas, frescas (cotação <= 48 h), dentro da faixa plausível.
 * O preço de cada oferta é a ÚLTIMA cotação medida (não a mediana do dia). Sem oferta => null (lacuna).
 */
export function computeLiveMin(offers: OfferInput[], now: Date): LiveMin | null {
  const cands: Array<{ o: OfferInput; price: number; at: Date }> = [];
  for (const o of offers) {
    if (!o.active || !o.rows.length) continue;
    const last = o.rows.reduce((a, b) => (b.lastObservedAt.getTime() > a.lastObservedAt.getTime() ? b : a));
    const { age, max } = ageOf(o.freshness, last.lastObservedAt, now.getTime());
    if (age > max) continue;
    cands.push({ o, price: last.lastCents, at: last.lastObservedAt });
  }
  return pickMin(cands);
}

/** Oferta ATIVA e elegível lida direto do cadastro (affiliate_offers): preço vigente, última cotação e última checagem. */
export interface LiveOfferInput {
  offerId: string;
  networkId?: string | null;
  sellerId?: string | null;
  /** current_price_cents do cadastro (cache do último preço coletado). */
  priceCents: number;
  /** Instante da última cotação gravada (affiliate_price_snapshots). null = nunca cotada. */
  quotedAt: Date | null;
  /** last_checked_at do cadastro. null = nunca checada. */
  checkedAt: Date | null;
  /** Oferta "fora da média" (0044): visível no preço agora, fora de qualquer média/mediana. */
  avgExcluded?: boolean;
  /** Teto de frescor desta oferta (padrão FRESH_MAX_AGE_MS; Amazon em modo `on`: 24 h, com quotedAt e checkedAt = last_price_confirmed_at). */
  maxAgeMs?: number;
}

export interface LiveMinFromOffers extends LiveMin {
  /** Última checagem da oferta que detém o menor preço (para "verificado há X h"). */
  checkedAt: Date;
  /** Quantas ofertas frescas empatam exatamente no menor preço (1 = sem empate). */
  tiedAtMin: number;
  /** Ids das ofertas empatadas no menor preço. */
  tiedOfferIds: string[];
}

/**
 * Menor preço elegível AGORA lido do CADASTRO de ofertas (não depende do job sombra price_daily_offer).
 * Frescor: a oferta só entra se a última COTAÇÃO e a última CHECAGEM têm no máximo FRESH_MAX_AGE_MS (48 h):
 * a checagem sozinha não prova coleta (o coletor grava last_checked_at também em erro), e a cotação sozinha pode ser antiga.
 * Preço > 0 e faixa plausível como em `computeLiveMin`. Sem oferta fresca => null (lacuna, nada inventado).
 * Empate de preço: vale a oferta de menor id (determinístico), e `tiedAtMin`/`tiedOfferIds` dizem quantas empatam.
 */
export function computeLiveMinFromOffers(offers: LiveOfferInput[], now: Date): LiveMinFromOffers | null {
  const cands: Array<{ o: OfferInput; price: number; at: Date }> = [];
  const checked = new Map<string, Date>();
  for (const l of offers) {
    if (!(l.priceCents > 0) || !l.quotedAt || !l.checkedAt) continue;
    const maxAge = l.maxAgeMs ?? FRESH_MAX_AGE_MS;
    if (now.getTime() - l.quotedAt.getTime() > maxAge) continue;
    if (now.getTime() - l.checkedAt.getTime() > maxAge) continue;
    checked.set(l.offerId, l.checkedAt);
    cands.push({ o: { offerId: l.offerId, storeKey: '', networkId: l.networkId, sellerId: l.sellerId, active: true, rows: [] }, price: l.priceCents, at: l.quotedAt });
  }
  const live = pickMin(cands);
  if (!live) return null;
  // Empate calculado só entre as ofertas que passaram na faixa plausível.
  const band = plausibleBand(cands.map((c) => c.price));
  const tied = cands.filter((c) => inBand(c.price, band) && c.price === live.minCents).map((c) => c.o.offerId).sort();
  return { ...live, checkedAt: checked.get(live.offerId) as Date, tiedAtMin: tied.length, tiedOfferIds: tied };
}

/**
 * Casa o ÚLTIMO evento gravado do menor preço com o menor preço vigente.
 *  - evento com id de oferta: vale só se essa oferta está entre as que detêm o menor preço agora (mesmo valor); a loja
 *    do evento é a dessa oferta;
 *  - evento sem id de oferta (dado antigo): cai no valor; se mais de uma oferta empata no preço, a loja NÃO é afirmada.
 * Nunca atribui a mudança a uma oferta só porque o valor coincide.
 */
export function matchMinEvent(
  event: { minCents: number; offerId: string | null } | null,
  live: { minCents: number; offerId: string; tiedOfferIds: string[] } | null
): { matched: boolean; storeOfferId: string | null } {
  if (!event || !live || event.minCents !== live.minCents) return { matched: false, storeOfferId: null };
  if (event.offerId) {
    return live.tiedOfferIds.includes(event.offerId) ? { matched: true, storeOfferId: event.offerId } : { matched: false, storeOfferId: null };
  }
  return { matched: true, storeOfferId: live.tiedOfferIds.length > 1 ? null : live.offerId };
}

function pickMin(cands: Array<{ o: OfferInput; price: number; at: Date }>): LiveMin | null {
  if (!cands.length) return null;
  const band = plausibleBand(cands.map((c) => c.price));
  const ok = cands.filter((c) => inBand(c.price, band));
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => (b.price < a.price || (b.price === a.price && b.o.offerId < a.o.offerId) ? b : a));
  return {
    minCents: best.price,
    offerId: best.o.offerId,
    networkId: best.o.networkId ?? null,
    sellerId: best.o.sellerId ?? null,
    observedAt: best.at,
    freshOffers: cands.length,
    quality: cands.length >= PLAUSIBILITY_MIN_OFFERS ? 'complete' : 'partial',
  };
}

export interface MinEventDraft {
  at: Date;
  minCents: number;
  prevMinCents: number | null;
  offerId: string;
  networkId: string | null;
  sellerId: string | null;
  quality: 'complete' | 'partial';
}

/**
 * Compara o menor preço vigente com o ÚLTIMO evento gravado e devolve o evento a gravar (ou null se o menor
 * preço não mudou). Queda: o instante é o da cotação da oferta que passou a deter o mínimo; alta/expiração: o
 * instante da detecção. Nunca anterior ao último evento. `live` null (sem oferta) não gera evento: lacuna fica lacuna.
 */
export function nextMinEvent(last: { at: Date; minCents: number } | null, live: LiveMin | null, now: Date): MinEventDraft | null {
  if (!live) return null;
  if (last && last.minCents === live.minCents) return null;
  let at = last && live.minCents > last.minCents ? now : live.observedAt;
  if (at.getTime() > now.getTime()) at = now;
  if (last && at.getTime() < last.at.getTime()) at = last.at;
  return {
    at,
    minCents: live.minCents,
    prevMinCents: last ? last.minCents : null,
    offerId: live.offerId,
    networkId: live.networkId,
    sellerId: live.sellerId,
    quality: live.quality,
  };
}

export interface ReconOffer {
  offerId: string;
  networkId?: string | null;
  sellerId?: string | null;
  active: boolean;
  /** Frescor por confirmação (só Amazon, modo `on`). */
  freshness?: OfferFreshness | null;
  /** Cotações reais medidas, em ordem cronológica (inclua as das 48 h anteriores a `fromAt` para o estado inicial). */
  snaps: Array<{ at: Date; priceCents: number }>;
}

/**
 * Janela de agrupamento de instantes próximos na reconstrução (ms). Cotações de uma mesma varredura chegam com
 * 0,2 a 0,5 s de intervalo; avaliar o mínimo a cada cotação cria eventos transitórios (o mínimo "pisca" e a
 * própria oferta regrava outro preço logo depois). Dentro da janela vale só o ESTADO FINAL do lote.
 * 0 desliga o agrupamento (comportamento antigo: um instante, uma avaliação). Valor definitivo: ver ata/relatório.
 */
export const RECON_BATCH_WINDOW_MS = 2000;
const SP_OFFSET_MS = 3 * 3600_000; // America/Sao_Paulo = UTC-03 fixo (sem horário de verão desde 2019; ver spDayBounds)
const spDayIndex = (ms: number) => Math.floor((ms - SP_OFFSET_MS) / DAY_MS);

/**
 * Reconstrói os eventos do menor preço SÓ nos instantes em que houve cotação medida (>= fromAt): em cada um,
 * o mínimo elegível entre as ofertas frescas (<= 48 h) e vivas. Altas por expiração/idade entre duas cotações
 * NÃO são observáveis (não há medição naquele instante) e ficam de fora: lacuna fica lacuna.
 *
 * AGRUPAMENTO (windowMs): os instantes são divididos em lotes. Um lote começa no primeiro instante livre t0 e
 * contém todo instante t com t - t0 <= windowMs (âncora fixa, sem crescer por encadeamento) e MESMO dia civil de
 * Brasília (um lote nunca cruza a meia-noite local: o último estado de cada dia é sempre preservado). Do lote
 * só interessa o ESTADO FINAL (mínimo elegível no último instante). Gera evento se esse estado final difere do
 * último evento; o instante do evento é o início da sequência final igual a esse estado (o momento em que o
 * mínimo chegou ao valor/oferta finais e ficou), nunca um valor intermediário que a própria varredura desfez.
 * Troca legítima (a oferta muda e fica) continua registrada com o seu horário; o estado final não depende da
 * ordem do array de ofertas nem da ordem de gravação (vale o instante da cotação). Não toca em eventos live.
 */
export function reconstructMinEvents(offers: ReconOffer[], fromAt: Date, opts: { windowMs?: number } = {}): MinEventDraft[] {
  const windowMs = Math.max(0, opts.windowMs ?? RECON_BATCH_WINDOW_MS);
  const instants = [...new Set(offers.flatMap((o) => o.snaps.map((s) => s.at.getTime())))].filter((t) => t >= fromAt.getTime()).sort((a, b) => a - b);
  const lastEver = new Map(offers.map((o) => [o.offerId, o.snaps.length ? o.snaps[o.snaps.length - 1].at.getTime() : -Infinity]));
  const ptr = new Map(offers.map((o) => [o.offerId, -1]));
  const evalAt = (t: number): LiveMin | null => {
    const cands: Array<{ o: OfferInput; price: number; at: Date }> = [];
    for (const o of offers) {
      let i = ptr.get(o.offerId) as number;
      while (i + 1 < o.snaps.length && o.snaps[i + 1].at.getTime() <= t) i++;
      ptr.set(o.offerId, i);
      if (i < 0) continue;
      const s = o.snaps[i];
      const fr = ageOf(o.freshness, s.at, t);
      if (fr.age > fr.max) continue;
      if (!(o.active || (lastEver.get(o.offerId) as number) >= t)) continue; // expirada não ressuscita
      cands.push({ o: { offerId: o.offerId, storeKey: '', networkId: o.networkId, sellerId: o.sellerId, active: o.active, rows: [] }, price: s.priceCents, at: s.at });
    }
    return pickMin(cands);
  };
  const out: MinEventDraft[] = [];
  let last: { at: Date; minCents: number } | null = null;
  for (let a = 0; a < instants.length; ) {
    const t0 = instants[a];
    let b = a;
    while (b + 1 < instants.length && instants[b + 1] - t0 <= windowMs && spDayIndex(instants[b + 1]) === spDayIndex(t0)) b++;
    // Estado em cada instante do lote (ponteiros avançam em ordem cronológica).
    const states: Array<{ t: number; live: LiveMin | null }> = [];
    for (let k = a; k <= b; k++) states.push({ t: instants[k], live: evalAt(instants[k]) });
    a = b + 1;
    const final = states[states.length - 1].live;
    if (!final) continue;
    if (last && last.minCents === final.minCents) continue;
    // Início da sequência final: primeiro instante a partir do qual (valor, oferta) já são os finais e não mudam mais.
    let s = states.length - 1;
    while (s > 0 && states[s - 1].live && states[s - 1].live!.minCents === final.minCents && states[s - 1].live!.offerId === final.offerId) s--;
    const at = new Date(states[s].t);
    out.push({
      at,
      minCents: final.minCents,
      prevMinCents: last ? last.minCents : null,
      offerId: final.offerId,
      networkId: final.networkId,
      sellerId: final.sellerId,
      quality: final.quality,
    });
    last = { at, minCents: final.minCents };
  }
  return out;
}

/**
 * Mesma regra de agrupamento de `reconstructMinEvents`, aplicada a eventos JÁ GRAVADOS (subtração pura: nunca cria
 * nem move evento, então não ressuscita o que um reprocessamento anterior apagou). Eventos em ordem cronológica.
 * Lote = âncora no primeiro evento livre, até `windowMs` depois, mesmo dia civil de Brasília. Do lote fica o ÚLTIMO
 * evento (estado final, no instante em que o mínimo chegou ao valor final); se o valor final é igual ao do último
 * evento mantido antes do lote (o mínimo piscou e voltou), o lote inteiro é descartado. `prevMinCents` dos mantidos
 * deve ser religado pelo chamador ao valor do predecessor mantido.
 */
export function collapseMinEventBatches<E extends { at: Date; minCents: number }>(events: E[], windowMs: number = RECON_BATCH_WINDOW_MS): { kept: E[]; dropped: E[] } {
  const w = Math.max(0, windowMs);
  const kept: E[] = [];
  const dropped: E[] = [];
  for (let a = 0; a < events.length; ) {
    const t0 = events[a].at.getTime();
    let b = a;
    while (b + 1 < events.length && events[b + 1].at.getTime() - t0 <= w && spDayIndex(events[b + 1].at.getTime()) === spDayIndex(t0)) b++;
    const final = events[b];
    const prevKept = kept.length ? kept[kept.length - 1] : null;
    if (prevKept && prevKept.minCents === final.minCents) dropped.push(...events.slice(a, b + 1));
    else {
      dropped.push(...events.slice(a, b));
      kept.push(final);
    }
    a = b + 1;
  }
  return { kept, dropped };
}

/** Percentil (0 a 100) de um valor entre observações: fração das observações <= valor. null sem amostra. */
export function percentileRank(value: number, sample: number[]): number | null {
  if (!sample.length) return null;
  return (sample.filter((x) => x <= value).length / sample.length) * 100;
}

// ------------------------------------------------------------------------------------------------
// Decomposição dia a dia e métricas do período
// ------------------------------------------------------------------------------------------------

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/**
 * Preenche matched_offers / matched_change_pct / composition_flag de `cur` em relação ao dia anterior.
 * `prev` = estado do dia ANTERIOR (calendário) ou null. Sem dia anterior com ofertas, ou sem oferta em comum: tudo null.
 */
export function withTransition(cur: DayState, prev: Pick<DayState, 'avgCents' | 'members' | 'quality'> | null): DayState {
  if (!prev || prev.quality === 'gap' || prev.quality === 'legacy' || cur.quality === 'gap' || cur.quality === 'legacy') return cur;
  const common = Object.keys(cur.members).filter((id) => id in prev.members);
  if (!common.length) return { ...cur, matchedOffers: 0 };
  const mc1 = mean(common.map((id) => prev.members[id]));
  const mc2 = mean(common.map((id) => cur.members[id]));
  const pct = (mc2 / mc1 - 1) * 100;
  let flag: boolean | null = null;
  if (cur.avgCents != null && prev.avgCents != null) {
    const delta = cur.avgCents - prev.avgCents;
    const composition = delta - (mc2 - mc1);
    flag = delta === 0 ? composition !== 0 : Math.abs(composition) > 0.5 * Math.abs(delta);
  }
  return { ...cur, matchedOffers: common.length, matchedChangePct: Math.round(pct * 100) / 100, compositionFlag: flag };
}

export interface PeriodDay {
  day: string;
  members: Record<string, number>;
  minCents: number | null;
}

export interface PeriodMetrics {
  offerDays: number;
  distinctOffers: number;
  spanDays: number;
  /** Soma dos preços oferta-dia / nº de oferta-dias. */
  avgOfferDayCents: number | null;
  medianOfferDayCents: number | null;
  /** Percentil (0 a 100) do preço atual na série dos menores preços diários da janela. */
  currentPercentileInDailyMins: number | null;
  eligible: boolean;
  reasons: string[];
}

export const MIN_DISTINCT_OFFERS_FOR_VERDICT = 3;
export const MIN_OFFER_DAYS_FOR_VERDICT = 5;
export const MIN_SPAN_DAYS_FOR_VERDICT = 14;

/** Métricas de uma janela de dias (30, 90...) a partir dos dias já calculados. */
export function computePeriodMetrics(days: PeriodDay[], currentCents: number | null): PeriodMetrics {
  const prices: number[] = [];
  const offers = new Set<string>();
  for (const d of days) {
    for (const [id, p] of Object.entries(d.members)) {
      prices.push(p);
      offers.add(id);
    }
  }
  const withData = days.filter((d) => Object.keys(d.members).length > 0).map((d) => d.day).sort();
  const spanDays = withData.length ? Math.round((new Date(`${withData[withData.length - 1]}T12:00:00Z`).getTime() - new Date(`${withData[0]}T12:00:00Z`).getTime()) / DAY_MS) + 1 : 0;
  const mins = days.map((d) => d.minCents).filter((x): x is number => x != null);
  const reasons: string[] = [];
  if (offers.size < MIN_DISTINCT_OFFERS_FOR_VERDICT) reasons.push(`ofertas_distintas<${MIN_DISTINCT_OFFERS_FOR_VERDICT}`);
  if (prices.length < MIN_OFFER_DAYS_FOR_VERDICT) reasons.push(`oferta_dias<${MIN_OFFER_DAYS_FOR_VERDICT}`);
  if (spanDays < MIN_SPAN_DAYS_FOR_VERDICT) reasons.push(`historico<${MIN_SPAN_DAYS_FOR_VERDICT}_dias`);
  return {
    offerDays: prices.length,
    distinctOffers: offers.size,
    spanDays,
    avgOfferDayCents: prices.length ? mean(prices) : null,
    medianOfferDayCents: medianCont(prices),
    currentPercentileInDailyMins: currentCents != null ? percentileRank(currentCents, mins) : null,
    eligible: reasons.length === 0,
    reasons,
  };
}

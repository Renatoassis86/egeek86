import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import {
  OFFER_ACTIVE_DAYS,
  PRICE_DAILY_REGIME_START,
  addDays,
  FRESH_MAX_AGE_MS,
  computeDayState,
  computeLiveMinFromOffers,
  computePeriodMetrics,
  matchMinEvent,
  spDay,
  type LiveOfferInput,
  type OfferInput,
  type PeriodDay,
} from '@/lib/pricing/daily-state';
import { computePeriodRef, isChartMeasuredDay, type PeriodRef } from '@/lib/pricing/chart-model';
import {
  JUDGEMENT_MEASURED_WINDOW_DAYS,
  JUDGEMENT_MIN_MEASURED_DAYS,
  JUDGEMENT_MIN_STORES_PER_DAY,
  LOWS_INCLUDE_WEAK_SELLER,
  VERDICT_JUDGEMENT_ENABLED,
} from '@/lib/pricing/price-metrics-config';
import {
  compareToStoresMedian,
  computeDataBase,
  computeJudgement,
  countMeasuredDays,
  decisionSentence,
  estimateUnlockDay,
  isLowestCorroborated,
  observedRange,
  periodShortReasons,
  storesToday,
  weakSellerNotice,
  type DataBaseLevel,
  type Judgement,
  type ObservedRange,
  type ShortReason,
  type StoreComparison,
  type WeakSellerNotice,
} from '@/lib/pricing/price-verdict-v2';
import { loadOffers } from '@/server/pricing/price-daily';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { contarForaDaFaixa, ofertaFresca } from '@/lib/pricing/lojas-hoje';
import { weakSellerSql, avgExcludedFlagSql } from '@/server/queries/public-offers';
import { AMAZON_FRESH_MAX_AGE_MS, amazonScope, isAmazonSlug } from '@/lib/pricing/amazon-mode';
import { amazonScopeSql } from '@/server/pricing/amazon-scope-sql';

/**
 * Leitura V2 do topo da página de produto (fase 2, ata 2026-11-05). SÓ LEITURA: lê price_daily_offer,
 * price_daily_state e price_min_events (tabelas sombra) e o cadastro de ofertas; não grava nada.
 * O "Preço agora" NÃO depende do job sombra: vem do cadastro de ofertas (affiliate_offers, mesma elegibilidade, frescor de 48 h).
 * Tudo que devolve é serializável (sem Date) para passar pelo cache SWR. Lacuna fica lacuna: nada é interpolado.
 */

type Row = Record<string, unknown>;

export interface LowRecord {
  cents: number;
  /** Dia civil (America/Sao_Paulo), YYYY-MM-DD. */
  day: string;
  /** Rótulo para o cliente: vendedor (rede) ou só a rede. */
  store: string;
  /** Dias da janela efetivamente cobertos por dado (desde o primeiro dia medido). */
  coverageDays: number;
}

export interface PriceMetricsV2 {
  /** Menor preço elegível vigente. null = nenhuma oferta com cotação nas últimas 48 h (lacuna). */
  now: {
    cents: number;
    /** Loja que detém o preço agora. null = empate de preço sem como afirmar qual loja (evento antigo sem id de oferta). */
    store: string | null;
    /** Quando o menor preço mudou pela última vez (evento gravado). null se o log não casa com o valor vigente. */
    lastChangeAt: string | null;
    /** Menor preço anterior à última mudança. */
    prevCents: number | null;
    /** Instante da cotação que sustenta o preço agora. */
    quotedAt: string;
    /** Última checagem (last_checked_at) da oferta que detém o preço agora: "verificado há X h". */
    checkedAt: string;
    /** Quantas ofertas frescas empatam exatamente neste preço (1 = sem empate). */
    tiedOffers: number;
    freshOffers: number;
    /** Quem detém o preço agora é vendedor de baixa reputação (não vale como menor preço de referência). */
    weakSeller: boolean;
  } | null;
  /** Lojas DISTINTAS com preço fresco hoje e a mediana dos menores preços por loja (fato; null com menos de 3 lojas distintas). */
  stores: {
    count: number;
    medianCents: number | null;
    /** Nomes DISTINTOS das redes/marketplaces das lojas contadas hoje (ordenados). Serve ao texto "N vendedores no Mercado Livre" vs "N lojas". */
    networks: string[];
  };
  /** Preço agora vs mediana das lojas hoje (percentual inteiro). null sem comparação (menos de 3 lojas, ou menor preço de vendedor de baixa reputação). */
  storesComparison: StoreComparison | null;
  /** A frase de decisão do topo (fato, sem juízo). */
  decision: string;
  /**
   * Último evento gravado do menor preço do produto (qualquer oferta), com a loja que o detinha. `matchesNow` = é o evento do preço
   * vigente; falso = o menor preço atual é de outra oferta (o evento é mostrado como tal, nunca como se fosse o atual).
   */
  lastEvent: { at: string; cents: number; prevCents: number | null; store: string | null; matchesNow: boolean } | null;
  /** Espelha VERDICT_JUDGEMENT_ENABLED. Desligado: `judgement` é null e nenhum rótulo de juízo existe na tela. */
  judgementEnabled: boolean;
  judgement: Judgement | null;
  /** Dias medidos (>= 3 lojas) dentre os últimos 14 (sem hoje) e quantos o juízo exige. */
  measuredDays: number;
  measuredDaysNeeded: number;
  /** Data estimada de liberação do juízo (YYYY-MM-DD); só com o juízo ligado e se calculável. */
  unlockDay: string | null;
  /** Histórico curto: período sem suficiência (3 ofertas, 5 oferta-dias, 14 dias) ou poucos dias medidos. */
  shortHistory: boolean;
  shortReasons: ShortReason[];
  /** Dias de acompanhamento (do primeiro dia medido até hoje, inclusive). */
  trackingDays: number;
  /** Dias MEDIDOS de fato no regime atual (qualidade complete/partial com menor preço): a mesma contagem que o gráfico V2 usa para decidir se desenha. */
  measuredDaysTotal: number;
  /** Ofertas frescas fora da faixa de preço plausível hoje (descartadas da contagem de lojas e do valor do meio). 0 = nenhuma. */
  outOfBandOffers: number;
  /** Faixa observada dos menores preços diários dos últimos 30 dias (inclui hoje). */
  observed: ObservedRange | null;
  /** Base de dados (substitui "confiança"): nível, dias medidos nos últimos 30 e faixa observada. */
  dataBase: { level: DataBaseLevel; measuredDays30: number; stores: number; range: ObservedRange | null };
  /** Mediana dos preços oferta-dia dos últimos 30 dias (mesma base do gráfico). */
  median30Cents: number | null;
  period30: { distinctOffers: number; offerDays: number; spanDays: number };
  lows: { d30: LowRecord | null; d90: LowRecord | null; all: LowRecord | null };
  /**
   * Média e mediana HISTÓRICAS (oferta-dias: soma dos preços oferta-dia / nº de oferta-dias; não a média das médias diárias),
   * mesma base e mesmo filtro do selo e do gráfico. `coveredDays` = dias da janela com dado medido (nunca inventado).
   */
  averages: { d30: PeriodRef | null; d90: PeriodRef | null; all: PeriodRef | null };
  /** Dias do produto anteriores a 31/10/2026 (regime antigo de coleta): fora de todas as medidas, só aviso. */
  legacyDays: number;
  /** Primeiro dia com medida do regime atual. */
  firstDay: string | null;
  /** Config aplicada (para a tela dizer a regra). */
  weakSellerInLows: boolean;
  /** Excluir vendedor de baixa reputação de fato mudou algum mínimo (30d, 90d ou de sempre). Só então o aviso aparece. */
  weakSellerChangedLows: boolean;
  /** Como mostrar o aviso de vendedor fraco nos mínimos (ver `weakSellerNotice`). */
  weakNotice: WeakSellerNotice;
}

interface StateRow {
  day: string;
  minCents: number | null;
  minOfferId: string | null;
  maxCents: number | null;
  quality: string;
  members: Record<string, number> | null;
  nStores: number;
  freshOffers: number;
}

export interface OfferMeta {
  label: string;
  /** Apelido do vendedor (null = não identificado). */
  seller: string | null;
  /** Nome da rede/marketplace da oferta. */
  network: string;
  weak: boolean;
}

const asNum = (v: unknown): number | null => (v == null ? null : Number(v));

async function loadStates(productId: string, today: string): Promise<StateRow[]> {
  const rows = await db.execute<Row>(sql`
    SELECT day::text AS day, min_cents, min_offer_id, max_cents, quality, n_stores, fresh_offers,
           CASE WHEN day >= ${PRICE_DAILY_REGIME_START}::date THEN members END AS members
    FROM price_daily_state
    WHERE master_product_id = ${productId}::uuid
    ORDER BY day
  `);
  return rows.map((r) => ({
    day: String(r.day),
    minCents: asNum(r.min_cents),
    minOfferId: (r.min_offer_id as string | null) ?? null,
    maxCents: asNum(r.max_cents),
    quality: String(r.quality),
    members: r.members == null ? null : ((typeof r.members === 'string' ? JSON.parse(r.members) : r.members) as Record<string, number>),
    nStores: Number(r.n_stores ?? 0),
    freshOffers: Number(r.fresh_offers ?? 0),
  }));
}

/** Rótulo de loja e vendedor fraco das ofertas ELEGÍVEIS do produto (mesma elegibilidade das tabelas sombra). */
export async function loadOfferMeta(productId: string): Promise<Map<string, OfferMeta>> {
  const rows = await db.execute<Row>(sql`
    SELECT o.id AS offer_id, n.name AS network_name, s.nickname, ${weakSellerSql('s')} AS weak
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.master_product_id = ${productId}::uuid AND ${eligibleOfferSql('o')}
  `);
  const out = new Map<string, OfferMeta>();
  for (const r of rows) {
    const net = String(r.network_name ?? '');
    const nick = r.nickname ? String(r.nickname) : '';
    out.set(String(r.offer_id), { label: nick ? `${nick} (${net})` : net, seller: nick || null, network: net, weak: r.weak === true });
  }
  return out;
}

/**
 * Ofertas ATIVAS e elegíveis do produto com preço vigente, última cotação e última checagem (frescor aplicado em `computeLiveMinFromOffers`).
 * A Amazon segue a flag PRICE_AMAZON_MODE: `off`/`shadow` = fora; `on` = dentro (games), com frescor de 24 h pela CONFIRMAÇÃO do preço
 * (`last_price_confirmed_at`, que a coleta assistida atualiza a cada leitura) e sem ausência na busca. Para ela, cotação e checagem = confirmação.
 */
export async function loadLiveOffers(productId: string, now: Date): Promise<LiveOfferInput[]> {
  const since = new Date(now.getTime() - FRESH_MAX_AGE_MS).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT o.id AS offer_id, o.network_id, o.seller_id, o.current_price_cents, o.last_checked_at, ${avgExcludedFlagSql('o')} AS avg_excluded,
           n.slug AS net_slug, o.last_price_confirmed_at, o.consecutive_miss_count AS miss_count,
           (SELECT MAX(ps.collected_at) FROM affiliate_price_snapshots ps WHERE ps.offer_id = o.id) AS quoted_at
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.master_product_id = ${productId}::uuid AND o.status = 'active' AND o.current_price_cents > 0
      AND o.last_checked_at >= ${since}::timestamptz AND ${eligibleOfferSql('o')} AND ${amazonScopeSql(amazonScope(), 'o')}
  `);
  const out: LiveOfferInput[] = [];
  for (const r of rows) {
    const base = {
      offerId: String(r.offer_id),
      networkId: (r.network_id as string | null) ?? null,
      sellerId: (r.seller_id as string | null) ?? null,
      priceCents: Number(r.current_price_cents),
      avgExcluded: r.avg_excluded === true,
    };
    if (isAmazonSlug(String(r.net_slug))) {
      if (Number(r.miss_count ?? 0) > 0 || !r.last_price_confirmed_at) continue;
      const at = new Date(r.last_price_confirmed_at as string | Date);
      out.push({ ...base, quotedAt: at, checkedAt: at, maxAgeMs: AMAZON_FRESH_MAX_AGE_MS });
      continue;
    }
    out.push({ ...base, quotedAt: r.quoted_at ? new Date(r.quoted_at as string | Date) : null, checkedAt: r.last_checked_at ? new Date(r.last_checked_at as string | Date) : null });
  }
  return out;
}

/** Os dois últimos preços gravados da oferta (mais recente primeiro): base da corroboração por 2 coletas no mesmo preço. */
async function loadHolderSnapshots(offerId: string): Promise<{ lastPrices: number[] }> {
  const rows = await db.execute<Row>(sql`
    SELECT price_cents FROM affiliate_price_snapshots WHERE offer_id = ${offerId}::uuid ORDER BY collected_at DESC LIMIT 2
  `);
  return { lastPrices: rows.map((r) => Number(r.price_cents)) };
}

async function loadLastEvent(productId: string): Promise<{ at: string; minCents: number; prevMinCents: number | null; offerId: string | null; store: string | null } | null> {
  // Rótulo da loja pelo próprio evento (mesma junção do gráfico): a oferta do evento pode já não ser elegível/ativa.
  const rows = await db.execute<Row>(sql`
    SELECT e.at, e.min_cents, e.prev_min_cents, e.offer_id, n.name AS network_name, sl.nickname
    FROM price_min_events e
    LEFT JOIN affiliate_offers o ON o.id = e.offer_id
    LEFT JOIN affiliate_networks n ON n.id = COALESCE(o.network_id, e.network_id)
    LEFT JOIN affiliate_sellers sl ON sl.id = COALESCE(o.seller_id, e.seller_id)
    WHERE e.master_product_id = ${productId}::uuid ORDER BY e.at DESC, e.id DESC LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  const net = r.network_name ? String(r.network_name) : '';
  const nick = r.nickname ? String(r.nickname) : '';
  return {
    at: new Date(r.at as string | Date).toISOString(),
    minCents: Number(r.min_cents),
    prevMinCents: asNum(r.prev_min_cents),
    offerId: (r.offer_id as string | null) ?? null,
    store: nick ? `${nick} (${net})` : net || null,
  };
}

/**
 * Menor preço de referência de cada dia. Padrão: o mínimo gravado no estado do dia (exato). Se o dono do mínimo do dia
 * é vendedor fraco e a config os exclui (`LOWS_INCLUDE_WEAK_SELLER = false`), o dia é RECALCULADO com a mesma função pura
 * das tabelas (`computeDayState`) sobre as ofertas sem vendedor fraco: nada é estimado, só se tira a oferta do conjunto.
 */
function dayMins(states: StateRow[], meta: Map<string, OfferMeta>, wideOffers: OfferInput[] | null, now: Date): Array<{ day: string; cents: number; offerId: string }> {
  const out: Array<{ day: string; cents: number; offerId: string }> = [];
  const strong = wideOffers ? wideOffers.filter((o) => !meta.get(o.offerId)?.weak) : null;
  for (const s of states) {
    if (s.quality === 'legacy' || s.quality === 'gap' || s.minCents == null || !s.minOfferId) continue;
    const weak = meta.get(s.minOfferId)?.weak === true;
    if (weak && !LOWS_INCLUDE_WEAK_SELLER) {
      if (!strong) continue;
      const st = computeDayState(s.day, now, strong);
      if (st.minCents != null && st.minOfferId) out.push({ day: s.day, cents: st.minCents, offerId: st.minOfferId });
      continue;
    }
    out.push({ day: s.day, cents: s.minCents, offerId: s.minOfferId });
  }
  return out;
}

function lowOf(mins: Array<{ day: string; cents: number; offerId: string }>, fromDay: string | null, windowDays: number | null, today: string, firstDay: string | null, meta: Map<string, OfferMeta>): LowRecord | null {
  const inWin = fromDay ? mins.filter((m) => m.day >= fromDay) : mins;
  if (!inWin.length) return null;
  // Empate: vale o dia mais antigo (quando o preço apareceu primeiro).
  const best = inWin.reduce((a, b) => (b.cents < a.cents || (b.cents === a.cents && b.day < a.day) ? b : a));
  const span = firstDay ? Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${firstDay}T12:00:00Z`).getTime()) / 86_400_000) + 1 : 0;
  return { cents: best.cents, day: best.day, store: meta.get(best.offerId)?.label ?? 'Loja não identificada', coverageDays: windowDays ? Math.min(windowDays, span) : span };
}

async function loadPriceMetricsV2(masterProductId: string): Promise<PriceMetricsV2> {
  const now = new Date();
  const today = spDay(now);
  const states = await loadStates(masterProductId, today);
  const measured = states.filter((s) => s.quality === 'complete' || s.quality === 'partial');
  const legacyDays = states.filter((s) => s.quality === 'legacy').length;
  const firstDay = measured.length ? measured[0].day : null;

  const [meta, liveOffers, lastEvent] = await Promise.all([
    loadOfferMeta(masterProductId),
    loadLiveOffers(masterProductId, now),
    loadLastEvent(masterProductId),
  ]);

  // Só carrega o histórico largo se algum dia tem o mínimo detido por vendedor fraco e a config os exclui.
  const needsWide = !LOWS_INCLUDE_WEAK_SELLER && measured.some((s) => s.minOfferId && meta.get(s.minOfferId)?.weak === true);
  const wide = needsWide ? ((await loadOffers(db, [masterProductId], addDays(PRICE_DAILY_REGIME_START, -OFFER_ACTIVE_DAYS))).get(masterProductId) ?? []) : null;
  const mins = dayMins(measured, meta, wide, now);
  // Mínimos COM vendedor fraco (estado gravado, sem filtro): só para saber se a regra de exclusão mudou algum mínimo.
  const minsWithWeak = measured.filter((s) => s.minCents != null && s.minOfferId).map((s) => ({ day: s.day, cents: s.minCents as number, offerId: s.minOfferId as string }));

  const from30 = addDays(today, -29);
  const from90 = addDays(today, -89);
  const lows = {
    d30: lowOf(mins, from30, 30, today, firstDay, meta),
    d90: lowOf(mins, from90, 90, today, firstDay, meta),
    all: lowOf(mins, null, null, today, firstDay, meta),
  };

  const lowsWithWeak = {
    d30: lowOf(minsWithWeak, from30, 30, today, firstDay, meta),
    d90: lowOf(minsWithWeak, from90, 90, today, firstDay, meta),
    all: lowOf(minsWithWeak, null, null, today, firstDay, meta),
  };
  const weakChangedLows = (['d30', 'd90', 'all'] as const).some((k) => (lows[k]?.cents ?? null) !== (lowsWithWeak[k]?.cents ?? null));

  // Preço agora = menor preço elegível vigente lido do CADASTRO de ofertas (todas as lojas elegíveis, cotação e checagem <= 48 h;
  // o vendedor fraco só pesa nas referências de mínimo).
  const live = computeLiveMinFromOffers(liveOffers, now);
  const current = live ? live.minCents : null;
  const holderWeak = live ? meta.get(live.offerId)?.weak === true : false;

  // Janela de 30 dias: mesma base (oferta-dia) do gráfico.
  const days30: PeriodDay[] = measured.filter((s) => s.day >= from30 && s.members).map((s) => ({ day: s.day, members: s.members as Record<string, number>, minCents: s.minCents }));
  const pm = computePeriodMetrics(days30, current);
  const periodDaysOf = (from: string | null): PeriodDay[] =>
    measured.filter((s) => s.members && (!from || s.day >= from)).map((s) => ({ day: s.day, members: s.members as Record<string, number>, minCents: s.minCents }));
  const averages = {
    d30: computePeriodRef(periodDaysOf(from30), 30),
    d90: computePeriodRef(periodDaysOf(from90), 90),
    all: computePeriodRef(periodDaysOf(null), null),
  };
  const median30 = pm.medianOfferDayCents != null ? Math.round(pm.medianOfferDayCents) : null;

  // Fato: preço agora vs mediana das lojas HOJE (lojas distintas, não anúncios).
  // MESMA régua de frescor do preço agora (cotação E checagem <= 48 h): `loadLiveOffers` filtra só pela checagem, então aqui a oferta sem
  // cotação recente não conta como loja (nunca divergir de `computeLiveMinFromOffers` e da lista "Lojas de hoje").
  const freshLive = liveOffers.filter((o) => ofertaFresca(o, now));
  const storeOffers = freshLive.map((o) => ({ storeKey: o.sellerId ?? o.networkId ?? o.offerId, priceCents: o.priceCents, avgExcluded: o.avgExcluded === true }));
  const storesNow = storesToday(storeOffers);
  // Mediana das lojas = COMPARAÇÃO: oferta "fora da média" (0044) segue na lista e na contagem de lojas, mas não entra na mediana.
  const storesCmp = storesToday(storeOffers.filter((o) => !o.avgExcluded));
  // Menor preço de vendedor de baixa reputação não é comparado em percentual com a mediana (só fatos, com a nota).
  // Redes das lojas contadas: ofertas frescas dentro da faixa de preços que `storesToday` manteve (as descartadas por outlier ficam fora da faixa).
  const storeMin = storesNow.storePrices.length ? storesNow.storePrices[0] : null;
  const storeMax = storesNow.storePrices.length ? storesNow.storePrices[storesNow.storePrices.length - 1] : null;
  const storeNetworks = [
    ...new Set(
      freshLive
        .filter((o) => storeMin != null && storeMax != null && o.priceCents >= storeMin && o.priceCents <= storeMax)
        .map((o) => meta.get(o.offerId)?.network ?? '')
        .filter((n) => n !== '')
    ),
  ].sort();
  // Menor preço de oferta "fora da média": aparece como fato, mas não é comparado em percentual com a mediana.
  const holderOutOfAvg = live ? liveOffers.find((o) => o.offerId === live.offerId)?.avgExcluded === true : false;
  const storesComparison = holderWeak || holderOutOfAvg ? null : compareToStoresMedian(current, storesCmp.medianCents);

  // Série dos MÍNIMOS DIÁRIOS dos últimos 30 dias, sem hoje (o preço agora é comparado com o passado), e dias medidos (>= 3 lojas).
  const yesterday = addDays(today, -1);
  const seriesMins = mins.filter((m) => m.day >= from30 && m.day < today).map((m) => m.cents);
  const measuredDays = countMeasuredDays(measured.filter((s) => s.day < today), yesterday, JUDGEMENT_MEASURED_WINDOW_DAYS, JUDGEMENT_MIN_STORES_PER_DAY);
  const measuredDays30 = countMeasuredDays(measured, today, 30, JUDGEMENT_MIN_STORES_PER_DAY);
  const observed = observedRange(mins.filter((m) => m.day >= from30).map((m) => m.cents));

  // Juízo: implementado, mas DESLIGADO por VERDICT_JUDGEMENT_ENABLED (sem backtest, só fatos).
  let judgement: Judgement | null = null;
  if (VERDICT_JUDGEMENT_ENABLED) {
    const holderId = live?.offerId ?? null;
    const holderStore = live ? (live.sellerId ?? live.networkId ?? live.offerId) : null;
    const snap = holderId ? await loadHolderSnapshots(holderId) : { lastPrices: [] as number[] };
    const corroborated = live
      ? isLowestCorroborated({
          currentCents: live.minCents,
          holderRecheckGapMs: live.checkedAt.getTime() - live.observedAt.getTime(),
          holderLastPrices: snap.lastPrices,
          otherStorePricesCents: storeOffers.filter((o) => o.storeKey !== holderStore).map((o) => o.priceCents),
        })
      : false;
    const base = { dailyMinsCents: seriesMins, measuredDays, currentHolderIsWeak: holderWeak, weakIncludedInLows: LOWS_INCLUDE_WEAK_SELLER, corroborated };
    // Histerese: o rótulo que o preço anterior (antes da última mudança do menor preço) teria tido.
    const prevCents = lastEvent && live && lastEvent.minCents === live.minCents ? lastEvent.prevMinCents : null;
    const previousKind = prevCents ? computeJudgement({ ...base, currentCents: prevCents }).kind : null;
    judgement = computeJudgement({ ...base, currentCents: current, previousKind });
  }

  const shortReasons = periodShortReasons({ distinctOffers: pm.distinctOffers, offerDays: pm.offerDays, spanDays: pm.spanDays });
  const shortHistory = shortReasons.length > 0 || measuredDays < JUDGEMENT_MIN_MEASURED_DAYS;
  const unlockDay = VERDICT_JUDGEMENT_ENABLED
    ? estimateUnlockDay({ measuredDays, today, qualifiesToday: storesNow.storeCount >= JUDGEMENT_MIN_STORES_PER_DAY })
    : null;
  const trackingDays = firstDay ? Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${firstDay}T12:00:00Z`).getTime()) / 86_400_000) + 1 : 0;
  const dataBase = {
    level: computeDataBase({ hasCurrent: current != null, measuredDays30, storesToday: storesNow.storeCount, freshOffers: live?.freshOffers ?? 0 }),
    measuredDays30,
    stores: storesNow.storeCount,
    range: observed,
  };

  // O log só vale como "última mudança" quando o evento é da oferta que detém o menor preço agora (id da oferta); sem id,
  // cai no valor e, com empate de preço, a loja não é afirmada. Senão a lacuna fica lacuna.
  const match = matchMinEvent(lastEvent, live);
  const eventMatches = match.matched;
  const weakNotice = weakSellerNotice({ nowCents: live ? live.minCents : null, low30Cents: lows.d30?.cents ?? null, weakExcluded: !LOWS_INCLUDE_WEAK_SELLER, weakChangedLows });
  return {
    now: live
      ? {
          cents: live.minCents,
          store: match.storeOfferId ? (meta.get(match.storeOfferId)?.label ?? 'Loja') : live.tiedOfferIds.length <= 1 ? (meta.get(live.offerId)?.label ?? 'Loja') : null,
          lastChangeAt: eventMatches ? (lastEvent as { at: string }).at : null,
          prevCents: eventMatches ? (lastEvent as { prevMinCents: number | null }).prevMinCents : null,
          quotedAt: live.observedAt.toISOString(),
          checkedAt: live.checkedAt.toISOString(),
          tiedOffers: live.tiedAtMin,
          freshOffers: live.freshOffers,
          weakSeller: holderWeak,
        }
      : null,
    stores: { count: storesNow.storeCount, medianCents: storesCmp.medianCents, networks: storeNetworks },
    storesComparison,
    decision: decisionSentence(storesComparison, storesNow.storeCount, { weakHolder: holderWeak }),
    lastEvent: lastEvent ? { at: lastEvent.at, cents: lastEvent.minCents, prevCents: lastEvent.prevMinCents, store: lastEvent.store, matchesNow: eventMatches } : null,
    judgementEnabled: VERDICT_JUDGEMENT_ENABLED,
    judgement,
    measuredDays,
    measuredDaysNeeded: JUDGEMENT_MIN_MEASURED_DAYS,
    unlockDay,
    shortHistory,
    shortReasons,
    trackingDays,
    measuredDaysTotal: measured.filter(isChartMeasuredDay).length,
    outOfBandOffers: contarForaDaFaixa(liveOffers, now),
    observed,
    dataBase,
    median30Cents: median30,
    period30: { distinctOffers: pm.distinctOffers, offerDays: pm.offerDays, spanDays: pm.spanDays },
    lows,
    averages,
    legacyDays,
    firstDay,
    weakSellerInLows: LOWS_INCLUDE_WEAK_SELLER,
    weakSellerChangedLows: weakChangedLows,
    weakNotice,
  };
}

/** Versão em cache SWR (60 s fresco). A página trata falha/timeout com `.catch(() => null)` e cai no comportamento anterior. */
export const getPriceMetricsV2: (masterProductId: string) => Promise<PriceMetricsV2> = createCachedQuery(
  loadPriceMetricsV2,
  ['price-metrics-v2-8'],
  { revalidate: 60, coldTimeoutSeconds: 5, live: true, hardTimeoutSeconds: 20 }
);

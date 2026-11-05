// Módulo PURO (sem banco, sem server-only, sem React): prepara os dados do gráfico de preço V2 (fase 3, ata 2026-11-05).
// Entrada = linhas já gravadas em price_daily_state / price_min_events (dado real medido). Nada aqui inventa, interpola
// ou liga ponto sobre lacuna: cada "corrida" de dias medidos consecutivos vira um segmento próprio; entre corridas não há linha.
import {
  FRESH_MAX_AGE_MS,
  addDays,
  computePeriodMetrics,
  spDay,
  spDayBounds,
  type PeriodDay,
} from '@/lib/pricing/daily-state';

export type ChartTf = '1D' | '1S' | '1M' | '3M' | 'Tudo';
export const CHART_TFS: ChartTf[] = ['1D', '1S', '1M', '3M', 'Tudo'];
/** Dias civis da janela (hoje incluído). null = todo o histórico medido. */
export const TF_DAYS: Record<ChartTf, number | null> = { '1D': 1, '1S': 7, '1M': 30, '3M': 90, Tudo: null };
const DAY_MS = 86_400_000;
const MIN_X_SPAN_MS = 6 * 3_600_000;

export interface ChartDay {
  day: string;
  minCents: number | null;
  /** Média do dia (M_d): só existe com 3 ou mais ofertas. */
  avgCents: number | null;
  medianCents: number | null;
  nOffers: number;
  quality: 'complete' | 'partial' | 'gap' | 'legacy';
  /** Instante (ISO) da última cotação da oferta que detém o menor do dia: âncora quando não há evento. */
  anchorAt: string | null;
}

export interface ChartEvent {
  at: string;
  minCents: number;
  prevMinCents: number | null;
  store: string;
  weak: boolean;
}

/** Média e mediana HISTÓRICAS de um período (mesma base do selo): oferta-dias, não médias diárias. */
export interface PeriodRef {
  /** soma dos preços oferta-dia / nº de oferta-dias, em centavos (arredondado). */
  avgCents: number | null;
  medianCents: number | null;
  offerDays: number;
  distinctOffers: number;
  /** Dias da janela com dado medido. */
  coveredDays: number;
  /** Dias da janela (null em "Tudo": a janela é o próprio histórico). */
  windowDays: number | null;
  /** Só se mostra a referência com 3 ou mais ofertas distintas (menos é opinião de uma ou duas lojas). */
  showable: boolean;
}

export interface ChartInput {
  days: ChartDay[];
  events: ChartEvent[];
  /** Cotação mais recente de oferta ativa elegível (ISO). null = nenhuma. */
  lastQuoteAt: string | null;
  refs: Record<ChartTf, PeriodRef>;
  legacyDays: number;
}

/** Período a partir de dias já calculados (uma definição só; também usada por price-metrics-v2.ts). */
export function computePeriodRef(days: PeriodDay[], windowDays: number | null): PeriodRef {
  const pm = computePeriodMetrics(days, null);
  const coveredDays = days.filter((d) => Object.keys(d.members).length > 0).length;
  return {
    avgCents: pm.avgOfferDayCents != null ? Math.round(pm.avgOfferDayCents) : null,
    medianCents: pm.medianOfferDayCents != null ? Math.round(pm.medianOfferDayCents) : null,
    offerDays: pm.offerDays,
    distinctOffers: pm.distinctOffers,
    coveredDays,
    windowDays,
    showable: pm.distinctOffers >= 3 && pm.avgOfferDayCents != null,
  };
}

export interface Pt {
  t: number;
  v: number;
  /** O menor preço neste degrau é de vendedor de baixa reputação (só nos pontos vindos de evento gravado). */
  weak?: boolean;
}
export interface AvgPt extends Pt {
  day: string;
  n: number;
}
export interface DropMarker {
  t: number;
  v: number;
  prev: number;
  store: string;
  weak: boolean;
}

/** Marcador de queda só para quedas relevantes (>= 3% do menor preço anterior); as menores ficam só na lista de mudanças. */
export const MIN_DROP_MARKER_PERCENT = 3;
export function isRelevantDrop(prev: number, now: number): boolean {
  return prev > 0 && now < prev && ((prev - now) / prev) * 100 >= MIN_DROP_MARKER_PERCENT - 1e-9;
}

/** Camadas opcionais do gráfico (padrão da tela: todas desligadas; os testes e quem não passa opções recebem todas). */
export interface ChartLayers {
  avgDay: boolean;
  avgHistorical: boolean;
}

export type ChartLevel = 'none' | 'single' | 'points' | 'short' | 'full';

export interface ChartModel {
  level: ChartLevel;
  measuredDays: number;
  tf: ChartTf;
  t0: number;
  t1: number;
  /** Degraus do menor preço, um segmento por corrida de dias medidos. */
  segments: Pt[][];
  /** Degraus em que o menor preço desenhado é de vendedor de baixa reputação (cada um com o valor e o intervalo real). */
  weakSteps: Array<{ t0: number; t1: number; v: number }>;
  /** Trecho sem cotação recente (> 48 h): valor carregado, tracejado cinza. */
  stale: { t0: number; t1: number; v: number } | null;
  /** Curva "média do dia" (só n >= 3), um segmento por corrida de dias consecutivos. */
  avgSegments: AvgPt[][];
  drops: DropMarker[];
  /** Todas as mudanças do menor preço na janela, da mais recente para a mais antiga. */
  events: ChartEvent[];
  ref: PeriodRef | null;
  y: { lo: number; hi: number; ticks: number[] } | null;
  firstMeasuredAt: number | null;
  /** Dias da janela com menor preço medido. */
  days: Map<string, ChartDay>;
  eventTimes: Array<{ t: number; ev: ChartEvent }>;
}

function msOf(iso: string): number {
  return new Date(iso).getTime();
}

function groupRuns(days: string[]): string[][] {
  const runs: string[][] = [];
  for (const d of days) {
    const cur = runs[runs.length - 1];
    if (cur && addDays(cur[cur.length - 1], 1) === d) cur.push(d);
    else runs.push([d]);
  }
  return runs;
}

function niceTicks(lo: number, hi: number, target = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Degrau vigente em t (último ponto <= t). */
function stepAt(seg: Pt[], t: number): Pt {
  let cur = seg[0];
  for (const p of seg) {
    if (p.t <= t) cur = p;
    else break;
  }
  return cur;
}
function stepValueAt(seg: Pt[], t: number): number {
  return stepAt(seg, t).v;
}

function clipSegment(seg: Pt[], t0: number, t1: number): Pt[] | null {
  if (!seg.length) return null;
  const end = seg[seg.length - 1].t;
  if (end < t0 || seg[0].t > t1) return null;
  const out: Pt[] = [];
  if (seg[0].t < t0) {
    const cur = stepAt(seg, t0);
    out.push({ t: t0, v: cur.v, weak: cur.weak });
  }
  for (const p of seg) if (p.t >= t0 && p.t <= t1) out.push(p);
  return out.length ? out : null;
}

/**
 * Eventos que se sucedem em até SWEEP_SETTLE_MS no INÍCIO de uma corrida pertencem à mesma varredura de coleta: o primeiro
 * "menor preço" gravado só viu as ofertas já coletadas até ali (ex.: R$ 300 e, 0,2 s depois, R$ 120 do Halo Wars 2).
 * Desenhá-lo faria a linha nascer no topo do eixo numa queda vertical que não é preço de mercado. A linha começa no
 * último evento do aglomerado (o primeiro ponto estável). Os eventos continuam todos na lista de mudanças.
 */
export const SWEEP_SETTLE_MS = 10 * 60_000;
export function trimSweepStart<T extends { at: string }>(runEvents: T[]): T[] {
  let k = 0;
  while (k + 1 < runEvents.length && msOf(runEvents[k + 1].at) - msOf(runEvents[0].at) <= SWEEP_SETTLE_MS) k++;
  return k > 0 ? runEvents.slice(k) : runEvents;
}

export function buildChartModel(input: ChartInput, tf: ChartTf, nowMs: number, layers: ChartLayers = { avgDay: true, avgHistorical: true }): ChartModel {
  const dayMap = new Map(input.days.map((d) => [d.day, d]));
  const measured = input.days.filter((d) => (d.quality === 'complete' || d.quality === 'partial') && d.minCents != null).sort((a, b) => (a.day < b.day ? -1 : 1));
  const events = [...input.events].sort((a, b) => msOf(a.at) - msOf(b.at));
  // Mesmo instante repetido: vale o último gravado.
  const evs = events.filter((e, i) => i === events.length - 1 || msOf(events[i + 1].at) !== msOf(e.at));

  const lastQuote = input.lastQuoteAt ? msOf(input.lastQuoteAt) : null;
  const freshUntil = lastQuote != null ? lastQuote + FRESH_MAX_AGE_MS : null;
  const isFresh = freshUntil != null && nowMs <= freshUntil;

  const runs = groupRuns(measured.map((d) => d.day));
  const full: Pt[][] = [];
  runs.forEach((run, ri) => {
    const isLast = ri === runs.length - 1;
    const tStart = spDayBounds(run[0]).start.getTime();
    let tEnd = spDayBounds(run[run.length - 1]).end.getTime();
    if (isLast) tEnd = isFresh ? nowMs : Math.min(tEnd, freshUntil ?? tEnd, nowMs);
    else tEnd = Math.min(tEnd, nowMs);
    const inRun = trimSweepStart(evs.filter((e) => msOf(e.at) >= tStart && msOf(e.at) < tEnd));
    const pts: Pt[] = [];
    const first = dayMap.get(run[0]);
    const anchor = first?.anchorAt ? msOf(first.anchorAt) : null;
    // Âncora do 1º dia: só quando nenhum evento do log cobre o início da corrida (a medição existe, o evento não foi gravado).
    if (first && first.minCents != null && anchor != null && anchor >= tStart && anchor < tEnd && (!inRun.length || anchor < msOf(inRun[0].at))) {
      pts.push({ t: anchor, v: first.minCents });
    }
    for (const e of inRun) pts.push({ t: msOf(e.at), v: e.minCents, weak: e.weak });
    if (!pts.length) return;
    const last = pts[pts.length - 1];
    if (tEnd > last.t) pts.push({ t: tEnd, v: last.v, weak: last.weak });
    full.push(pts);
  });

  const firstMeasuredAt = full.length ? full[0][0].t : null;
  const win = TF_DAYS[tf];
  let t0 = win == null ? (firstMeasuredAt ?? nowMs) : nowMs - (win === 1 ? DAY_MS : win * DAY_MS);
  if (firstMeasuredAt != null) t0 = Math.max(t0, firstMeasuredAt);
  const t1 = nowMs;
  if (t1 - t0 < MIN_X_SPAN_MS) t0 = t1 - MIN_X_SPAN_MS;

  const segments = full.map((s) => clipSegment(s, t0, t1)).filter((s): s is Pt[] => s != null);

  // Trecho sem cotação recente: carrega o último valor conhecido, tracejado e cinza, nunca como medição.
  let stale: ChartModel['stale'] = null;
  if (full.length && !isFresh) {
    const lastSeg = full[full.length - 1];
    const end = lastSeg[lastSeg.length - 1];
    if (nowMs > end.t) {
      const s0 = Math.max(end.t, t0);
      if (nowMs > s0) stale = { t0: s0, t1: nowMs, v: end.v };
    }
  }

  // Curva "média do dia": ponto ao meio-dia de Brasília (hoje: no máximo agora); só n >= 3; quebra em dia sem média.
  const avgDays = input.days.filter((d) => (d.quality === 'complete') && d.avgCents != null).sort((a, b) => (a.day < b.day ? -1 : 1));
  const avgSegments: AvgPt[][] = groupRuns(avgDays.map((d) => d.day))
    .map((run) =>
      run
        .map((day) => {
          const d = dayMap.get(day) as ChartDay;
          const b = spDayBounds(day);
          if (b.end.getTime() <= t0 || b.start.getTime() > t1) return null;
          const noon = b.start.getTime() + DAY_MS / 2;
          return { t: Math.min(Math.max(noon, t0), t1), v: d.avgCents as number, day, n: d.nOffers } as AvgPt;
        })
        .filter((p): p is AvgPt => p != null)
    )
    .filter((s) => s.length);

  const weakSteps: ChartModel['weakSteps'] = [];
  for (const s of segments) {
    for (let i = 0; i + 1 < s.length; i++) if (s[i].weak) weakSteps.push({ t0: s[i].t, t1: s[i + 1].t, v: s[i].v });
  }

  const inSeg = (t: number) => segments.some((s) => t >= s[0].t && t <= s[s.length - 1].t);
  const winEvents = evs.filter((e) => msOf(e.at) >= t0 && msOf(e.at) <= t1 && inSeg(msOf(e.at)));
  const drops: DropMarker[] = winEvents
    .filter((e) => e.prevMinCents != null && isRelevantDrop(e.prevMinCents, e.minCents))
    // Evento que abre um segmento (início da linha) não é queda desenhada: não há degrau antes dele.
    .filter((e) => !segments.some((s) => s[0].t === msOf(e.at)))
    .map((e) => ({ t: msOf(e.at), v: e.minCents, prev: e.prevMinCents as number, store: e.store, weak: e.weak }));

  const ref = input.refs[tf]?.showable ? input.refs[tf] : null;

  const vals: number[] = [];
  for (const s of segments) for (const p of s) vals.push(p.v);
  if (stale) vals.push(stale.v);
  if (layers.avgDay) for (const s of avgSegments) for (const p of s) vals.push(p.v);
  if (vals.length && ref) {
    if (ref.avgCents != null && layers.avgHistorical) vals.push(ref.avgCents);
    if (ref.medianCents != null) vals.push(ref.medianCents);
  }
  let y: ChartModel['y'] = null;
  if (vals.length) {
    const lo0 = Math.min(...vals);
    const hi0 = Math.max(...vals);
    const span = hi0 - lo0;
    // Folga proporcional à amplitude real (nada de piso fixo em reais); sem amplitude, 2% do valor.
    const pad = span > 0 ? span * 0.12 : Math.max(hi0 * 0.02, 1);
    const lo = Math.max(0, lo0 - pad);
    const hi = hi0 + pad;
    y = { lo, hi, ticks: niceTicks(lo, hi) };
  }

  const m = measured.length;
  const spanDays = m ? Math.round((new Date(`${measured[m - 1].day}T12:00:00Z`).getTime() - new Date(`${measured[0].day}T12:00:00Z`).getTime()) / DAY_MS) + 1 : 0;
  const level: ChartLevel = m === 0 || !segments.length ? 'none' : m === 1 ? 'single' : m === 2 ? 'points' : m >= 8 && spanDays >= 7 ? 'full' : 'short';

  return {
    level,
    measuredDays: m,
    tf,
    t0,
    t1,
    segments,
    weakSteps,
    stale,
    avgSegments,
    drops,
    events: [...winEvents].reverse(),
    ref,
    y,
    firstMeasuredAt,
    days: dayMap,
    eventTimes: evs.map((ev) => ({ t: msOf(ev.at), ev })),
  };
}

export interface Reading {
  t: number;
  day: string;
  /** Menor preço vigente em t. null = sem medição (lacuna). */
  minCents: number | null;
  stale: boolean;
  store: string | null;
  weak: boolean;
  /** Instante da mudança do menor preço que deu origem ao valor. */
  since: number | null;
  /** Média do dia (n >= 3). null = menos de 3 ofertas ou sem medição. */
  avgCents: number | null;
  /** Ofertas reais que entraram no dia (contagem do estado do dia, não amostra do gráfico). */
  nOffers: number | null;
  avgState: 'ok' | 'few' | 'none';
}

/** Leitura do gráfico no instante t (crosshair, toque). Só lê o que o modelo desenha. */
export function readAt(model: ChartModel, t: number): Reading {
  const day = spDay(new Date(t));
  const d = model.days.get(day) ?? null;
  let minCents: number | null = null;
  let stale = false;
  for (const s of model.segments) {
    if (t >= s[0].t && t <= s[s.length - 1].t) {
      minCents = stepValueAt(s, t);
      break;
    }
  }
  if (minCents == null && model.stale && t >= model.stale.t0 && t <= model.stale.t1) {
    minCents = model.stale.v;
    stale = true;
  }
  let store: string | null = null;
  let weak = false;
  let since: number | null = null;
  if (minCents != null) {
    // Vale o ÚLTIMO evento gravado até t, e só se o valor dele é o valor lido: casar por valor com um evento antigo
    // atribuiria a loja errada quando duas lojas já tiveram o mesmo preço.
    let lastEv: { t: number; ev: ChartEvent } | null = null;
    for (const e of model.eventTimes) {
      if (e.t <= t) lastEv = e;
      else break;
    }
    if (lastEv && lastEv.ev.minCents === minCents) {
      store = lastEv.ev.store;
      weak = lastEv.ev.weak;
      since = lastEv.t;
    }
  }
  const measuredDay = d != null && (d.quality === 'complete' || d.quality === 'partial');
  const avg = d && d.quality === 'complete' ? d.avgCents : null;
  return {
    t,
    day,
    minCents,
    stale,
    store,
    weak,
    since,
    avgCents: avg,
    nOffers: measuredDay ? d.nOffers : null,
    avgState: avg != null ? 'ok' : measuredDay ? 'few' : 'none',
  };
}

// ------------------------------------------------------------------------------------------------
// Apresentação (puro, em pixels): agregação visual de oscilações rápidas e posição de rótulos sem colisão.
// Nada aqui cria valor: os pontos agregados continuam sendo medições reais (só se desenha a faixa mínimo-máximo delas).
// ------------------------------------------------------------------------------------------------

export interface StepBand {
  t0: number;
  t1: number;
  lo: number;
  hi: number;
  /** Quantas mudanças reais do menor preço a faixa resume. */
  count: number;
}

/**
 * Oscilações mais próximas que `minPx` no eixo X viram uma faixa vertical (mínimo a máximo dos valores REAIS do trecho) e a linha
 * passa só pelo primeiro e pelo último valor do trecho. Sem isso, dezenas de eventos em poucos pixels viram um "pente" ilegível.
 * `xOf` converte tempo em pixel. O ponto final do segmento (agora) e o primeiro são sempre preservados.
 */
export function compressSteps(seg: Pt[], xOf: (t: number) => number, minPx = 3): { line: Pt[]; bands: StepBand[] } {
  const line: Pt[] = [];
  const bands: StepBand[] = [];
  let i = 0;
  while (i < seg.length) {
    let j = i;
    const gx = xOf(seg[i].t);
    while (j + 1 < seg.length && xOf(seg[j + 1].t) - gx < minPx) j++;
    if (j === i) {
      line.push(seg[i]);
    } else {
      const grp = seg.slice(i, j + 1);
      const vals = grp.map((p) => p.v);
      line.push(grp[0]);
      const last = grp[grp.length - 1];
      if (last.v !== grp[0].v || last.t !== grp[0].t) line.push({ t: last.t, v: last.v, weak: last.weak });
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      if (hi > lo) bands.push({ t0: grp[0].t, t1: last.t, lo, hi, count: grp.length });
    }
    i = j + 1;
  }
  return { line, bands };
}

export interface PxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface PxPoint {
  x: number;
  y: number;
}

/** Amostras (a cada ~3 px) das polilinhas que caem dentro do retângulo (com folga `pad`). */
export function polylineHits(rect: PxRect, poly: PxPoint[], pad = 2): number {
  let hits = 0;
  const inside = (x: number, y: number) => x >= rect.x0 - pad && x <= rect.x1 + pad && y >= rect.y0 - pad && y <= rect.y1 + pad;
  for (let i = 0; i < poly.length; i++) {
    if (i === 0) {
      if (inside(poly[0].x, poly[0].y)) hits++;
      continue;
    }
    const a = poly[i - 1];
    const b = poly[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let k = 1; k <= n; k++) if (inside(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)) hits++;
  }
  return hits;
}

const rectsOverlap = (a: PxRect, b: PxRect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Índice do candidato com menos cruzamentos com as linhas e sem sobrepor rótulos já colocados (empate: o primeiro). */
export function pickLabelSlot(candidates: PxRect[], polylines: PxPoint[][], avoid: PxRect[] = []): number {
  let best = 0;
  let bestCost = Infinity;
  candidates.forEach((c, idx) => {
    let cost = idx * 0.01;
    for (const pl of polylines) cost += polylineHits(c, pl);
    for (const a of avoid) if (rectsOverlap(c, a)) cost += 1000;
    if (cost < bestCost) {
      bestCost = cost;
      best = idx;
    }
  });
  return best;
}

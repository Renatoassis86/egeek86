// Módulo PURO (sem banco, sem server-only, sem React): modelo e geometria do CARTÃO DE HISTÓRICO DE PREÇO (ata 2026-11-10).
// Entrada = série diária já medida e calculada pela regra única (computeDayState). Nada aqui inventa, interpola ou suaviza:
// cada dia medido vira um degrau horizontal; dia sem medição fica em branco; o preço atual é um marcador à parte.
import { addDays, spDay, spDayBounds } from '@/lib/pricing/daily-state';

export const CARD_W = 1200;
export const CARD_H = 675;
/** Menos dias medidos que isto: não se gera cartão (o gráfico ficaria sem história para contar). */
export const CARD_MIN_DAYS = 3;
/** Janela máxima desenhada (dias civis, hoje incluído). Séries mais longas mostram só os últimos dias. */
export const CARD_MAX_DAYS = 90;
/** Preço atual só vale com confirmação de no máximo isto (a oferta tem de estar ativa, elegível e com link). */
export const CARD_CURRENT_MAX_AGE_MS = 6 * 3_600_000;
/** Média única só aparece com 3 ou mais ofertas distintas (mesma regra do gráfico do site). */
export const CARD_MIN_OFFERS_FOR_AVG = 3;
export const TITLE_MAX_CHARS = 60;

export const CARD_COLORS = {
  canvas: '#0B0908',
  surface: '#161311',
  text: '#F2E9D8',
  secondary: '#B8AD98',
  gold: '#D4AF37',
  orange: '#E8721C',
  grid: '#2A241E',
} as const;

// ------------------------------------------------------------------------------------------------
// Formatação
// ------------------------------------------------------------------------------------------------

/** "R$ 1.234,56" com espaço comum (a fonte do cartão não precisa de NBSP). */
export function formatMoney(cents: number): string {
  const v = Math.round(cents);
  const neg = v < 0;
  const abs = Math.abs(v);
  const reais = Math.floor(abs / 100);
  const cs = String(abs % 100).padStart(2, '0');
  const int = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}R$ ${int},${cs}`;
}

/** Rótulo curto de eixo: sem centavos quando o valor é inteiro ("R$ 300"), com centavos senão. */
export function formatAxisMoney(cents: number): string {
  return cents % 100 === 0 ? formatMoney(cents).replace(/,00$/, '') : formatMoney(cents);
}

/** '2026-11-10' -> '10/11'. */
export function formatDayShort(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

/** Instante -> 'dd/mm às hh:mm' no horário de Brasília. */
export function formatStamp(d: Date): string {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const hh = g('hour') === '24' ? '00' : g('hour');
  return `${g('day')}/${g('month')} às ${hh}:${g('minute')}`;
}

/** Percentual com 1 casa e vírgula: 12.34 -> '12,3%'. */
export function formatPct(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toFixed(1).replace('.', ',')}%`;
}

/** Trunca o título com reticências (no limite de uma palavra quando há espaço perto do corte). */
export function truncateTitle(raw: string, max = TITLE_MAX_CHARS): string {
  const s = Array.from(raw.replace(/\s+/g, ' ').trim());
  if (s.length <= max) return s.join('');
  let cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 0 && lastSpace >= max - 14) cut = cut.slice(0, lastSpace);
  return cut.join('').replace(/[\s,.;:\-–—(\[]+$/u, '') + '…';
}

const PLATFORM_LABELS: Record<string, string> = {
  switch_1: 'Nintendo Switch',
  switch_2: 'Nintendo Switch 2',
  ps4: 'PlayStation 4',
  ps5: 'PlayStation 5',
  xbox_one: 'Xbox One',
  xbox_series: 'Xbox Series X|S',
  xbox_360: 'Xbox 360',
};
/** Rótulo da plataforma; null quando desconhecida e sem rótulo legado (nada inventado). */
export function platformLabel(platform: string, legacyLabel: string | null): string | null {
  return PLATFORM_LABELS[platform] ?? legacyLabel ?? null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------------------------------------------------------------------------------------------------
// Escala e marcas dos eixos
// ------------------------------------------------------------------------------------------------

/** Marcas "redondas" (1, 2, 2.5, 5 x 10^k) dentro de [lo, hi], no mesmo valor da entrada (aqui, centavos). */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  step = Math.max(step, 1); // nunca abaixo de 1 centavo
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v));
  return out;
}

/** Domínio do eixo Y: SÓ de valores medidos (série, média, atual, menor); folga proporcional à amplitude; início explícito (não zero). */
export function yDomain(values: number[]): { lo: number; hi: number; ticks: number[] } | null {
  const vs = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!vs.length) return null;
  const lo0 = Math.min(...vs);
  const hi0 = Math.max(...vs);
  const span = hi0 - lo0;
  const pad = span > 0 ? span * 0.14 : Math.max(hi0 * 0.03, 100);
  const lo = Math.max(0, lo0 - pad);
  const hi = hi0 + pad;
  return { lo, hi, ticks: niceTicks(lo, hi) };
}

/** Dias (YYYY-MM-DD) que recebem rótulo no eixo X: no máximo `maxLabels`, começando no primeiro dia. */
export function xTickDays(firstDay: string, lastDay: string, maxLabels = 7): string[] {
  const days: string[] = [];
  for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) days.push(d);
  if (days.length <= maxLabels) return days;
  const step = Math.ceil(days.length / maxLabels);
  return days.filter((_, i) => i % step === 0);
}

/**
 * Posições verticais (centro) dos rótulos laterais sem sobreposição: ordena, empurra para baixo o que colide e, se estourar o fundo,
 * empurra de volta para cima. Preserva a ordem vertical dos pontos. Devolve na ordem da ENTRADA.
 */
export function spreadLabels(ys: number[], minGap: number, top: number, bottom: number): number[] {
  const idx = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const pos = idx.map((o) => Math.min(Math.max(o.y, top), bottom));
  for (let k = 1; k < pos.length; k++) if (pos[k] - pos[k - 1] < minGap) pos[k] = pos[k - 1] + minGap;
  if (pos.length && pos[pos.length - 1] > bottom) {
    pos[pos.length - 1] = bottom;
    for (let k = pos.length - 2; k >= 0; k--) if (pos[k + 1] - pos[k] < minGap) pos[k] = pos[k + 1] - minGap;
  }
  const out = new Array<number>(ys.length);
  idx.forEach((o, k) => (out[o.i] = pos[k]));
  return out;
}

// ------------------------------------------------------------------------------------------------
// Elegibilidade e modelo
// ------------------------------------------------------------------------------------------------

export interface CardDay {
  day: string;
  minCents: number;
  /** Dia com 1 a 2 ofertas (qualidade 'partial'): desenhado em tom mais claro. */
  partial: boolean;
}

export interface CardCurrent {
  cents: number;
  confirmedAt: Date;
  /** Nome da rede da oferta mais barata (Mercado Livre ou Shopee). */
  store: string;
}

export interface CardInput {
  title: string;
  platformLabel: string | null;
  /** Dias MEDIDOS (qualidade complete/partial com menor preço), qualquer ordem. */
  days: CardDay[];
  /** Média do período (oferta-dia) e ofertas distintas que a compõem; calculada sobre os mesmos dias desenhados. */
  avgCents: number | null;
  distinctOffers: number;
  current: CardCurrent | null;
  now: Date;
}

export type Ineligible = 'sem_preco_atual' | 'dias_insuficientes';

/** Decisão pura: o cartão só existe com preço atual válido e série com pelo menos CARD_MIN_DAYS dias medidos. */
export function cardEligibility(days: CardDay[], current: CardCurrent | null, now: Date): { ok: true } | { ok: false; reason: Ineligible } {
  if (!current || !(current.cents > 0) || now.getTime() - current.confirmedAt.getTime() > CARD_CURRENT_MAX_AGE_MS) return { ok: false, reason: 'sem_preco_atual' };
  const distinct = new Set(days.filter((d) => d.minCents > 0).map((d) => d.day));
  if (distinct.size < CARD_MIN_DAYS) return { ok: false, reason: 'dias_insuficientes' };
  return { ok: true };
}

export interface CardModel {
  title: string;
  platformLabel: string | null;
  days: CardDay[];
  firstDay: string;
  lastDay: string;
  today: string;
  nDays: number;
  record: { cents: number; day: string; fromCurrent: boolean };
  avg: { cents: number; distinctOffers: number } | null;
  current: CardCurrent;
  nowMs: number;
  y: { lo: number; hi: number; ticks: number[] };
  hasPartial: boolean;
}

export function buildCardModel(input: CardInput): CardModel | null {
  const now = input.now;
  const today = spDay(now);
  const windowFrom = addDays(today, -(CARD_MAX_DAYS - 1));
  const byDay = new Map<string, CardDay>();
  for (const d of input.days) if (d.minCents > 0 && d.day >= windowFrom && d.day <= today) byDay.set(d.day, d);
  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  const elig = cardEligibility(days, input.current, now);
  if (!elig.ok || !input.current) return null;

  let record = { cents: days[0].minCents, day: days[0].day, fromCurrent: false };
  for (const d of days) if (d.minCents < record.cents) record = { cents: d.minCents, day: d.day, fromCurrent: false };
  // Preço atual abaixo de todo o histórico: é cotação real, fresca e clicável, então é o novo menor registrado (hoje).
  if (input.current.cents < record.cents) record = { cents: input.current.cents, day: today, fromCurrent: true };

  const avg = input.avgCents != null && input.avgCents > 0 && input.distinctOffers >= CARD_MIN_OFFERS_FOR_AVG ? { cents: Math.round(input.avgCents), distinctOffers: input.distinctOffers } : null;
  const y = yDomain([...days.map((d) => d.minCents), input.current.cents, record.cents, ...(avg ? [avg.cents] : [])]);
  if (!y) return null;
  return {
    title: truncateTitle(input.title),
    platformLabel: input.platformLabel,
    days,
    firstDay: days[0].day,
    lastDay: days[days.length - 1].day,
    today,
    nDays: days.length,
    record,
    avg,
    current: input.current,
    nowMs: now.getTime(),
    y,
    hasPartial: days.some((d) => d.partial),
  };
}

// ------------------------------------------------------------------------------------------------
// Geometria (pixels)
// ------------------------------------------------------------------------------------------------

export const PLOT = { l: 128, t: 176, r: 905, b: 548 } as const;
export const CALLOUT_X = 930;
export const CALLOUT_W = 222;
export const CALLOUT_H = 82;

export interface HSeg { x0: number; x1: number; y: number; partial: boolean }
export interface VSeg { x: number; y0: number; y1: number }
export interface Callout {
  key: 'record' | 'avg' | 'current';
  label: string;
  value: string;
  sub: string;
  color: string;
  /** Y do ponto/linha de referência no gráfico. */
  pointY: number;
  /** Y do centro da caixa (já sem colisão). */
  boxCy: number;
}
export interface CardLayout {
  hSegs: HSeg[];
  vSegs: VSeg[];
  yTicks: Array<{ y: number; label: string }>;
  xTicks: Array<{ x: number; label: string }>;
  record: { x: number; y: number };
  avgY: number | null;
  current: { x: number; y: number };
  callouts: Callout[];
  /** Data de início/fim do eixo X. */
  t0: number;
  t1: number;
}

export function layoutCard(m: CardModel): CardLayout {
  const t0 = spDayBounds(m.firstDay).start.getTime();
  const t1 = m.nowMs;
  const xOf = (t: number) => PLOT.l + ((t - t0) / (t1 - t0)) * (PLOT.r - PLOT.l);
  const yOf = (v: number) => PLOT.b - ((v - m.y.lo) / (m.y.hi - m.y.lo)) * (PLOT.b - PLOT.t);

  const hSegs: HSeg[] = [];
  const vSegs: VSeg[] = [];
  let prev: { day: string; y: number; x1: number } | null = null;
  const dayX = new Map<string, { x0: number; x1: number }>();
  for (const d of m.days) {
    const b = spDayBounds(d.day);
    const x0 = xOf(b.start.getTime());
    const x1 = xOf(Math.min(b.end.getTime(), t1));
    const y = yOf(d.minCents);
    hSegs.push({ x0, x1, y, partial: d.partial });
    dayX.set(d.day, { x0, x1 });
    // Ligação vertical só entre dias CONSECUTIVOS medidos; lacuna fica lacuna.
    if (prev && addDays(prev.day, 1) === d.day && Math.abs(prev.y - y) > 0.01) vSegs.push({ x: x0, y0: prev.y, y1: y });
    prev = { day: d.day, y, x1 };
  }

  const recX = m.record.fromCurrent ? xOf(t1) : (() => { const r = dayX.get(m.record.day) as { x0: number; x1: number }; return (r.x0 + r.x1) / 2; })();
  const recY = yOf(m.record.cents);
  const curY = yOf(m.current.cents);
  const avgY = m.avg ? yOf(m.avg.cents) : null;

  const items: Array<Omit<Callout, 'boxCy'>> = [
    { key: 'record', label: 'MENOR REGISTRADO', value: formatMoney(m.record.cents), sub: m.record.fromCurrent ? 'hoje' : `em ${formatDayShort(m.record.day)}`, color: CARD_COLORS.text, pointY: recY },
  ];
  if (m.avg) items.push({ key: 'avg', label: 'MÉDIA ÚNICA', value: formatMoney(m.avg.cents), sub: `oferta-dia, ${m.avg.distinctOffers} ofertas`, color: CARD_COLORS.secondary, pointY: avgY as number });
  items.push({ key: 'current', label: 'ATUAL', value: formatMoney(m.current.cents), sub: m.current.store, color: CARD_COLORS.orange, pointY: curY });
  const cys = spreadLabels(items.map((i) => i.pointY), CALLOUT_H + 8, PLOT.t + CALLOUT_H / 2 - 10, PLOT.b - CALLOUT_H / 2 + 10);
  const callouts = items.map((i, k) => ({ ...i, boxCy: cys[k] }));

  return {
    hSegs,
    vSegs,
    yTicks: m.y.ticks.map((v) => ({ y: yOf(v), label: formatAxisMoney(v) })),
    xTicks: xTickDays(m.firstDay, m.lastDay).map((d) => ({ x: xOf(spDayBounds(d).start.getTime()), label: formatDayShort(d) })),
    record: { x: recX, y: recY },
    avgY,
    current: { x: xOf(t1), y: curY },
    callouts,
    t0,
    t1,
  };
}

// ------------------------------------------------------------------------------------------------
// Texto: legenda (HTML do Telegram) e texto alternativo
// ------------------------------------------------------------------------------------------------

export function buildCaption(m: CardModel): string {
  const range = `${formatDayShort(m.firstDay)} a ${formatDayShort(m.lastDay)}`;
  const l1 = `<b>Menor preço registrado:</b> ${formatMoney(m.record.cents)} ${m.record.fromCurrent ? 'hoje' : `em ${formatDayShort(m.record.day)}`} (série de ${range}, ${m.nDays} ${m.nDays === 1 ? 'dia' : 'dias'}).`;
  const l2 = m.avg
    ? `<b>Média entre as lojas:</b> ${formatMoney(m.avg.cents)} (cada oferta vale 1 por dia).`
    : `<b>Média entre as lojas:</b> ainda sem base, são necessárias ${CARD_MIN_OFFERS_FOR_AVG} ofertas.`;
  const cur = m.current.cents;
  const eqRec = Math.abs(((cur - m.record.cents) / m.record.cents) * 100) < 0.05;
  const recPhrase = eqRec ? 'igual ao menor registrado' : `${formatPct(Math.abs(((cur - m.record.cents) / m.record.cents) * 100))} ${cur > m.record.cents ? 'acima' : 'abaixo'} do menor registrado`;
  let avgPhrase = '';
  if (m.avg) {
    const pa = ((cur - m.avg.cents) / m.avg.cents) * 100;
    avgPhrase = Math.abs(pa) < 0.05 ? ' e igual à média' : ` e ${formatPct(Math.abs(pa))} ${pa > 0 ? 'acima' : 'abaixo'} da média`;
  }
  const l3 = `<b>Hoje:</b> ${formatMoney(cur)} (${escapeHtml(m.current.store)}), ${recPhrase}${avgPhrase}. Atualizado em ${formatStamp(m.current.confirmedAt)}.`;
  return [l1, l2, l3].join('\n');
}

export function buildAlt(m: CardModel): string {
  const parts = [
    `Histórico de preço de ${m.title}${m.platformLabel ? ` (${m.platformLabel})` : ''}, de ${formatDayShort(m.firstDay)} a ${formatDayShort(m.lastDay)}.`,
    `Menor registrado ${formatMoney(m.record.cents)}${m.record.fromCurrent ? ' hoje' : ` em ${formatDayShort(m.record.day)}`}.`,
    m.avg ? `Média entre as lojas ${formatMoney(m.avg.cents)}.` : 'Média ainda sem base mínima de ofertas.',
    `Preço atual ${formatMoney(m.current.cents)}.`,
  ];
  return parts.join(' ');
}

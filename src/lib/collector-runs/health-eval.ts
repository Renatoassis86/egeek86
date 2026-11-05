// Modulo PURO (sem banco, sem rede, sem server-only): avalia a saude do coletor a partir de linhas de collector_runs e de
// series de volume ja lidas. Devolve alertas; NAO envia nada. Quem le o banco e quem envia esta em
// src/server/observability/collector-health.ts (atras de flags). Dado ausente nunca vira "saudavel": vira alerta de
// "sem dado" ou fica de fora com motivo explicito (nada de numero inventado).
import { SLO } from './slo';

export interface RunRow {
  job: string;
  network: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  status: 'running' | 'ok' | 'partial' | 'error';
  checked: number;
  errors: number;
  rateLimited: number;
  misses: number;
  oldestDueAgeS: number | null;
}

export interface HourPoint {
  /** Inicio da hora (qualquer instante dentro dela serve; o agrupamento usa o instante exato recebido). */
  hour: Date;
  n: number;
}

export interface DayCloseState {
  /** Dia civil (America/Sao_Paulo) esperado fechado, 'YYYY-MM-DD'. */
  day: string;
  rowsTotal: number;
  rowsOpen: number;
}

export interface HealthInput {
  now: Date;
  runs: RunRow[];
  /** Series nomeadas de volume por hora (ex.: 'cotacoes' de affiliate_price_snapshots, 'confirmacoes' de collector_runs). */
  volumeSeries: { name: string; points: HourPoint[] }[];
  /** null = sombra do dia desligada (regra nao se aplica). */
  dayClose: DayCloseState | null;
}

export type Severity = 'critical' | 'warning';
export interface Alert {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
}

const MIN = 60_000;
const HOUR = 3_600_000;

/** Sao Paulo e UTC-3 fixo (sem horario de verao desde 2019). */
export function spHour(d: Date): number {
  return new Date(d.getTime() - 3 * HOUR).getUTCHours();
}
export function spDayOf(d: Date): string {
  return new Date(d.getTime() - 3 * HOUR).toISOString().slice(0, 10);
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Execucao 'running' ha mais que o limite = abandonada (timeout da funcao: nenhum finally roda). */
export function isAbandoned(r: RunRow, now: Date, abandonedAfterMin: number): boolean {
  return r.status === 'running' && now.getTime() - r.startedAt.getTime() > abandonedAfterMin * MIN;
}

function fmtMin(ms: number): string {
  const m = Math.round(ms / MIN);
  return m >= 120 ? `${(m / 60).toFixed(1)} h` : `${m} min`;
}

/** 1) Dead-man switch por rede: precisa existir execucao FINALIZADA (ok/partial) dentro do silencio maximo. */
export function evalDeadMan(input: HealthInput): Alert[] {
  const out: Alert[] = [];
  for (const rule of SLO.deadMan) {
    const mine = input.runs.filter((r) => r.job === rule.job && r.network === rule.network);
    const alive = mine
      .filter((r) => r.finishedAt && (r.status === 'ok' || r.status === 'partial'))
      .map((r) => r.finishedAt!.getTime());
    const last = alive.length ? Math.max(...alive) : null;
    const silence = last == null ? null : input.now.getTime() - last;
    if (last == null || silence! > rule.maxSilenceMin * MIN) {
      const abandoned = mine.filter((r) => isAbandoned(r, input.now, rule.abandonedAfterMin)).length;
      out.push({
        key: `dead_man:${rule.network}`,
        severity: 'critical',
        title: `Coletor ${rule.network} sem execucao concluida`,
        detail:
          (last == null
            ? 'Nenhuma execucao concluida registrada na janela lida.'
            : `Ultima concluida ha ${fmtMin(silence!)} (limite ${rule.maxSilenceMin} min; cron a cada ${rule.everyMinutes} min).`) +
          (abandoned > 0 ? ` ${abandoned} execucao(oes) abandonada(s) (timeout da funcao).` : ''),
      });
    }
  }
  return out;
}

/** 2) Idade da oferta devida mais velha, lida da execucao mais recente de cada job com a metrica. */
export function evalOldestDue(input: HealthInput): Alert[] {
  const out: Alert[] = [];
  for (const rule of SLO.deadMan) {
    const withMetric = input.runs
      .filter((r) => r.job === rule.job && r.network === rule.network && r.oldestDueAgeS != null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const last = withMetric[0];
    if (last && last.oldestDueAgeS! > SLO.oldestDueAgeMaxS) {
      out.push({
        key: `oldest_due:${rule.network}`,
        severity: 'warning',
        title: `Oferta devida mais velha em ${rule.network} passou de ${SLO.oldestDueAgeMaxS / 3600} h`,
        detail: `Idade ${(last.oldestDueAgeS! / 3600).toFixed(1)} h na execucao de ${last.startedAt.toISOString()}. Backlog acima da capacidade do lote ou coleta parada.`,
      });
    }
  }
  return out;
}

interface Rates {
  attempts: number;
  errorRate: number;
  rate429: number;
  missRate: number;
  rateLimited: number;
}

function ratesOf(rs: RunRow[]): Rates | null {
  let checked = 0, errors = 0, rl = 0, misses = 0;
  for (const r of rs) {
    checked += r.checked;
    errors += r.errors;
    rl += r.rateLimited;
    misses += r.misses;
  }
  const attempts = checked + errors;
  if (attempts === 0) return null;
  return { attempts, errorRate: errors / attempts, rate429: rl / attempts, missRate: misses / attempts, rateLimited: rl };
}

/** Limiar = max(multiplo x base, base + folga); sem linha de base valida, usa o limiar absoluto. */
export function threshold(base: number | null, rule: { multiple: number; slackAbs: number; fallbackAbs: number }): number {
  return base == null ? rule.fallbackAbs : Math.max(base * rule.multiple, base + rule.slackAbs);
}

/** 3) Taxa de erro, 429 e miss na ultima janela contra a linha de base (mediana das taxas horarias dos 7 dias anteriores). */
export function evalRates(input: HealthInput): Alert[] {
  const out: Alert[] = [];
  const winStart = input.now.getTime() - SLO.rateWindowMin * MIN;
  const baseStart = input.now.getTime() - SLO.baselineHours * HOUR;
  for (const rule of SLO.deadMan) {
    const mine = input.runs.filter((r) => r.job === rule.job && r.network === rule.network && r.finishedAt);
    const recent = ratesOf(mine.filter((r) => r.startedAt.getTime() >= winStart));
    if (!recent || recent.attempts < SLO.rateMinAttempts) continue;

    // Linha de base: taxa por hora cheia anterior a janela; mediana entre horas com tentativas suficientes.
    const byHour = new Map<number, RunRow[]>();
    for (const r of mine) {
      const t = r.startedAt.getTime();
      if (t >= winStart || t < baseStart) continue;
      const h = Math.floor(t / HOUR);
      const arr = byHour.get(h) ?? [];
      arr.push(r);
      byHour.set(h, arr);
    }
    const hourly = Array.from(byHour.values())
      .map(ratesOf)
      .filter((x): x is Rates => x != null && x.attempts >= SLO.rateMinAttempts);
    const hasBase = hourly.length >= SLO.baselineMinHours;
    const bErr = hasBase ? median(hourly.map((x) => x.errorRate)) : null;
    const b429 = hasBase ? median(hourly.map((x) => x.rate429)) : null;
    const bMiss = hasBase ? median(hourly.map((x) => x.missRate)) : null;
    const basis = hasBase ? `linha de base (${hourly.length} h)` : 'limiar absoluto (sem linha de base ainda)';
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

    const tErr = threshold(bErr, SLO.errorRate);
    if (recent.errorRate > tErr) {
      out.push({
        key: `error_rate:${rule.network}`,
        severity: 'warning',
        title: `Taxa de erro alta em ${rule.network}`,
        detail: `${pct(recent.errorRate)} na ultima hora (${recent.attempts} consultas); limiar ${pct(tErr)} por ${basis}.`,
      });
    }
    const t429 = threshold(b429, SLO.rate429);
    if (recent.rateLimited >= SLO.rate429.minCount && recent.rate429 > t429) {
      out.push({
        key: `rate_429:${rule.network}`,
        severity: 'critical',
        title: `Rate limit (429) em ${rule.network}`,
        detail: `${recent.rateLimited} respostas 429 (${pct(recent.rate429)}) na ultima hora; limiar ${pct(t429)} por ${basis}. Nao subir cadencia.`,
      });
    }
    const tMiss = threshold(bMiss, SLO.missRate);
    if (recent.missRate > tMiss) {
      out.push({
        key: `miss_rate:${rule.network}`,
        severity: 'warning',
        title: `Taxa de "sem vendedor" alta em ${rule.network}`,
        detail: `${pct(recent.missRate)} na ultima hora; limiar ${pct(tMiss)} por ${basis}. Pode expirar ofertas vivas.`,
      });
    }
  }
  return out;
}

/** 4) Queda de volume > dropPct: soma das ultimas N h contra a mediana das mesmas N h nos dias anteriores. */
export function evalVolumeDrop(input: HealthInput): Alert[] {
  const out: Alert[] = [];
  const { windowHours, dropPct, baselineDays, minBaseline } = SLO.volume;
  const winMs = windowHours * HOUR;
  const end = input.now.getTime();
  for (const s of input.volumeSeries) {
    const sumIn = (from: number, to: number) =>
      s.points.reduce((acc, p) => (p.hour.getTime() >= from && p.hour.getTime() < to ? acc + p.n : acc), 0);
    const current = sumIn(end - winMs, end);
    const prior: number[] = [];
    for (let d = 1; d <= baselineDays; d++) {
      const to = end - d * 24 * HOUR;
      prior.push(sumIn(to - winMs, to));
    }
    const base = median(prior);
    if (base == null || base < minBaseline) continue; // baseline insuficiente: nao alerta (nada de numero inventado)
    if (current < base * (1 - dropPct)) {
      out.push({
        key: `volume_drop:${s.name}`,
        severity: 'warning',
        title: `Queda de ${s.name} acima de ${Math.round(dropPct * 100)}%`,
        detail: `${current} nas ultimas ${windowHours} h contra mediana ${Math.round(base)} nas mesmas ${windowHours} h dos ${baselineDays} dias anteriores (${Math.round((1 - current / base) * 100)}% abaixo).`,
      });
    }
  }
  return out;
}

/** 5) Fechamento do dia: apos a hora limite (Sao Paulo), o dia anterior precisa existir e estar todo closed. */
export function evalDayClose(input: HealthInput): Alert[] {
  const dc = input.dayClose;
  if (!dc) return [];
  if (spHour(input.now) < SLO.dayCloseByHourSp) return [];
  if (dc.rowsTotal === 0 || dc.rowsOpen > 0) {
    return [
      {
        key: 'day_close',
        severity: 'warning',
        title: `Dia ${dc.day} nao fechou ate ${String(SLO.dayCloseByHourSp).padStart(2, '0')}:00`,
        detail: dc.rowsTotal === 0 ? 'Nenhuma linha de price_daily_state para o dia.' : `${dc.rowsOpen} de ${dc.rowsTotal} produtos ainda abertos.`,
      },
    ];
  }
  return [];
}

export function evaluateHealth(input: HealthInput): Alert[] {
  return [...evalDeadMan(input), ...evalOldestDue(input), ...evalRates(input), ...evalVolumeDrop(input), ...evalDayClose(input)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Texto para o Telegram (parse_mode HTML do sendTelegramMessage): sem segredos, sem links. */
export function formatAlertMessage(opened: Alert[], resolved: string[]): string {
  const lines: string[] = [];
  for (const a of opened) lines.push(`${a.severity === 'critical' ? '[CRITICO]' : '[ATENCAO]'} <b>${esc(a.title)}</b>\n${esc(a.detail)}`);
  for (const k of resolved) lines.push(`[RESOLVIDO] ${esc(k)}`);
  return `Coletor Espaco Geek 86\n\n${lines.join('\n\n')}`;
}

/** Decide o que enviar: alerta novo, ou aberto ha mais que `repeatEveryMs` sem reenvio; e quais chaves foram resolvidas. */
export function planNotifications(
  active: Alert[],
  state: { key: string; lastSentAt: Date | null; resolvedAt: Date | null }[],
  now: Date,
  repeatEveryMs = 6 * HOUR
): { send: Alert[]; resolve: string[] } {
  const open = new Map(state.filter((s) => !s.resolvedAt).map((s) => [s.key, s]));
  const send = active.filter((a) => {
    const s = open.get(a.key);
    return !s || !s.lastSentAt || now.getTime() - s.lastSentAt.getTime() >= repeatEveryMs;
  });
  const activeKeys = new Set(active.map((a) => a.key));
  const resolve = Array.from(open.keys()).filter((k) => !activeKeys.has(k));
  return { send, resolve };
}

// Sem 'server-only': orquestração PURA (sem banco, sem rede) de UMA FATIA da fila de semeadura rodando no servidor (cron).
// A parte com banco e API mora em src/server/collector/vertical/seed-vertical.ts, que injeta as dependências (`SeedSliceDeps`);
// aqui ficam as regras, para testar em tsx com fakes: dry-run, 429 com recuo, cursor, orçamento diário, freio Plus.
import { seedOrder, type NonGamesVertical, type SegmentConfig } from './config';
import { isVertical } from '../verticais';
import { CallBudgetExceeded, type MlClient } from './ml-api';
import { planSeed, type ExistingLookup, type SeedPlanEntry, type SeedReport } from './seed-plan';
import { DAILY_CALL_CAP, dayKeySP } from './seed-budget';
import { advanceCursor, allocate, cursorFor, emptyCursorState, nextWindow, SEARCH_PAGE_LIMIT, type CursorState } from './seed-schedule';
import { plusCallQuota, type QuotaResult } from './queue';

/**
 * SEMEADURA NO SERVIDOR (aprovada pelo dono em 2026-11-12: piloto de 24 h só na loja Eletrônicos). As chaves do ML só existem na Vercel
 * (sensitive), então a fila que o script `semear-vertical.ts --fila` roda na máquina do dono roda aqui, em fatias curtas por cron.
 *
 * - DESLIGADA por padrão: sem `SEMEADURA_LOJAS` (lista de lojas/verticais) a rota não faz nada.
 * - Dry-run por padrão (`apply=1` grava). Dry-run lê a API e o banco, não cria master/oferta e NÃO avança o cursor; só o orçamento do dia
 *   é cobrado (a cota do ML não distingue dry-run de apply).
 * - Estado persistente (cursor por tipo, orçamento do dia, recuo de 429, trava) em `system_config`; cache de 404 em outra linha.
 * - Para no PRIMEIRO 429: sem espera dentro do request (60 s), grava recuo (15, 30, 60, 120 min) e as próximas execuções pulam até lá.
 * - Freio Plus (PLUS_ML_HOURLY/DAILY_CALL_CAP) é somado com a reconfirmação: usa o consumo medido em collector_runs
 *   (collect-vertical + semear-vertical); sem medição (COLLECTOR_RUNS desligado) usa o registro de uso do próprio estado.
 */

/** Lojas aceitas em SEMEADURA_LOJAS (apelidos para o que o dono chama de "Eletrônicos"). */
const LOJA_ALIAS: Record<string, NonGamesVertical> = { eletronicos: 'eletroeletronicos', eletronico: 'eletroeletronicos', casa: 'eletrodomesticos', '3d': 'impressao3d' };

/** `SEMEADURA_LOJAS=eletroeletronicos` ou `eletroeletronicos,esporte`. Vazio/inválido = nenhuma (desligada). Nunca `games`. */
export function parseLojas(raw: string | undefined | null): NonGamesVertical[] {
  const out: NonGamesVertical[] = [];
  for (const part of (raw ?? '').split(',')) {
    const k = part.trim().toLowerCase();
    if (!k) continue;
    const v: string = LOJA_ALIAS[k] ?? k;
    if (isVertical(v) && (v as string) !== 'games' && !out.includes(v as NonGamesVertical)) out.push(v as NonGamesVertical);
  }
  return out;
}

/** Recuo depois de um 429 (minutos), por 429 consecutivo; depois do último degrau fica em 120. */
export const BACKOFF_429_MIN = [15, 30, 60, 120];
export const DEFAULT_RUN_CAP = 120;
/** Tempo de trabalho da fatia (o request tem 60 s): deixa folga para gravar o estado e fechar a execução. */
export const DEFAULT_BUDGET_MS = 48_000;
/** Cuidado com a trava: expira sozinha (processo morto não bloqueia a fila). */
export const LOCK_EXTRA_MS = 15_000;

export interface SeedServerState {
  version: 1;
  cursors: CursorState;
  /** 429 recebido: nenhuma execução chama a API antes deste instante (ISO). */
  blockedUntil: string | null;
  /** Quantos 429 seguidos (degrau do recuo). Zera numa execução sem 429. */
  backoffStep: number;
  /** Execução em andamento até este instante (ISO). */
  lockUntil: string | null;
  /** Chamadas cobradas por dia civil de São Paulo (teto de segurança de 12.000). */
  days: Record<string, number>;
  /** Registro de uso das últimas 24 h: [instante ms, chamadas]. Base do freio quando collector_runs não mede. */
  usage: Array<[number, number]>;
  lastRunAt: string | null;
}

export function emptyServerState(): SeedServerState {
  return { version: 1, cursors: emptyCursorState(), blockedUntil: null, backoffStep: 0, lockUntil: null, days: {}, usage: [], lastRunAt: null };
}

/** Lê o JSON gravado; qualquer forma estranha recomeça do vazio (o cursor só evita retrabalho; o teto do dia é refeito pelo uso medido). */
export function normalizeServerState(raw: unknown): SeedServerState {
  const base = emptyServerState();
  const j = raw as Partial<SeedServerState> | null | undefined;
  if (!j || typeof j !== 'object' || j.version !== 1) return base;
  const cursors = j.cursors && (j.cursors as CursorState).version === 1 && typeof (j.cursors as CursorState).segments === 'object' ? (j.cursors as CursorState) : base.cursors;
  const days: Record<string, number> = {};
  for (const [k, v] of Object.entries(j.days ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(Number(v))) days[k] = Math.max(0, Math.floor(Number(v)));
  const usage = Array.isArray(j.usage) ? j.usage.filter((u) => Array.isArray(u) && Number.isFinite(u[0]) && Number.isFinite(u[1])).map((u) => [Number(u[0]), Number(u[1])] as [number, number]) : [];
  return {
    version: 1,
    cursors,
    blockedUntil: typeof j.blockedUntil === 'string' ? j.blockedUntil : null,
    backoffStep: Number.isFinite(Number(j.backoffStep)) ? Math.max(0, Math.floor(Number(j.backoffStep))) : 0,
    lockUntil: typeof j.lockUntil === 'string' ? j.lockUntil : null,
    days,
    usage,
    lastRunAt: typeof j.lastRunAt === 'string' ? j.lastRunAt : null,
  };
}

export function usedInWindow(state: SeedServerState, windowMs: number, nowMs: number): number {
  return state.usage.filter(([t]) => t > nowMs - windowMs).reduce((n, [, c]) => n + c, 0);
}

/** Minutos de recuo para o N-ésimo 429 seguido (1 = primeiro). */
export function backoffMinutes(consecutive429: number): number {
  return BACKOFF_429_MIN[Math.min(Math.max(1, consecutive429), BACKOFF_429_MIN.length) - 1];
}

/** Estado depois da execução: cobra o uso, aplica/zera o recuo, solta a trava e poda o registro de 24 h. Pura. */
export function settleState(prev: SeedServerState, o: { now: Date; calls: number; rateLimited: boolean; cursors: CursorState; day: string }): SeedServerState {
  const nowMs = o.now.getTime();
  const step = o.rateLimited ? prev.backoffStep + 1 : 0;
  return {
    ...prev,
    cursors: o.cursors,
    days: { ...Object.fromEntries(Object.entries(prev.days).filter(([d]) => d >= shiftDay(o.day, -3))), [o.day]: (prev.days[o.day] ?? 0) + o.calls },
    usage: [...prev.usage.filter(([t]) => t > nowMs - 24 * 3_600_000), ...(o.calls > 0 ? [[nowMs, o.calls] as [number, number]] : [])],
    backoffStep: step,
    blockedUntil: o.rateLimited ? new Date(nowMs + backoffMinutes(step) * 60_000).toISOString() : null,
    lockUntil: null,
    lastRunAt: o.now.toISOString(),
  };
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Cache de 404 ("sem vendedor") com TTL e teto de tamanho (mantém a linha do banco pequena). */
export const NOT_FOUND_MAX_ENTRIES = 25_000;
export function pruneNotFoundMap(map: Record<string, string>, now: Date, ttlDays: number, max = NOT_FOUND_MAX_ENTRIES): Record<string, string> {
  const live = Object.entries(map).filter(([, at]) => {
    const t = Date.parse(at);
    return Number.isFinite(t) && now.getTime() - t < ttlDays * 86_400_000;
  });
  live.sort((a, b) => (a[1] < b[1] ? 1 : -1)); // mais recentes primeiro
  return Object.fromEntries(live.slice(0, max));
}

// ---------------------------------------------------------------------------------------------------------------------

function recentNotFound(at: string | undefined, nowMs: number, ttlDays: number): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && nowMs - t < ttlDays * 86_400_000;
}

/** O tempo da fatia acabou: parada limpa (o planejador a trata como teto de chamadas). */
export class TimeBudgetExceeded extends CallBudgetExceeded {}

export interface ApplyOutcome {
  masters: string[];
  offers: string[];
  skipped: number;
}

export interface SeedRunHandle {
  counters: { queries: number; checked: number; offersCreated: number; snapshotsWritten: number; errors: number };
  addError(message: string, kind?: string): void;
  finish(o?: { stoppedBecause?: string | null; budgetExhausted?: boolean; fatal?: boolean; meta?: Record<string, unknown> }): Promise<void>;
}

export interface SeedSliceDeps {
  nowMs(): number;
  loadState(): Promise<SeedServerState>;
  saveState(s: SeedServerState): Promise<void>;
  /** Cache de 404 em banco. `saveNotFound` recebe só o que esta execução acrescentou. */
  loadNotFound(): Promise<Record<string, string>>;
  saveNotFound(added: Record<string, string>): Promise<void>;
  /** Consumo MEDIDO do conjunto Plus (collector_runs: reconfirmação + semeadura) na última hora e em 24 h; null = não medido. */
  measuredPlusUsage(): Promise<{ h1: number; h24: number } | null>;
  /** Cliente do ML já autenticado, com o teto desta fatia; `beforeCall` é chamado antes de CADA chamada (conta e checa o relógio). */
  makeClient(o: { maxCalls: number; beforeCall: () => void }): Promise<MlClient>;
  buildLookup(): Promise<ExistingLookup & { remember(e: SeedPlanEntry, id: string): void }>;
  /** Só chamado em apply: cria masters/ofertas/cotação inicial dos planos. */
  applyPlans(plans: SeedPlanEntry[], masterByCatalog: Map<string, string>, lookup: ExistingLookup & { remember(e: SeedPlanEntry, id: string): void }): Promise<ApplyOutcome>;
  startRun(job: string): Promise<SeedRunHandle>;
  log?(msg: string): void;
}

export interface SeedSliceOptions {
  lojas: NonGamesVertical[];
  apply: boolean;
  /** Teto de chamadas desta fatia (padrão 120). */
  runCap?: number;
  budgetMs?: number;
  /** Teto diário de segurança da semeadura (padrão e máximo: 12.000). */
  dailyCap?: number;
  /** Freio Plus (PLUS_ML_*), o mesmo da reconfirmação. */
  plusHourlyCap: number;
  plusDailyCap: number;
  /** Dias de validade do cache de 404 (seed-budget NOT_FOUND_TTL_DAYS). */
  notFoundTtlDays?: number;
}

export type SeedSkipReason = 'desligada' | 'recuo_429' | 'em_andamento' | 'teto_diario' | 'freio_plus' | 'sem_tipos';

export interface SeedSliceSummary {
  skipped?: SeedSkipReason;
  apply: boolean;
  lojas: NonGamesVertical[];
  callCap: number;
  quotaLimitedBy: QuotaResult['limitedBy'] | null;
  apiCalls: number;
  dayUsed: number;
  dayLeft: number;
  blockedUntil: string | null;
  rateLimited: boolean;
  timedOut: boolean;
  cursorAdvanced: boolean;
  segments: Array<{ key: string; calls: number; planned: number; reviews: number; termsTouched: number; stoppedBecause: string | null; depth: number }>;
  mastersCreated: number;
  offersCreated: number;
  errors: string[];
}

function emptySummary(opts: SeedSliceOptions, extra: Partial<SeedSliceSummary> = {}): SeedSliceSummary {
  return {
    apply: opts.apply, lojas: opts.lojas, callCap: 0, quotaLimitedBy: null, apiCalls: 0, dayUsed: 0, dayLeft: 0, blockedUntil: null, rateLimited: false,
    timedOut: false, cursorAdvanced: false, segments: [], mastersCreated: 0, offersCreated: 0, errors: [], ...extra,
  };
}

/** Segmentos das lojas ligadas, na ordem de semeadura. */
export function segmentsForLojas(lojas: NonGamesVertical[]): SegmentConfig[] {
  return seedOrder().filter((s) => lojas.includes(s.vertical));
}

export async function runSeedSlice(opts: SeedSliceOptions, deps: SeedSliceDeps): Promise<SeedSliceSummary> {
  const log = deps.log ?? (() => {});
  if (opts.lojas.length === 0) return emptySummary(opts, { skipped: 'desligada' });
  const segments = segmentsForLojas(opts.lojas);
  if (segments.length === 0) return emptySummary(opts, { skipped: 'sem_tipos' });

  const startMs = deps.nowMs();
  const now = new Date(startMs);
  const deadline = startMs + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const dailyCap = Math.min(DAILY_CALL_CAP, Math.max(0, opts.dailyCap ?? DAILY_CALL_CAP));
  const day = dayKeySP(now);

  const state = await deps.loadState();
  const dayUsed = state.days[day] ?? 0;
  const dayLeft = Math.max(0, dailyCap - dayUsed);
  const base = { dayUsed, dayLeft, blockedUntil: state.blockedUntil };
  if (state.blockedUntil && Date.parse(state.blockedUntil) > startMs) return emptySummary(opts, { ...base, skipped: 'recuo_429' });
  if (state.lockUntil && Date.parse(state.lockUntil) > startMs) return emptySummary(opts, { ...base, skipped: 'em_andamento' });
  if (dayLeft <= 0) return emptySummary(opts, { ...base, skipped: 'teto_diario' });

  // Freio Plus: soma o consumo da reconfirmação e o da semeadura (medido; senão, o registro do próprio estado).
  const measured = await deps.measuredPlusUsage();
  const used = measured ?? { h1: usedInWindow(state, 3_600_000, startMs), h24: usedInWindow(state, 86_400_000, startMs) };
  const quota = plusCallQuota({ runCap: Math.min(opts.runCap ?? DEFAULT_RUN_CAP, dayLeft), usedLastHour: used.h1, usedLast24h: used.h24, hourlyCap: opts.plusHourlyCap, dailyCap: opts.plusDailyCap });
  if (quota.callCap <= 0) return emptySummary(opts, { ...base, skipped: 'freio_plus', quotaLimitedBy: quota.limitedBy });

  // Trava curta (expira sozinha): duas execuções simultâneas não dividem o mesmo cursor.
  await deps.saveState({ ...state, lockUntil: new Date(deadline + LOCK_EXTRA_MS).toISOString() });

  const summary = emptySummary(opts, { ...base, callCap: quota.callCap, quotaLimitedBy: quota.limitedBy });
  const cursorsBefore = state.cursors;
  const cursors: CursorState = { version: 1, segments: { ...cursorsBefore.segments } };
  const run = await deps.startRun(`semear-vertical:${opts.lojas.join('+')}`);
  const ttl = opts.notFoundTtlDays ?? 7;
  const notFoundDb = await deps.loadNotFound();
  const notFoundAdded: Record<string, string> = {};
  let calls = 0;
  let rateLimited = false;
  let timedOut = false;
  let fatal: Error | null = null;
  const created: ApplyOutcome = { masters: [], offers: [], skipped: 0 };

  try {
    const beforeCall = () => {
      if (deps.nowMs() > deadline) {
        timedOut = true;
        throw new TimeBudgetExceeded('tempo da fatia esgotado');
      }
      calls++;
    };
    const client = await deps.makeClient({ maxCalls: quota.callCap, beforeCall });
    const lookup = await deps.buildLookup();
    const masterByCatalog = new Map<string, string>();
    const allocations = allocate(segments, cursors, quota.callCap);
    log(`fatia: ${allocations.length} tipos de ${segments.length}; teto=${quota.callCap} (${quota.limitedBy}); apply=${opts.apply}`);

    for (const job of allocations) {
      if (deps.nowMs() > deadline) timedOut = true;
      if (timedOut || rateLimited) break;
      const seg = job.segment;
      const cur = cursorFor(cursors, seg);
      const win = nextWindow(seg, cur, job.calls);
      if (win.terms.length === 0) {
        cursors.segments[seg.key] = advanceCursor(seg, cur, win, { termsTouched: [], termStops: {}, planned: 0, calls: 0 }, now);
        summary.segments.push({ key: seg.key, calls: 0, planned: 0, reviews: 0, termsTouched: 0, stoppedBecause: 'sem_termo_vivo', depth: win.depth });
        continue;
      }
      const rep: SeedReport = await planSeed(client, seg, lookup, {
        pageLimit: SEARCH_PAGE_LIMIT,
        offset: win.offset,
        pages: 1,
        terms: win.terms,
        segmentCalls: job.calls,
        useSearchDomain: !seg.domainUnconfirmed,
        isKnownNotFound: (id) => recentNotFound(notFoundAdded[id] ?? notFoundDb[id], startMs, ttl),
        onNotFound: (id) => {
          notFoundAdded[id] = new Date(deps.nowMs()).toISOString();
        },
        shouldStop: () => {
          if (deps.nowMs() <= deadline) return false;
          timedOut = true;
          return true;
        },
        log,
      });
      const hit429 = rep.stoppedBecause === 'http_429';
      if (hit429) rateLimited = true;
      cursors.segments[seg.key] = advanceCursor(
        seg, cur, win,
        { termsTouched: rep.termsTouched, termStops: rep.termStops, planned: rep.plans.filter((p) => !p.mergeInto).length, calls: rep.callsSpent, rateLimited: hit429 },
        now
      );
      run.counters.queries += rep.callsSpent;
      run.counters.checked += rep.termsSearched;
      for (const e of rep.errors.slice(0, 3)) run.addError(e);
      summary.segments.push({ key: seg.key, calls: rep.callsSpent, planned: rep.plans.length, reviews: rep.reviews.length, termsTouched: rep.termsTouched.length, stoppedBecause: rep.stoppedBecause, depth: win.depth });
      if (opts.apply && rep.plans.length > 0 && !hit429) {
        const out = await deps.applyPlans(rep.plans, masterByCatalog, lookup);
        created.masters.push(...out.masters);
        created.offers.push(...out.offers);
        created.skipped += out.skipped;
        run.counters.offersCreated += out.offers.length;
      }
    }
  } catch (e) {
    fatal = e as Error;
    if (/429/.test(String((e as Error)?.message))) rateLimited = true;
    summary.errors.push(String((e as Error)?.message ?? e).slice(0, 200));
  } finally {
    // O que foi cobrado fica cobrado (a chamada em voo conta). Dry-run NÃO avança o cursor.
    const settled = settleState(await safeReload(deps, state), { now: new Date(deps.nowMs()), calls, rateLimited, cursors: opts.apply ? cursors : cursorsBefore, day });
    await deps.saveState(settled);
    if (Object.keys(notFoundAdded).length > 0) await deps.saveNotFound(notFoundAdded).catch(() => {});
    summary.apiCalls = calls;
    summary.rateLimited = rateLimited;
    summary.timedOut = timedOut;
    summary.cursorAdvanced = opts.apply && !fatal;
    summary.blockedUntil = settled.blockedUntil;
    summary.dayUsed = settled.days[day] ?? 0;
    summary.dayLeft = Math.max(0, dailyCap - summary.dayUsed);
    summary.mastersCreated = created.masters.length;
    summary.offersCreated = created.offers.length;
    await run.finish({
      stoppedBecause: rateLimited ? 'http_429' : timedOut ? 'orcamento_de_tempo' : null,
      budgetExhausted: timedOut,
      fatal: fatal != null,
      meta: {
        apiCalls: calls, callCap: quota.callCap, quotaLimitedBy: quota.limitedBy, apply: opts.apply, lojas: opts.lojas,
        segments: summary.segments.map((s) => `${s.key}:${s.calls}`).slice(0, 12),
        // Lista de reversão (apply): ids criados, para desfazer sem adivinhar. Limitada para a linha não crescer sem fim.
        mastersCreated: created.masters.slice(0, 300), offersCreated: created.offers.slice(0, 300), createdTotal: created.masters.length,
        blockedUntil: settled.blockedUntil,
      },
    });
  }
  return summary;
}

/** Relê o estado antes de gravar (a trava foi gravada no meio); se a leitura falhar, usa o já lido. */
async function safeReload(deps: SeedSliceDeps, fallback: SeedServerState): Promise<SeedServerState> {
  try {
    return await deps.loadState();
  } catch {
    return fallback;
  }
}

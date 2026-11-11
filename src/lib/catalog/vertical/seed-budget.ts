// Sem 'server-only': funcoes PURAS (sem banco, sem rede, sem fs), importaveis por scripts tsx e testes.
// O script (scripts/semear-vertical.ts) le/grava o arquivo de estado; a logica de contagem mora aqui.

/**
 * ORCAMENTO DIARIO DE CHAMADAS AO MERCADO LIVRE PARA A SEMEADURA (dono, 2026-11-10: ate 480 por dia).
 *
 * - Conta TODA chamada da semeadura (busca, /items, /products/{id}), em dry-run ou apply: a cota do ML nao distingue.
 * - O dia e o dia civil de Sao Paulo (America/Sao_Paulo), nao UTC.
 * - A cobranca e feita ANTES de cada chamada (ml-api `beforeCall`) e gravada na hora: se o processo morrer, o que foi
 *   gasto ja esta no arquivo (a chamada em voo conta; erra para o lado seguro).
 * - Nao inclui o recoletor `collect-vertical` (outro orcamento, ja em producao).
 * - Cache negativo: catalogos que responderam 404 "No winners found" (sem vendedor) ficam lembrados por `NOT_FOUND_TTL_DAYS`
 *   para nao gastar a mesma chamada em outra pagina/termo/rodada. Vencido o prazo, tenta de novo (o catalogo pode ter ganho vendedor).
 */

// Teto de seguranca contra laco descontrolado, NAO limite da plataforma (dono, 2026-11-11: usar o que a documentacao permite). O ML nao publica
// cota diaria; o limite real e o HTTP 429, que ja para a execucao (ml-api: RateLimited). Era 480/dia (autoimposto em 2026-11-10).
export const DAILY_CALL_CAP = 12000;
export const NOT_FOUND_TTL_DAYS = 3;

export interface BudgetRun {
  runId: string;
  startedAt: string;
  calls: number;
  mode: 'apply' | 'dry-run' | 'historico';
  note?: string;
}

export interface BudgetState {
  version: 1;
  days: Record<string, { used: number; runs: BudgetRun[] }>;
  /** catalogId -> ISO da ultima vez que respondeu 404 (sem vendedor). */
  notFound: Record<string, string>;
}

export function emptyState(): BudgetState {
  return { version: 1, days: {}, notFound: {} };
}

/** Dia civil de Sao Paulo (YYYY-MM-DD) de um instante. */
export function dayKeySP(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function usedOn(state: BudgetState, day: string): number {
  return state.days[day]?.used ?? 0;
}

export function remainingOn(state: BudgetState, day: string, cap = DAILY_CALL_CAP): number {
  return Math.max(0, cap - usedOn(state, day));
}

/** Teto efetivo de uma execucao: o pedido (--max-calls), limitado ao que sobra no dia. */
export function effectiveMaxCalls(state: BudgetState, day: string, requested: number, cap = DAILY_CALL_CAP): number {
  return Math.max(0, Math.min(Math.floor(requested), remainingOn(state, day, cap)));
}

/** Cobra `n` chamadas. Devolve novo estado, ou `null` se estouraria o teto do dia (nada e cobrado). Imutavel. */
export function charge(state: BudgetState, day: string, run: { runId: string; startedAt: string; mode: BudgetRun['mode'] }, n = 1, cap = DAILY_CALL_CAP): BudgetState | null {
  if (usedOn(state, day) + n > cap) return null;
  const cur = state.days[day] ?? { used: 0, runs: [] };
  const runs = cur.runs.some((r) => r.runId === run.runId)
    ? cur.runs.map((r) => (r.runId === run.runId ? { ...r, calls: r.calls + n } : r))
    : [...cur.runs, { runId: run.runId, startedAt: run.startedAt, calls: n, mode: run.mode }];
  return { ...state, days: { ...state.days, [day]: { used: cur.used + n, runs } } };
}

/**
 * Preenche o historico a partir das execucoes antigas (backup/dados/semear-vertical-<ts>/plano.json), SOMENTE para dias
 * ainda sem registro no estado. `stamp` e o carimbo do diretorio (ISO com ':' e '.' trocados por '-').
 */
export function backfillFromHistory(state: BudgetState, history: Array<{ stamp: string; calls: number; apply: boolean }>): BudgetState {
  const byDay = new Map<string, BudgetRun[]>();
  for (const h of history) {
    const iso = stampToIso(h.stamp);
    if (!iso) continue;
    const day = dayKeySP(new Date(iso));
    if (state.days[day]) continue;
    const list = byDay.get(day) ?? [];
    list.push({ runId: `historico-${h.stamp}`, startedAt: iso, calls: h.calls, mode: 'historico', note: h.apply ? 'apply' : 'dry-run' });
    byDay.set(day, list);
  }
  const days = { ...state.days };
  for (const [day, runs] of byDay) days[day] = { used: runs.reduce((n, r) => n + r.calls, 0), runs };
  return { ...state, days };
}

/** "2026-11-10T19-13-56-477Z" -> "2026-11-10T19:13:56.477Z" (null se nao for um carimbo valido). */
export function stampToIso(stamp: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(stamp);
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}

export function isKnownNotFound(state: BudgetState, catalogId: string, now: Date, ttlDays = NOT_FOUND_TTL_DAYS): boolean {
  const at = state.notFound[catalogId];
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && now.getTime() - t < ttlDays * 86_400_000;
}

export function markNotFound(state: BudgetState, catalogId: string, now: Date): BudgetState {
  return { ...state, notFound: { ...state.notFound, [catalogId]: now.toISOString() } };
}

/** Remove entradas vencidas do cache negativo (mantem o arquivo pequeno). */
export function pruneNotFound(state: BudgetState, now: Date, ttlDays = NOT_FOUND_TTL_DAYS): BudgetState {
  const notFound: Record<string, string> = {};
  for (const [id, at] of Object.entries(state.notFound)) {
    const t = Date.parse(at);
    if (Number.isFinite(t) && now.getTime() - t < ttlDays * 86_400_000) notFound[id] = at;
  }
  return { ...state, notFound };
}

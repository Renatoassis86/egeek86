// Sem 'server-only': lógica pura (sem banco, sem rede), importável pelo coletor e por testes tsx.

/**
 * FILA POR ANTIGUIDADE + COTA DAS LOJAS PLUS (pedido do dono, 2026-11-11).
 * - A fila de cada departamento é ordenada pela checagem mais velha primeiro (NULL = nunca checada, vem antes de tudo).
 * - Ofertas do mesmo catálogo (master + external_ref) viram UMA chamada; o grupo herda a posição da oferta mais velha.
 * - A cota de chamadas da execução é o menor entre o teto da execução, a folga horária e a folga diária do conjunto Plus
 *   (soma das chamadas de collect-vertical:* em collector_runs). Sem medição (COLLECTOR_RUNS desligado) vale só o teto da execução.
 */

export interface DueRow {
  id: string;
  externalRef: string | null;
  masterProductId: string;
  /** Instante da última checagem (ms); null = nunca. */
  checkedAtMs: number | null;
}

export interface DueGroup {
  externalRef: string;
  masterProductId: string;
  offerIds: string[];
  /** Checagem mais velha do grupo (ms); null = nunca checado. */
  oldestMs: number | null;
}

const ageKey = (ms: number | null): number => (ms === null ? Number.NEGATIVE_INFINITY : ms);

/** Agrupa por catálogo e ordena os grupos pela oferta mais velha (null primeiro; desempate por id para ser determinístico). */
export function groupDueOldestFirst(rows: DueRow[]): DueGroup[] {
  const groups = new Map<string, DueGroup & { firstId: string }>();
  for (const r of rows) {
    if (!r.externalRef) continue;
    const key = `${r.masterProductId}:${r.externalRef}`;
    const g = groups.get(key);
    if (g) {
      g.offerIds.push(r.id);
      if (ageKey(r.checkedAtMs) < ageKey(g.oldestMs)) {
        g.oldestMs = r.checkedAtMs;
        g.firstId = r.id;
      }
    } else {
      groups.set(key, { externalRef: r.externalRef, masterProductId: r.masterProductId, offerIds: [r.id], oldestMs: r.checkedAtMs, firstId: r.id });
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => {
      const ka = ageKey(a.oldestMs);
      const kb = ageKey(b.oldestMs);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.firstId < b.firstId ? -1 : a.firstId > b.firstId ? 1 : 0;
    })
    .map(({ firstId: _firstId, ...g }) => g);
}

export interface QuotaInput {
  /** Teto de chamadas da execução (envPlusCap/DEFAULT). */
  runCap: number;
  /** Chamadas já feitas pelo conjunto Plus na última hora / nas últimas 24 h; null = não medido. */
  usedLastHour: number | null;
  usedLast24h: number | null;
  /** 0 ou ausente = sem esse teto. */
  hourlyCap: number;
  dailyCap: number;
  /** Fatia máxima da folga horária que UMA execução pode gastar (as 6 lojas dividem a mesma folga). */
  hourlyShare?: number;
}

export interface QuotaResult {
  callCap: number;
  /** Qual limite decidiu: 'execucao' | 'hora' | 'dia'. */
  limitedBy: 'execucao' | 'hora' | 'dia';
}

export function plusCallQuota(q: QuotaInput): QuotaResult {
  let cap = Math.max(0, Math.floor(q.runCap));
  let by: QuotaResult['limitedBy'] = 'execucao';
  const share = q.hourlyShare && q.hourlyShare > 0 && q.hourlyShare <= 1 ? q.hourlyShare : 0.5;
  if (q.hourlyCap > 0 && q.usedLastHour !== null) {
    const room = Math.max(0, Math.floor((q.hourlyCap - q.usedLastHour) * share));
    if (room < cap) {
      cap = room;
      by = 'hora';
    }
  }
  if (q.dailyCap > 0 && q.usedLast24h !== null) {
    const room = Math.max(0, q.dailyCap - q.usedLast24h);
    if (room < cap) {
      cap = room;
      by = 'dia';
    }
  }
  return { callCap: cap, limitedBy: by };
}

/** Horas sem reconfirmar o preço a partir das quais uma oferta ATIVA e já checada vira 'expired' (pelo caminho existente). */
export const DEFAULT_STALE_EXPIRE_HOURS = 12;
/** Teto de ofertas expiradas por execução pela varredura de cauda (cinto de segurança contra falha em massa). */
export const STALE_EXPIRE_MAX_PER_RUN = 200;

export function staleExpireHours(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.VERTICAL_STALE_EXPIRE_HOURS);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : DEFAULT_STALE_EXPIRE_HOURS;
}

/**
 * A varredura de cauda só roda em execução saudável: sem 429, ao menos 1 preço gravado e no máximo metade dos catálogos
 * falhos. Em queda da API ninguém é expirado por causa de falha nossa.
 */
export function mayExpireStale(s: { rateLimited: boolean; pricesWritten: number; catalogs: number; failedCatalogs: number; confirmationTracked: boolean }): boolean {
  if (!s.confirmationTracked || s.rateLimited || s.pricesWritten <= 0) return false;
  return s.failedCatalogs * 2 <= Math.max(1, s.catalogs);
}

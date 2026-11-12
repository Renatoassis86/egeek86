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
  /** Camada de cadência (2026-11-12): 0 = vitrine (reconfirma a cada 15 min), 1 = revisão (60 a 120 min). Ausente = 0 (comportamento antigo). */
  tier?: 0 | 1;
}

export interface DueGroup {
  externalRef: string;
  masterProductId: string;
  offerIds: string[];
  /** Checagem mais velha do grupo (ms); null = nunca checado. */
  oldestMs: number | null;
  /** Melhor camada do grupo (0 = vitrine se QUALQUER oferta do catálogo está na vitrine). */
  tier: 0 | 1;
}

const ageKey = (ms: number | null): number => (ms === null ? Number.NEGATIVE_INFINITY : ms);

/** Agrupa por catálogo e ordena os grupos pela oferta mais velha (null primeiro; desempate por id para ser determinístico). */
export function groupDueOldestFirst(rows: DueRow[]): DueGroup[] {
  const groups = new Map<string, DueGroup & { firstId: string }>();
  const tierOf = (r: DueRow): 0 | 1 => (r.tier === 1 ? 1 : 0);
  for (const r of rows) {
    if (!r.externalRef) continue;
    const key = `${r.masterProductId}:${r.externalRef}`;
    const g = groups.get(key);
    if (g) {
      g.offerIds.push(r.id);
      if (tierOf(r) < g.tier) g.tier = tierOf(r);
      if (ageKey(r.checkedAtMs) < ageKey(g.oldestMs)) {
        g.oldestMs = r.checkedAtMs;
        g.firstId = r.id;
      }
    } else {
      groups.set(key, { externalRef: r.externalRef, masterProductId: r.masterProductId, offerIds: [r.id], oldestMs: r.checkedAtMs, tier: tierOf(r), firstId: r.id });
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier; // vitrine antes da revisão; dentro de cada camada, a antiguidade manda
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

// ---------------------------------------------------------------------------------------------------------------------
// CADÊNCIA POR CAMADA (aprovada pelo dono em 2026-11-12)
// ---------------------------------------------------------------------------------------------------------------------
// Vitrine = master APROVADO e dentro do escopo de compra (reconfirma no intervalo do departamento, 15 a 30 min). Revisão = o resto
// (em revisão, fora do escopo, rascunho): 60 a 120 min. Não muda a regra de preço nem a de expiração; só o intervalo entre consultas.
// A fila continua por antiguidade, vitrine antes da revisão.

export const REVISAO_MIN_PADRAO = 90;
export const REVISAO_MIN_MINIMO = 60;
export const REVISAO_MIN_MAXIMO = 120;

export interface CadenciaCamadas {
  ativa: boolean;
  /** Intervalo da vitrine, em minutos (o do departamento). */
  vitrineMin: number;
  /** Intervalo da revisão, em minutos (60 a 120; nunca menor que o da vitrine). */
  revisaoMin: number;
}

/** `PLUS_CADENCIA_CAMADAS=0` desliga (volta ao intervalo único). `VERTICAL_REVISAO_REFRESH_MIN` ajusta a revisão (preso a 60..120). */
export function cadenciaCamadas(vitrineMin: number, env: Record<string, string | undefined> = process.env): CadenciaCamadas {
  const vit = Math.max(1, Math.floor(vitrineMin));
  const raw = Number(env.VERTICAL_REVISAO_REFRESH_MIN);
  const wanted = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : REVISAO_MIN_PADRAO;
  const rev = Math.max(vit, Math.min(REVISAO_MIN_MAXIMO, Math.max(REVISAO_MIN_MINIMO, wanted)));
  return { ativa: env.PLUS_CADENCIA_CAMADAS !== '0', vitrineMin: vit, revisaoMin: rev };
}

/** Intervalo (min) que vale para uma oferta, conforme a camada. Sem cadência por camada, vale o da vitrine para todos. */
export function intervaloDaCamada(c: CadenciaCamadas, tier: 0 | 1): number {
  return c.ativa && tier === 1 ? c.revisaoMin : c.vitrineMin;
}

/** A oferta está devida? `checkedAtMs` null = nunca checada (sempre devida). */
export function ofertaDevida(c: CadenciaCamadas, tier: 0 | 1, checkedAtMs: number | null, nowMs: number): boolean {
  if (checkedAtMs === null) return true;
  return checkedAtMs < nowMs - intervaloDaCamada(c, tier) * 60_000;
}

/** Chamadas por hora para reconfirmar `vitrine` catálogos na vitrine e `revisao` na revisão (fator 1,1 chamada por catálogo do histórico). */
export function chamadasPorHoraCamadas(vitrine: number, revisao: number, c: CadenciaCamadas, pagesFactor = 1.1): number {
  const n = (cat: number, min: number) => cat * (60 / Math.max(1, min));
  return Math.round((n(vitrine, c.vitrineMin) + n(revisao, c.ativa ? c.revisaoMin : c.vitrineMin)) * pagesFactor);
}

/** Freios PADRÃO do conjunto Plus (SUPOSIÇÕES, não oficiais: a cota do ML não é publicada; o 429 é o limite real). */
export const DEFAULT_PLUS_HOURLY_CAP = 8000;
export const DEFAULT_PLUS_DAILY_CAP = 150_000;

function envIntOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** PLUS_ML_HOURLY_CALL_CAP / PLUS_ML_DAILY_CALL_CAP (0 = sem esse teto). Mesma leitura para a reconfirmação e para a semeadura do servidor. */
export function plusCapsFromEnv(env: Record<string, string | undefined> = process.env): { hourlyCap: number; dailyCap: number } {
  return { hourlyCap: envIntOr(env.PLUS_ML_HOURLY_CALL_CAP, DEFAULT_PLUS_HOURLY_CAP), dailyCap: envIntOr(env.PLUS_ML_DAILY_CALL_CAP, DEFAULT_PLUS_DAILY_CAP) };
}

// Sem 'server-only': funções PURAS (sem banco, sem rede, sem fs). O script (scripts/semear-vertical.ts --fila) lê/grava o arquivo
// de cursores; a lógica de prioridade, janela de termos, profundidade e estimativa mora aqui.
import type { SegmentConfig } from './config';

/**
 * FILA DE SEMEADURA POR TIPO (pedido do dono, 2026-11-12: "o máximo de produtos por TIPO em cada loja; não tem limites").
 *
 * Problema medido (planos de 8 a 11/11 em backup/dados): a semeadura era manual, com `--max-calls 40`, `--max-create 20`, `--pages 2`,
 * e o 1º tipo da execução consumia o teto inteiro. Resultado: memoria-ram, processador, monitor, cadeira-gamer, notebook, caixa-de-som,
 * robo-aspirador, cafeteira e maquina-de-lavar ficaram com 0 a 1 chamada no histórico; os segmentos de 11/11 (tênis, fogão, câmeras...)
 * nunca rodaram; smart-tv gastou 346 chamadas com 86% de 404 "sem vendedor" e parou por teto de chamadas / 429.
 *
 * Desenho:
 *  - ORÇAMENTO PRÓPRIO por tipo e por execução (`callsPerRun` do segmento, ou DEFAULT_CALLS_PER_TYPE_RUN): nenhum tipo come o teto dos outros.
 *  - PRIORIDADE por antiguidade: tipo nunca semeado primeiro (na ordem seedRank), depois o semeado há mais tempo.
 *  - PROFUNDIDADE ao longo dos ciclos, em largura: cada passada percorre a lista de termos pedindo UMA página (offset = profundidade x 50);
 *    ao completar a lista, a profundidade sobe (até MAX_SEARCH_PAGES, o limite prático do offset da busca; a API oficial é o limite real).
 *    Termo esgotado (fim dos resultados / sem resultado no domínio / erro) é pulado nas profundidades seguintes.
 *  - Nenhum teto por tipo ou por execução em número de masters (planSeed: maxCreate sem teto). Os limites que ficam protegem as regras
 *    inegociáveis (só novo e em linha, sem duplicata, só API oficial) e a cota (orçamento diário + espera/retomada no 429).
 */

/** Resultados por página de /products/search (máximo medido em 10/11). */
export const SEARCH_PAGE_LIMIT = 50;
/** Profundidade máxima por termo: 20 páginas x 50 = offset 1000. Premissa conservadora (o corte real da busca de catálogo não está documentado). */
export const MAX_SEARCH_PAGES = 20;
/** Orçamento padrão de chamadas de UM tipo por execução da fila. */
export const DEFAULT_CALLS_PER_TYPE_RUN = 150;
/** Chamadas que um termo (1 página de 50) gasta em média, para dimensionar a janela de termos de uma execução (premissa; ver simulação). */
export const CALLS_PER_TERM_ESTIMATE = 25;
/** Página que não trouxe nada novo: esses motivos tiram o termo das profundidades seguintes. */
const DEAD_STOP = /^(fim_dos_resultados|pagina_sem_dominio|erro_http_)/;

export interface SegCursor {
  /** Índice (na lista de termos) por onde a próxima execução continua. */
  termsFrom: number;
  /** Profundidade atual (0 = 1ª página). Offset = depth x SEARCH_PAGE_LIMIT. */
  depth: number;
  /** Passadas completas pela lista de termos. */
  cycles: number;
  /** Índices de termos esgotados na profundidade atual (não pedem a página seguinte). */
  dead: number[];
  /** Assinatura da lista de termos; se a lista mudou o cursor recomeça. */
  termsSig: string;
  lastRunAt: string | null;
  totalCalls: number;
  totalPlanned: number;
}

export interface CursorState {
  version: 1;
  segments: Record<string, SegCursor>;
}

export function emptyCursorState(): CursorState {
  return { version: 1, segments: {} };
}

/** Assinatura barata e estável de uma lista de termos (tamanho + djb2 do conteúdo). */
export function termsSignature(terms: string[]): string {
  let h = 5381;
  for (const t of terms) for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${terms.length}:${(h >>> 0).toString(36)}`;
}

export function cursorFor(state: CursorState, seg: SegmentConfig): SegCursor {
  const sig = termsSignature(seg.terms);
  const cur = state.segments[seg.key];
  if (cur && cur.termsSig === sig) return cur;
  // Lista mudou (ou tipo novo): recomeça, preservando só a contabilidade.
  return { termsFrom: 0, depth: 0, cycles: 0, dead: [], termsSig: sig, lastRunAt: cur?.lastRunAt ?? null, totalCalls: cur?.totalCalls ?? 0, totalPlanned: cur?.totalPlanned ?? 0 };
}

/** Tipos na ordem de prioridade: nunca semeado primeiro (seedRank), depois o mais antigo; empate por seedRank. */
export function priorityOrder(segs: SegmentConfig[], state: CursorState): SegmentConfig[] {
  const at = (s: SegmentConfig) => {
    const t = state.segments[s.key]?.lastRunAt;
    return t ? Date.parse(t) : Number.NEGATIVE_INFINITY;
  };
  return [...segs].sort((a, b) => {
    const ta = at(a);
    const tb = at(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.seedRank - b.seedRank || a.key.localeCompare(b.key);
  });
}

export interface Allocation {
  segment: SegmentConfig;
  /** Orçamento próprio de chamadas deste tipo nesta execução. */
  calls: number;
}

export function callsPerRunOf(seg: SegmentConfig): number {
  return Math.max(1, Math.floor(seg.callsPerRun ?? DEFAULT_CALLS_PER_TYPE_RUN));
}

/** Reparte `totalCalls` entre os tipos na ordem de prioridade; cada um ganha o seu orçamento (ou o que sobrar). */
export function allocate(segs: SegmentConfig[], state: CursorState, totalCalls: number): Allocation[] {
  const out: Allocation[] = [];
  let left = Math.max(0, Math.floor(totalCalls));
  for (const s of priorityOrder(segs, state)) {
    if (left <= 0) break;
    const calls = Math.min(callsPerRunOf(s), left);
    out.push({ segment: s, calls });
    left -= calls;
  }
  return out;
}

export interface Window {
  /** Termos desta passada (vivos, a partir do cursor). */
  terms: string[];
  /** Índice de cada termo na lista completa (para atualizar `dead` e o cursor). */
  indices: number[];
  /** Offset da busca (profundidade x SEARCH_PAGE_LIMIT). */
  offset: number;
  depth: number;
}

/** Janela de termos desta execução: `calls / CALLS_PER_TERM_ESTIMATE` termos (mínimo 3) a partir do cursor, pulando os esgotados. */
export function nextWindow(seg: SegmentConfig, cur: SegCursor, calls: number): Window {
  const want = Math.max(3, Math.floor(calls / CALLS_PER_TERM_ESTIMATE));
  const dead = new Set(cur.dead);
  const terms: string[] = [];
  const indices: number[] = [];
  for (let i = cur.termsFrom; i < seg.terms.length && terms.length < want; i++) {
    if (dead.has(i)) continue;
    terms.push(seg.terms[i]);
    indices.push(i);
  }
  return { terms, indices, offset: cur.depth * SEARCH_PAGE_LIMIT, depth: cur.depth };
}

export interface RunOutcome {
  termsTouched: string[];
  termStops: Record<string, string>;
  planned: number;
  calls: number;
  /** A execução parou por 429 persistente: não avança o cursor (a janela é repetida). */
  rateLimited?: boolean;
}

/** Avança o cursor depois de uma execução. Pura: devolve o novo cursor. */
export function advanceCursor(seg: SegmentConfig, cur: SegCursor, win: Window, out: RunOutcome, now: Date): SegCursor {
  const next: SegCursor = { ...cur, dead: [...cur.dead], lastRunAt: now.toISOString(), totalCalls: cur.totalCalls + out.calls, totalPlanned: cur.totalPlanned + out.planned };
  if (out.rateLimited) return next;
  const touched = new Set(out.termsTouched);
  let lastTouchedIdx = -1;
  win.terms.forEach((t, k) => {
    if (!touched.has(t)) return;
    lastTouchedIdx = win.indices[k];
    const stop = out.termStops[t];
    if (stop && DEAD_STOP.test(stop) && !next.dead.includes(win.indices[k])) next.dead.push(win.indices[k]);
  });
  if (lastTouchedIdx < 0) return next; // nada foi pedido (orçamento zero): a janela se repete
  next.termsFrom = lastTouchedIdx + 1;
  // Fim da lista (ou só sobraram termos esgotados): fecha a passada e aprofunda.
  const live = (i: number) => !next.dead.includes(i);
  let anyLeft = false;
  for (let i = next.termsFrom; i < seg.terms.length; i++) if (live(i)) { anyLeft = true; break; }
  if (!anyLeft) {
    next.cycles += 1;
    next.termsFrom = 0;
    const deeper = next.depth + 1;
    if (deeper >= MAX_SEARCH_PAGES || next.dead.length >= seg.terms.length) {
      next.depth = 0; // recomeça do topo (novos anúncios aparecem; duplicata e cache de 404 evitam o retrabalho)
      next.dead = [];
    } else {
      next.depth = deeper;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------------------------------------------------
// SIMULAÇÃO (sem chamar a API)
// ---------------------------------------------------------------------------------------------------------------------

export interface SimParams {
  /** Profundidade média alcançada por termo (páginas de 50). Premissa a calibrar com o 1º ciclo real. */
  pagesPerTerm: number;
  /** Fração dos resultados que são catálogos ainda não vistos (o resto é repetição entre termos/ofertas já cadastradas). */
  uniqueFraction: number;
  /** Chamadas (/items + detalhe) por resultado ÚNICO que ainda custa chamada (404 gasta 1; vendedor gasta 2). Vem do histórico real. */
  callsPerFreshResult: number;
  /** Masters planejados por resultado único (histórico real). */
  mastersPerFreshResult: number;
  /**
   * SATURAÇÃO: quantos catálogos com vendedor o ML realmente tem por tipo. Sem isso a simulação multiplicaria termos x páginas x taxa e
   * superestimaria (os termos de marca x modelo repetem os mesmos catálogos). Vem do histórico dos tipos explorados a fundo
   * (planejados + duplicatas já cadastradas). Ausente = sem saturação (limite superior).
   */
  poolPerType?: number;
}

export interface TypeEstimate {
  segment: string;
  terms: number;
  searchCalls: number;
  freshResults: number;
  catalogCalls: number;
  totalCalls: number;
  masters: number;
  /** Execuções da fila (orçamento do tipo) para completar uma passada de profundidade `pagesPerTerm`. */
  runs: number;
}

export function estimateType(seg: SegmentConfig, p: SimParams): TypeEstimate {
  const terms = seg.terms.length;
  const searchCalls = Math.ceil(terms * p.pagesPerTerm);
  const results = searchCalls * SEARCH_PAGE_LIMIT;
  const freshResults = Math.round(results * p.uniqueFraction);
  const rawMasters = freshResults * p.mastersPerFreshResult;
  const masters = Math.round(p.poolPerType != null ? Math.min(rawMasters, p.poolPerType) : rawMasters);
  // Saturado, o que sobra é busca (1 chamada por página); duplicata e cache de 404 são resolvidos sem chamar a API.
  const f = rawMasters > 0 ? masters / rawMasters : 1;
  const catalogCalls = Math.round(freshResults * p.callsPerFreshResult * f);
  const totalCalls = searchCalls + catalogCalls;
  return {
    segment: seg.key,
    terms,
    searchCalls,
    freshResults,
    catalogCalls,
    totalCalls,
    masters,
    runs: Math.ceil(totalCalls / callsPerRunOf(seg)),
  };
}

/** Chamadas por hora para reconfirmar `catalogs` catálogos a cada `intervalMin` minutos (fator de páginas do histórico: 1,1 chamada/catálogo). */
export function reconfirmCallsPerHour(catalogs: number, intervalMin: number, pagesFactor = 1.1): number {
  return Math.round((catalogs * (60 / Math.max(1, intervalMin)) * pagesFactor));
}

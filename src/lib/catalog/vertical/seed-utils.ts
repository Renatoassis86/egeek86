// Sem 'server-only': funcoes PURAS da semeadura (termos, paginacao, relatorio). Sem banco, sem rede.

/** Minusculas, sem acento, so [a-z0-9 ], espacos colapsados: chave para deduplicar termos de busca. */
export function termKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Remove termos repetidos (mesma chave sem acento/caixa) e vazios, mantendo a ORDEM (a ordem e a prioridade). */
export function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = termKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim().replace(/\s+/g, ' '));
  }
  return out;
}

/**
 * Gera termos "<prefixo> <modelo> <marca>" com a prioridade INTERCALADA: primeiro a 1a marca de cada modelo, depois a 2a...
 * (uma rodada curta ja cobre todos os modelos com as marcas mais fortes, em vez de esgotar um modelo so).
 * `prefix`/`models`/`brands` vazios sao ignorados; o resultado sai deduplicado.
 */
export function combineTerms(prefix: string, models: string[], brands: string[]): string[] {
  const ms = models.length > 0 ? models : [''];
  const bs = brands.length > 0 ? brands : [''];
  const out: string[] = [];
  for (const b of bs) for (const m of ms) out.push([prefix, m, b].filter(Boolean).join(' '));
  return dedupeTerms(out);
}

/** Caminho de /products/search (unico lugar que monta a URL; o dominio so entra se o segmento o declara e foi verificado). */
export function searchPath(term: string, limit: number, offset: number, domainId?: string | null): string {
  const base = `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(term)}&limit=${limit}&offset=${offset}`;
  return domainId ? `${base}&domain_id=${encodeURIComponent(domainId)}` : base;
}

export interface PageOutcome {
  /** Resultados devolvidos nesta pagina. */
  returned: number;
  limit: number;
  offset: number;
  /** paging.total da busca (null se a API nao informou). */
  total: number | null;
  /** Resultados da pagina cujo domain_id pertence ao segmento. */
  inDomain: number;
  /** Resultados da pagina que ainda nao tinham sido vistos nesta execucao. */
  fresh: number;
}

export type PagingVerdict = { next: true } | { next: false; reason: 'fim_dos_resultados' | 'pagina_sem_dominio' | 'pagina_sem_novidade' };

/**
 * Vale pedir a PROXIMA pagina do termo? Cada pagina custa 1 chamada, entao so segue se a atual ainda rendeu:
 *  - acabou o que a busca tem (pagina curta ou offset+retornados >= total);
 *  - nenhum resultado no dominio do segmento (a relevancia cai pagina a pagina: o resto e ruido);
 *  - nenhum candidato novo (tudo ja visto nesta execucao).
 */
export function pagingDecision(p: PageOutcome): PagingVerdict {
  if (p.returned < p.limit || p.returned === 0) return { next: false, reason: 'fim_dos_resultados' };
  if (p.total != null && p.offset + p.returned >= p.total) return { next: false, reason: 'fim_dos_resultados' };
  if (p.inDomain === 0) return { next: false, reason: 'pagina_sem_dominio' };
  if (p.fresh === 0) return { next: false, reason: 'pagina_sem_novidade' };
  return { next: true };
}

export interface SegmentReportLike {
  segment: string;
  vertical: string;
  termsSearched: number;
  searchResults: number;
  counts: Record<string, number>;
  plans: unknown[];
  reviews: unknown[];
  callsSpent?: number;
  stoppedBecause: string | null;
}

export interface SeedSummary {
  calls: number;
  planned: number;
  created: number;
  reviews: number;
  /** Descartados por motivo (tudo que nao e planejado), ordenado do maior para o menor. */
  discarded: Array<{ reason: string; n: number }>;
  discardedTotal: number;
  /** 404 sem vendedor: gastaram chamada (fresh) e evitados pelo cache (cached). */
  notFound: { fresh: number; cached: number };
  candidates: number;
  perSegment: Array<{ segment: string; calls: number; planned: number; yieldPerCall: number | null; stopped: string | null }>;
  yieldPerCall: number | null;
}

/** Consolida os relatorios por segmento em um resumo unico. `created` = efetivamente gravados (apply); no dry-run e 0. */
export function summarizeReports(reports: SegmentReportLike[], created = 0): SeedSummary {
  const acc: Record<string, number> = {};
  for (const r of reports) for (const [k, v] of Object.entries(r.counts)) acc[k] = (acc[k] ?? 0) + v;
  const discarded = Object.entries(acc)
    .filter(([k]) => k !== 'planejado_criar')
    .map(([reason, n]) => ({ reason, n }))
    .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
  const calls = reports.reduce((n, r) => n + (r.callsSpent ?? 0), 0);
  const planned = reports.reduce((n, r) => n + r.plans.length, 0);
  const perSegment = reports.map((r) => {
    const c = r.callsSpent ?? 0;
    return { segment: r.segment, calls: c, planned: r.plans.length, yieldPerCall: c > 0 ? r.plans.length / c : null, stopped: r.stoppedBecause };
  });
  return {
    calls,
    planned,
    created,
    reviews: reports.reduce((n, r) => n + r.reviews.length, 0),
    discarded,
    discardedTotal: discarded.reduce((n, d) => n + d.n, 0),
    notFound: { fresh: acc['sem_vendedor_404'] ?? 0, cached: acc['sem_vendedor_404_cache'] ?? 0 },
    candidates: reports.reduce((n, r) => n + r.searchResults, 0),
    perSegment,
    yieldPerCall: calls > 0 ? planned / calls : null,
  };
}

/** Linhas de texto do relatorio final (para o log e o console). */
export function formatSummary(s: SeedSummary, apply: boolean): string[] {
  const pct = (n: number) => (s.candidates > 0 ? `${((100 * n) / s.candidates).toFixed(0)}%` : 'n/d');
  const lines = [
    `RELATORIO: chamadas=${s.calls} candidatos=${s.candidates} planejados=${s.planned} ${apply ? `criados=${s.created}` : 'criados=0 (dry-run)'} revisao=${s.reviews} rendimento=${s.yieldPerCall == null ? 'n/d' : s.yieldPerCall.toFixed(2)} master/chamada`,
    `  404 sem vendedor: ${s.notFound.fresh} (gastaram chamada) + ${s.notFound.cached} evitados pelo cache = ${pct(s.notFound.fresh + s.notFound.cached)} dos candidatos`,
    `  descartados por motivo (${s.discardedTotal}):`,
  ];
  for (const d of s.discarded) lines.push(`    ${d.reason}: ${d.n} (${pct(d.n)})`);
  for (const p of s.perSegment) {
    lines.push(`  segmento ${p.segment}: chamadas=${p.calls} planejados=${p.planned} rendimento=${p.yieldPerCall == null ? 'n/d' : p.yieldPerCall.toFixed(2)} parou=${p.stopped ?? '-'}`);
  }
  return lines;
}

/** Estimativa de masters novos para `calls` chamadas a `yieldPerCall` (so aritmetica; nao e promessa). */
export function estimateMasters(calls: number, yieldPerCall: number): number {
  return Math.floor(Math.max(0, calls) * Math.max(0, yieldPerCall));
}

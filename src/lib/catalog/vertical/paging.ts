// Sem 'server-only': lógica pura (sem banco, sem rede), importável pelo coletor e por testes tsx.
import { MASTER_MAX_PAGES_PER_CATALOG, MASTER_PAGE_SIZE, parseMeliCatalogPage, sanitizeErrorForSummary, type Listing } from '@/lib/affiliate/master-consolidation';

/**
 * PAGINAÇÃO DE /products/{id}/items PARA OS DEPARTAMENTOS (caminho NOVO; o gamer, com `fetchCatalogAllPages`, fica intocado).
 *
 * Diferença deliberada em relação ao caminho gamer: o achado da medição de 2026-11-08 (soundbar) foi um catálogo que
 * responde HTTP 206 com `paging.total = 4` e só 3 itens. No caminho gamer, "itens únicos < total" é falha `incompleto`
 * e o catálogo falharia PARA SEMPRE (nunca carimbado, sempre devido, comendo cota). Aqui isso vira `partial`:
 *   - os itens devolvidos são preços reais observados: são gravados;
 *   - NADA expira (não se pode afirmar que o item faltante sumiu: a API disse que não carregou);
 *   - o catálogo é carimbado (não fica eternamente devido) e contado como parcial no collector_runs.
 * Continuam sendo FALHA (fail closed, nada gravado): paging ausente com itens, paging inválido, offset diferente do
 * pedido, total mudando entre páginas, mais itens que o total, teto de páginas, página caída após 1 retry, orçamento.
 */

export type VerticalPagingErrorKind =
  | 'paging-ausente'
  | 'paging-inconsistente'
  | 'teto-paginas'
  | 'orcamento'
  | 'pagina-falhou';

export class VerticalPagingError extends Error {
  readonly kind: VerticalPagingErrorKind;
  constructor(kind: VerticalPagingErrorKind, ref: string, detail: string) {
    super(`[${kind}] ${ref}: ${detail}`);
    this.name = 'VerticalPagingError';
    this.kind = kind;
  }
}

/** Resposta de UMA página (status HTTP + corpo já lido). */
export interface RawPage {
  status: number;
  body: unknown;
}

export type FetchRawPage = (ref: string, offset: number, limit: number) => Promise<RawPage>;

export type VerticalCatalogOutcome =
  /** 404 na 1ª página, ou 200 vazio sem paging / total 0: catálogo sem vendedor (checagem real). */
  | { kind: 'empty'; calls: number }
  /** Lista completa (itens únicos = paging.total). */
  | { kind: 'complete'; items: Listing[]; total: number; calls: number }
  /** A API devolveu menos itens que paging.total (ex.: 206). Itens reais, sem expirar ninguém. */
  | { kind: 'partial'; items: Listing[]; total: number; seen: number; httpStatus: number; calls: number };

export interface PagingOptions {
  pageSize?: number;
  maxPages?: number;
  /** Cobra 1 chamada ANTES de cada tentativa; false => orçamento esgotado. */
  charge?: () => boolean;
  /** Retries por página para erro de rede/HTTP não-404 (padrão 1). */
  retries?: number;
}

export async function fetchVerticalCatalog(ref: string, fetchPage: FetchRawPage, opts: PagingOptions = {}): Promise<VerticalCatalogOutcome> {
  const pageSize = Math.min(MASTER_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize ?? MASTER_PAGE_SIZE)));
  const maxPages = opts.maxPages ?? MASTER_MAX_PAGES_PER_CATALOG;
  const retries = opts.retries ?? 1;
  const seenRaw = new Set<string>();
  const byItem = new Map<string, Listing>();
  let offset = 0;
  let total: number | null = null;
  let pages = 0;
  let calls = 0;
  let lastStatus = 200;

  for (;;) {
    if (pages >= maxPages) {
      throw new VerticalPagingError('teto-paginas', ref, `mais de ${maxPages} páginas (total ${total}, lidos ${seenRaw.size})`);
    }
    let raw: RawPage | null = null;
    let lastError = '';
    for (let attempt = 0; attempt <= retries && !raw; attempt++) {
      if (opts.charge && !opts.charge()) {
        throw new VerticalPagingError('orcamento', ref, `orçamento esgotado na página ${pages + 1} (offset ${offset})`);
      }
      calls++;
      try {
        const r = await fetchPage(ref, offset, pageSize);
        if (r.status === 404 && offset === 0) return { kind: 'empty', calls };
        if (r.status === 200 || r.status === 206) raw = r;
        else lastError = `HTTP ${r.status}`;
        if (r.status === 404) break; // 404 depois da 1ª página: repetir não adianta
      } catch (err) {
        lastError = sanitizeErrorForSummary(err instanceof Error ? err.message : String(err));
      }
    }
    if (!raw) throw new VerticalPagingError('pagina-falhou', ref, `página ${pages + 1} (offset ${offset}) falhou: ${lastError}`);
    pages++;
    lastStatus = raw.status;

    let page;
    try {
      page = parseMeliCatalogPage(raw.body, offset);
    } catch (err) {
      throw new VerticalPagingError('pagina-falhou', ref, sanitizeErrorForSummary((err as Error).message));
    }
    if (page.pagingInvalid) throw new VerticalPagingError('paging-inconsistente', ref, `paging inválido (offset ${offset})`);
    const paging = page.paging;
    if (!paging) {
      if (pages === 1 && page.rawIds.length === 0) return { kind: 'empty', calls };
      throw new VerticalPagingError('paging-ausente', ref, `resposta sem paging (offset ${offset})`);
    }
    if (paging.offset !== offset) throw new VerticalPagingError('paging-inconsistente', ref, `paging.offset ${paging.offset} != pedido ${offset}`);
    if (total !== null && paging.total !== total) throw new VerticalPagingError('paging-inconsistente', ref, `paging.total mudou (${total} -> ${paging.total})`);
    total = paging.total;
    if (total === 0 && page.rawIds.length > 0) throw new VerticalPagingError('paging-inconsistente', ref, `total 0 com ${page.rawIds.length} itens`);
    for (const id of page.rawIds) seenRaw.add(id);
    if (seenRaw.size > total) throw new VerticalPagingError('paging-inconsistente', ref, `${seenRaw.size} itens únicos > total ${total}`);
    for (const it of page.items) if (!byItem.has(it.externalItemId)) byItem.set(it.externalItemId, it);

    if (total === 0) return { kind: 'empty', calls };
    // Página sem itens brutos: a API não tem mais o que entregar. Se faltou item => parcial (caso 206), não falha eterna.
    if (page.rawIds.length === 0) break;
    offset += page.rawIds.length;
    if (offset >= total) break;
  }

  const items = Array.from(byItem.values());
  if (total !== null && seenRaw.size < total) {
    return { kind: 'partial', items, total, seen: seenRaw.size, httpStatus: lastStatus, calls };
  }
  return { kind: 'complete', items, total: total ?? 0, calls };
}

// Sem 'server-only': lógica pura (sem banco, sem rede), importável pelo coletor e por scripts/testes tsx.

/**
 * COLETA POR (REDE, MASTER) DO MERCADO LIVRE: parte pura (ata do Conselho de 2026-11-06, decisão 1).
 *
 * A identidade da oferta no banco é (master, rede, vendedor). Um master com N catálogos ML era coletado por catálogo, e
 * os N grupos gravavam na MESMA oferta do vendedor, cada um com o preço do SEU anúncio => oscilação (RE3, vendedor
 * A2ZGAMESINCBRF: 188,76 / 190,02 / 192,12, três anúncios reais em três catálogos). Aqui:
 *   - o vendedor é representado pelo MENOR anúncio dele entre todos os catálogos do master (preço real observado,
 *     nunca interpolado), com a mesma regra de `collapseBySeller` (identidade duvidosa nunca representa; desempate
 *     por item id);
 *   - falha de qualquer catálogo => nada é gravado nem expirado para o master naquele ciclo (tudo ou nada);
 *   - o vendedor só expira se sumiu de TODOS os catálogos (união) e só com todas as chamadas OK.
 * Tudo atrás da flag COLLECT_MASTER_GROUPING (master-grouping-config.ts).
 */

/** Um anúncio de vendedor devolvido pela fonte (subconjunto estrutural de PriceSnapshotResult). */
export interface Listing {
  priceCents: number;
  listPriceCents?: number | null;
  externalSellerId: string;
  externalItemId: string;
}

export type Verdicts = ReadonlyMap<string, { excluded: boolean }>;

/**
 * Representa cada vendedor pelo anúncio mais barato (desempate: item id). Extraída SEM alteração de
 * collect-prices.ts (diagnóstico 2026-10-31: 483 ofertas, 186 mil trocas A-B-A em 7 dias quando o mesmo vendedor tem
 * 2+ anúncios do mesmo catálogo). Anúncio de identidade duvidosa (Open Box, outro modelo...) nunca representa o
 * vendedor se ele tem outro anúncio idêntico ao master, mesmo que mais caro.
 */
export function collapseBySeller<T extends Listing>(results: T[], verdicts: Verdicts = new Map()): T[] {
  const bad = (r: T) => (verdicts.get(r.externalItemId)?.excluded ? 1 : 0);
  const bySeller = new Map<string, T>();
  for (const r of results) {
    const cur = bySeller.get(r.externalSellerId);
    if (
      !cur ||
      bad(r) < bad(cur) ||
      (bad(r) === bad(cur) &&
        (r.priceCents < cur.priceCents || (r.priceCents === cur.priceCents && r.externalItemId < cur.externalItemId)))
    ) {
      bySeller.set(r.externalSellerId, r);
    }
  }
  return Array.from(bySeller.values());
}

// ---------------------------------------------------------------------------------------------------------------
// Agrupamento das ofertas devidas
// ---------------------------------------------------------------------------------------------------------------

export interface DueOffer {
  id: string;
  externalRef: string | null;
  networkId: string;
  networkSlug: string;
  masterProductId: string;
}

/** Grupo legado: 1 chamada de API por (rede, catálogo). */
export interface CatalogGroup {
  networkId: string;
  networkSlug: string;
  externalRef: string;
  masterProductId: string;
  offerIds: string[];
}

/** Alvo da coleta por master: os catálogos são descobertos no banco (todas as ofertas ativas/rascunho do master). */
export interface MasterTarget {
  networkId: string;
  networkSlug: string;
  masterProductId: string;
  /** Ofertas do master que estavam devidas neste ciclo (as demais irmãs são carregadas do banco). */
  dueOfferIds: string[];
}

export interface GroupedDue {
  catalogGroups: CatalogGroup[];
  masterTargets: MasterTarget[];
  /** Chamadas de catálogo que o agrupamento LEGADO faria para as ofertas dos masters agrupados (linha de base da cota). */
  masterBaselineCalls: number;
}

/**
 * Separa as ofertas devidas em grupos por catálogo (legado) e alvos por master. Com `isMasterGrouped` sempre falso
 * (flag desligada) a saída `catalogGroups` é IDÊNTICA ao agrupamento original de collect-prices.ts (provado em
 * scripts/test-collector-multicatalog.ts contra uma cópia literal do laço original).
 */
export function groupDueOffers(dueOffers: DueOffer[], isMasterGrouped: (masterProductId: string) => boolean): GroupedDue {
  const groups = new Map<string, CatalogGroup>();
  const targets = new Map<string, MasterTarget>();
  const baselineRefs = new Set<string>();
  for (const offer of dueOffers) {
    if (isMasterGrouped(offer.masterProductId)) {
      const tkey = `${offer.networkId}:${offer.masterProductId}`;
      const target = targets.get(tkey);
      if (target) target.dueOfferIds.push(offer.id);
      else {
        targets.set(tkey, {
          networkId: offer.networkId,
          networkSlug: offer.networkSlug,
          masterProductId: offer.masterProductId,
          dueOfferIds: [offer.id],
        });
      }
      baselineRefs.add(`${offer.networkId}:${offer.externalRef}`);
      continue;
    }
    const key = `${offer.networkId}:${offer.externalRef}`;
    const existing = groups.get(key);
    if (existing) {
      existing.offerIds.push(offer.id);
    } else {
      groups.set(key, {
        networkId: offer.networkId,
        networkSlug: offer.networkSlug,
        externalRef: offer.externalRef!,
        masterProductId: offer.masterProductId,
        offerIds: [offer.id],
      });
    }
  }
  return {
    catalogGroups: Array.from(groups.values()),
    masterTargets: Array.from(targets.values()),
    masterBaselineCalls: baselineRefs.size,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Busca dos catálogos do master (sequencial, com retry, tudo ou nada)
// ---------------------------------------------------------------------------------------------------------------

export type CatalogStatus = 'ok' | 'failed' | 'skipped';

export interface CatalogOutcome<T extends Listing = Listing> {
  externalRef: string;
  status: CatalogStatus;
  results: T[];
  error?: string;
  /** Tipo da falha quando conhecido (ex.: 'orcamento', 'incompleto', 'teto-paginas'); ver CatalogPagingError. */
  errorKind?: string;
}

export type CatalogFetchFn<T extends Listing = Listing, C = never> = (externalRef: string, ctx?: C) => Promise<T[]>;

/**
 * Cache POR CICLO das respostas de catálogo: masters que compartilham um catálogo (duplicata) chamam a API uma vez só.
 * Chamadas simultâneas do mesmo catálogo dividem a mesma promessa; falha NÃO fica em cache (o retry busca de novo).
 */
export function createCatalogFetcher<T extends Listing, C = never>(fetchFn: CatalogFetchFn<T, C>): CatalogFetchFn<T, C> {
  const cache = new Map<string, Promise<T[]>>();
  // `ctx` (ex.: qual master paga o orçamento) vai só para quem dispara a busca real; quem pega do cache não paga.
  return (externalRef, ctx) => {
    const hit = cache.get(externalRef);
    if (hit) return hit;
    const p = fetchFn(externalRef, ctx);
    cache.set(externalRef, p);
    p.catch(() => {
      if (cache.get(externalRef) === p) cache.delete(externalRef);
    });
    return p;
  };
}

export interface FetchMasterResult<T extends Listing = Listing> {
  outcomes: CatalogOutcome<T>[];
  /** true somente se TODOS os catálogos responderam com sucesso. */
  complete: boolean;
  /** Chamadas feitas à fonte, contando retries (é o que consome cota). */
  attempts: number;
}

/**
 * Busca os catálogos do master EM SEQUÊNCIA (dentro de um slot de concorrência) e em ordem estável (ordenada, sem
 * repetidos). Cada catálogo tem `retries` novas tentativas (padrão 1). Falha persistente interrompe a busca: o que
 * restar fica 'skipped' e o master inteiro é tratado como incompleto (economiza cota; nada seria gravado mesmo).
 */
export async function fetchMasterCatalogs<T extends Listing>(
  externalRefs: string[],
  fetchFn: CatalogFetchFn<T>,
  opts: { retries?: number } = {}
): Promise<FetchMasterResult<T>> {
  const retries = opts.retries ?? 1;
  const refs = Array.from(new Set(externalRefs)).sort();
  const outcomes: CatalogOutcome<T>[] = [];
  let attempts = 0;
  let failed = false;
  for (const ref of refs) {
    if (failed) {
      outcomes.push({ externalRef: ref, status: 'skipped', results: [] });
      continue;
    }
    let lastError = '';
    let lastKind: string | undefined;
    let done = false;
    for (let i = 0; i <= retries && !done; i++) {
      attempts++;
      try {
        const results = await fetchFn(ref);
        outcomes.push({ externalRef: ref, status: 'ok', results });
        done = true;
      } catch (err) {
        lastError = sanitizeErrorForSummary(err instanceof Error ? err.message : String(err));
        lastKind = err instanceof CatalogPagingError ? err.kind : undefined;
        if (err instanceof CatalogPagingError) break; // paginação incompleta/orçamento: repetir o catálogo inteiro não resolve
      }
    }
    if (!done) {
      failed = true;
      outcomes.push({ externalRef: ref, status: 'failed', results: [], error: lastError, errorKind: lastKind });
    }
  }
  return { outcomes, complete: !failed, attempts };
}

// ---------------------------------------------------------------------------------------------------------------
// Paginação de /products/{catalog}/items (SÓ no caminho por master; ata 2026-11-06, seção "Implementação da paginação")
// ---------------------------------------------------------------------------------------------------------------
//
// Fatos medidos na API oficial: a resposta traz paging {total, offset, limit}; limit padrão 100; limit e offset
// funcionam (limit=10&offset=95 -> 2 itens de total 97). O TETO máximo de limit é DESCONHECIDO: nunca pedimos mais que 100.
// Lista incompleta é FALHA do catálogo (regime tudo-ou-nada do master): sem isso, vendedores além do corte pareceriam
// ausentes e seriam expirados indevidamente.

/** Tamanho de página pedido (e máximo aceito: o teto real da API é desconhecido, não testamos acima de 100). */
export const MASTER_PAGE_SIZE = 100;
/** Teto de páginas por catálogo (10 x 100 = 1000 anúncios). Acima disso o catálogo falha e nada é gravado. */
export const MASTER_MAX_PAGES_PER_CATALOG = 10;
/** Catálogo com total acima disto entra no alarme do summary (mede, sem custo, quantos precisam de 2+ páginas). */
export const CATALOG_ALARM_TOTAL = 100;

export type CatalogPagingErrorKind =
  | 'paging-ausente'
  | 'paging-inconsistente'
  | 'incompleto'
  | 'teto-paginas'
  | 'orcamento'
  | 'pagina-falhou';

export class CatalogPagingError extends Error {
  readonly kind: CatalogPagingErrorKind;
  constructor(kind: CatalogPagingErrorKind, externalRef: string, detail: string) {
    super(`[${kind}] ${externalRef}: ${detail}`);
    this.name = 'CatalogPagingError';
    this.kind = kind;
  }
}

export interface CatalogPaging {
  total: number;
  offset: number;
  limit: number;
}

export interface CatalogPage<T extends Listing = Listing> {
  /** Anúncios aproveitáveis da página (ex.: só condition=new). */
  items: T[];
  /** Ids de TODOS os itens brutos da página (qualquer condição): é o que conta para offset e para o total. */
  rawIds: string[];
  /** null = `paging` AUSENTE de fato (chave ausente ou null) OU presente porém inválido (ver pagingInvalid). */
  paging: CatalogPaging | null;
  /** true = `paging` PRESENTE mas inválido (tipo errado, campos faltando, NaN, negativo, não inteiro): falha fechada. */
  pagingInvalid?: boolean;
}

export type CatalogPageFetchFn<T extends Listing = Listing> = (externalRef: string, offset: number, limit: number) => Promise<CatalogPage<T>>;

export interface PagedCatalogResult<T extends Listing = Listing> {
  /** Anúncios únicos por item id, de todas as páginas. */
  items: T[];
  /** paging.total informado pela API. */
  total: number;
  pages: number;
  /** Chamadas feitas, contando retries (é o que consome cota). */
  calls: number;
  /**
   * true = 200 bem formado, `results` vazio e SEM paging, tratado como catálogo sem vendedores. Caso NÃO medido na API
   * real (só o caso com paging foi medido): fica contado no summary (catalogosVaziosSemPaging) para visibilidade.
   */
  emptyWithoutPaging: boolean;
}

/**
 * Busca TODAS as páginas de um catálogo, em sequência (offset crescente), ou falha. Nunca devolve lista parcial.
 *  - continua enquanto offset + brutos da página < paging.total (o offset avança pelo que realmente veio);
 *  - cada página tem `retries` nova tentativa (padrão 1); cada tentativa passa por `charge()` ANTES (orçamento);
 *  - paging ausente/inconsistente (total não inteiro/negativo, offset diferente do pedido, total mudando entre
 *    páginas), página sem progresso, total não alcançado e teto de páginas => CatalogPagingError;
 *  - itens repetidos entre páginas são deduplicados por item id (o primeiro vale); a completude usa ids brutos únicos.
 */
export async function fetchCatalogAllPages<T extends Listing>(
  externalRef: string,
  fetchPage: CatalogPageFetchFn<T>,
  opts: { pageSize?: number; maxPages?: number; retries?: number; charge?: () => boolean } = {}
): Promise<PagedCatalogResult<T>> {
  const pageSize = Math.min(MASTER_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize ?? MASTER_PAGE_SIZE)));
  const maxPages = opts.maxPages ?? MASTER_MAX_PAGES_PER_CATALOG;
  const retries = opts.retries ?? 1;
  const seenRaw = new Set<string>();
  const byItem = new Map<string, T>();
  let offset = 0;
  let total: number | null = null;
  let pages = 0;
  let calls = 0;
  do {
    if (pages >= maxPages) {
      throw new CatalogPagingError('teto-paginas', externalRef, `mais de ${maxPages} páginas (total ${total}, lidos ${seenRaw.size})`);
    }
    let page: CatalogPage<T> | null = null;
    let lastError = '';
    for (let attempt = 0; attempt <= retries && !page; attempt++) {
      if (opts.charge && !opts.charge()) {
        throw new CatalogPagingError('orcamento', externalRef, `orçamento de chamadas esgotado na página ${pages + 1} (offset ${offset})`);
      }
      calls++;
      try {
        page = await fetchPage(externalRef, offset, pageSize);
      } catch (err) {
        lastError = sanitizeErrorForSummary(err instanceof Error ? err.message : String(err));
      }
    }
    if (!page) {
      throw new CatalogPagingError('pagina-falhou', externalRef, `página ${pages + 1} (offset ${offset}) falhou após ${retries} retry: ${lastError}`);
    }
    pages++;
    if (page.pagingInvalid) {
      throw new CatalogPagingError('paging-inconsistente', externalRef, `paging presente porém inválido (offset ${offset})`);
    }
    const paging = page.paging;
    if (!paging) {
      // Única exceção: 1ª página, resposta 200 bem formada (parse exige results array), lista VAZIA (nenhum item bruto).
      // Qualquer resposta com itens e sem paging, ou vazia fora da 1ª página, segue falhando.
      if (pages === 1 && offset === 0 && page.items.length === 0 && page.rawIds.length === 0) {
        return { items: [], total: 0, pages, calls, emptyWithoutPaging: true };
      }
      throw new CatalogPagingError('paging-ausente', externalRef, `resposta sem paging (offset ${offset})`);
    }
    if (!Number.isInteger(paging.total) || paging.total < 0) {
      throw new CatalogPagingError('paging-inconsistente', externalRef, `paging.total inválido: ${paging.total}`);
    }
    if (paging.offset !== offset) {
      throw new CatalogPagingError('paging-inconsistente', externalRef, `paging.offset ${paging.offset} diferente do pedido ${offset}`);
    }
    if (total !== null && paging.total !== total) {
      throw new CatalogPagingError('paging-inconsistente', externalRef, `paging.total mudou entre páginas (${total} -> ${paging.total})`);
    }
    total = paging.total;
    if (total === 0 && page.rawIds.length > 0) {
      throw new CatalogPagingError('paging-inconsistente', externalRef, `paging.total 0 com ${page.rawIds.length} itens na página`);
    }
    for (const id of page.rawIds) seenRaw.add(id);
    if (seenRaw.size > total) {
      throw new CatalogPagingError('paging-inconsistente', externalRef, `${seenRaw.size} itens únicos, mais que paging.total ${total}`);
    }
    for (const item of page.items) if (!byItem.has(item.externalItemId)) byItem.set(item.externalItemId, item);
    if (page.rawIds.length === 0 && offset < total) {
      throw new CatalogPagingError('incompleto', externalRef, `página sem itens com offset ${offset} < total ${total}`);
    }
    offset += page.rawIds.length;
  } while (total !== null && offset < total);
  if (total !== null && seenRaw.size < total) {
    throw new CatalogPagingError('incompleto', externalRef, `lidos ${seenRaw.size} itens únicos de ${total}`);
  }
  return { items: Array.from(byItem.values()), total: total ?? 0, pages, calls, emptyWithoutPaging: false };
}

/**
 * Envolve o fetcher por-ciclo: o master ISENTO que herda uma falha por ORÇAMENTO disparada por outro master (promessa em
 * cache) refaz a busca, agora paga com isenção. Falha não fica em cache, então a nova chamada busca de verdade. Master
 * comum e demais tipos de falha passam direto.
 */
export function withExemptRetry<T extends Listing, C extends string>(
  fetcher: CatalogFetchFn<T, C>,
  isExempt: (owner: C) => boolean
): (externalRef: string, owner: C) => Promise<T[]> {
  return async (externalRef, owner) => {
    try {
      return await fetcher(externalRef, owner);
    } catch (err) {
      if (err instanceof CatalogPagingError && err.kind === 'orcamento' && isExempt(owner)) return fetcher(externalRef, owner);
      throw err;
    }
  };
}

/**
 * Interpreta o corpo JSON de GET /products/{id}/items (parte pura do adapter do Mercado Livre). Só anúncios novos com
 * seller_id e item_id viram Listing (mesma regra do legado); `rawIds` contam TODOS os itens brutos.
 * `offset` só serve para dar chave única a item bruto sem item_id.
 */
export function parseMeliCatalogPage(body: unknown, offset = 0): CatalogPage<Listing> {
  const b = body as { results?: unknown; paging?: unknown } | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.results)) {
    throw new Error('resposta de /products/{id}/items sem results (array)');
  }
  const items: Listing[] = [];
  const rawIds: string[] = [];
  (b.results as Array<Record<string, unknown>>).forEach((r, i) => {
    rawIds.push(r.item_id != null ? String(r.item_id) : `__sem-id:${offset + i}`);
    if (r.seller_id != null && r.item_id != null && r.condition === 'new') {
      items.push({
        priceCents: Math.round(Number(r.price) * 100),
        listPriceCents: r.original_price != null ? Math.round(Number(r.original_price) * 100) : null,
        externalSellerId: String(r.seller_id),
        externalItemId: String(r.item_id),
      });
    }
  });
  // Só `paging` undefined/null é "ausente de fato". Presente porém malformado NÃO vira ausente: pagingInvalid => falha fechada.
  let paging: CatalogPaging | null = null;
  let pagingInvalid = false;
  if (b.paging !== undefined && b.paging !== null) {
    const pg = b.paging as { total?: unknown; offset?: unknown; limit?: unknown };
    const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    if (typeof pg === 'object' && !Array.isArray(pg) && isCount(pg.total) && isCount(pg.offset) && isCount(pg.limit)) {
      paging = { total: pg.total, offset: pg.offset, limit: pg.limit };
    } else {
      pagingInvalid = true;
    }
  }
  return { items, rawIds, paging, pagingInvalid };
}

/**
 * Texto de erro que pode ir ao summary/logs do coletor por master: REDIGE credenciais (Bearer, access_token,
 * refresh_token, client_secret...) ANTES de cortar em ~200 caracteres, para um segredo no corte não vazar pela metade.
 * As mensagens de mercado-livre-auth.ts embutem o corpo da resposta; o legado não usa esta função (inalterado).
 */
export function sanitizeErrorForSummary(message: string, max = 200): string {
  const redacted = message
    .replace(/Bearer\s+[^\s"',;}]+/gi, 'Bearer [redigido]')
    .replace(/(["']?)(access_token|refresh_token|client_secret|client_id|api[_-]?key|authorization|token)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,&}]+)/gi, '$2=[redigido]');
  return redacted.length > max ? redacted.slice(0, max) + '…' : redacted;
}

// ---------------------------------------------------------------------------------------------------------------
// Consolidação
// ---------------------------------------------------------------------------------------------------------------

export type WithCatalog<T> = T & { catalogRef: string };

export interface MasterConsolidation<T extends Listing = Listing> {
  /** true somente se todos os catálogos responderam OK. Falso => `sellers` vazio (nada a gravar). */
  complete: boolean;
  /** Um resultado por vendedor (menor anúncio entre os catálogos), ordenado por id do vendedor. */
  sellers: WithCatalog<T>[];
  /** Melhor preço (identidade ok) do PRÓPRIO catálogo, para o placeholder dele (`pickCatalogPlaceholder`). */
  bestByCatalog: Map<string, WithCatalog<T>>;
  /** Catálogos que responderam OK e vazios (o placeholder deles conta falta, como no coletor atual). */
  emptyCatalogs: string[];
  /** Quantidade de vendedores na união dos catálogos. 0 = ninguém vende em nenhum catálogo. */
  unionSize: number;
}

export function consolidateMasterResults<T extends Listing>(
  outcomes: CatalogOutcome<T>[],
  verdicts: Verdicts = new Map()
): MasterConsolidation<T> {
  if (outcomes.some((o) => o.status !== 'ok')) {
    return { complete: false, sellers: [], bestByCatalog: new Map(), emptyCatalogs: [], unionSize: 0 };
  }
  // Ordem de entrada nunca decide nada: catálogos ordenados por ref, desempates por preço e item id.
  const sorted = [...outcomes].sort((a, b) => (a.externalRef < b.externalRef ? -1 : a.externalRef > b.externalRef ? 1 : 0));
  const tagged: WithCatalog<T>[] = sorted.flatMap((o) => o.results.map((r) => ({ ...r, catalogRef: o.externalRef })));
  const sellers = collapseBySeller(tagged, verdicts).sort((a, b) =>
    a.externalSellerId < b.externalSellerId ? -1 : a.externalSellerId > b.externalSellerId ? 1 : 0
  );

  const bestByCatalog = new Map<string, WithCatalog<T>>();
  const emptyCatalogs: string[] = [];
  for (const o of sorted) {
    if (o.results.length === 0) {
      emptyCatalogs.push(o.externalRef);
      continue;
    }
    const own = collapseBySeller(
      o.results.map((r) => ({ ...r, catalogRef: o.externalRef })),
      verdicts
    ).filter((r) => verdicts.get(r.externalItemId)?.excluded !== true);
    if (own.length === 0) continue;
    bestByCatalog.set(o.externalRef, own.reduce((a, b) => (b.priceCents < a.priceCents ? b : a)));
  }
  return { complete: true, sellers, bestByCatalog, emptyCatalogs, unionSize: sellers.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Expiração
// ---------------------------------------------------------------------------------------------------------------

export interface MasterOfferRef {
  id: string;
  /** true = placeholder de catálogo (seller_id nulo): nunca é expirado por "sumiu", só pelo contador de faltas. */
  isPlaceholder: boolean;
}

export type ExpiryDecision =
  | { action: 'none'; expireIds: []; missIds: [] }
  | { action: 'expire'; expireIds: string[]; missIds: [] }
  | { action: 'miss'; expireIds: []; missIds: string[] };

/**
 * Decide o destino das ofertas do master depois da coleta.
 *  - master incompleto (algum catálogo falhou): nada.
 *  - união vazia (todos OK e vazios): contador de faltas (MAX_CONSECUTIVE_MISSES) em todas, igual ao coletor atual
 *    para catálogo único;
 *  - união não vazia: expira (imediato, semântica atual) a oferta de vendedor que não apareceu em NENHUM catálogo.
 *    Se a gravação de algum vendedor falhou no ciclo, não expira ninguém (não dá para afirmar quem sumiu).
 */
export function decideMasterExpiry(input: {
  complete: boolean;
  unionSize: number;
  offers: MasterOfferRef[];
  updatedOfferIds: ReadonlySet<string>;
  sellerUpsertFailed: boolean;
}): ExpiryDecision {
  if (!input.complete) return { action: 'none', expireIds: [], missIds: [] };
  if (input.unionSize === 0) return { action: 'miss', expireIds: [], missIds: input.offers.map((o) => o.id) };
  if (input.sellerUpsertFailed) return { action: 'none', expireIds: [], missIds: [] };
  const expireIds = input.offers.filter((o) => !o.isPlaceholder && !input.updatedOfferIds.has(o.id)).map((o) => o.id);
  return expireIds.length > 0 ? { action: 'expire', expireIds, missIds: [] } : { action: 'none', expireIds: [], missIds: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// Cota
// ---------------------------------------------------------------------------------------------------------------

/** Teto de chamadas de catálogo por ciclo para os masters agrupados: linha de base + 10% (arredondado para cima). */
export function masterCallCap(baselineCalls: number): number {
  return Math.ceil((baselineCalls * 11) / 10);
}

export interface CallBudget {
  /** Modelo antigo (1 chamada por catálogo): reserva as chamadas de um master; catálogos já reservados não custam. O 1º master sempre passa. */
  tryReserve(externalRefs: string[]): boolean;
  /**
   * Modelo por PÁGINA (coleta paginada): admite o master se houver folga mínima (`minCalls` = 1 por catálogo), sem
   * consumir. O 1º master a perguntar é ISENTO do teto (senão um master de 19 catálogos nunca seria coletado).
   */
  canAdmit(owner: string, minCalls: number): boolean;
  /** Elege ANTES da corrida o master isento do teto (determinístico; senão o 1º a perguntar vira isento). */
  setExempt(owner: string): void;
  isExempt(owner: string): boolean;
  /**
   * Admissão ATÔMICA: como canAdmit, mas RESERVA `minCalls` para o master (a folga livre = teto - cobradas - reservas
   * dos outros), então 4 masters concorrentes não disputam a mesma folga. As cobranças do master consomem a reserva
   * primeiro. Chame `release(owner)` ao terminar para devolver o que não foi usado.
   */
  admit(owner: string, minCalls: number): boolean;
  release(owner: string): void;
  /** Cobra 1 chamada (1 página ou 1 retry), verificada ANTES da chamada. Recusa quando o teto acabou (exceto o isento). */
  tryCharge(owner: string): boolean;
  /** Chamadas reservadas (modelo antigo) + cobradas (modelo por página). */
  used(): number;
}

export function createCallBudget(cap: number): CallBudget {
  const reserved = new Set<string>();
  let charged = 0;
  let exemptOwner: string | null = null;
  const holds = new Map<string, number>();
  const heldTotal = () => Array.from(holds.values()).reduce((a, b) => a + b, 0);
  const used = () => reserved.size + charged;
  return {
    tryReserve(externalRefs) {
      const fresh = Array.from(new Set(externalRefs)).filter((r) => !reserved.has(r));
      if (reserved.size > 0 && reserved.size + fresh.length > cap) return false;
      for (const r of fresh) reserved.add(r);
      return true;
    },
    canAdmit(owner, minCalls) {
      if (exemptOwner === null) exemptOwner = owner;
      if (owner === exemptOwner) return true;
      return cap - used() - heldTotal() >= minCalls;
    },
    setExempt(owner) {
      exemptOwner = owner;
    },
    isExempt: (owner) => owner === exemptOwner,
    admit(owner, minCalls) {
      if (exemptOwner === null) exemptOwner = owner;
      if (owner === exemptOwner) return true;
      if (cap - used() - heldTotal() < minCalls) return false;
      holds.set(owner, (holds.get(owner) ?? 0) + minCalls);
      return true;
    },
    release(owner) {
      holds.delete(owner);
    },
    tryCharge(owner) {
      if (exemptOwner === null) exemptOwner = owner;
      if (owner === exemptOwner) {
        charged++;
        return true;
      }
      const hold = holds.get(owner) ?? 0;
      if (hold > 0) {
        holds.set(owner, hold - 1);
        charged++;
        return true;
      }
      if (cap - used() - heldTotal() > 0) {
        charged++;
        return true;
      }
      return false;
    },
    used,
  };
}

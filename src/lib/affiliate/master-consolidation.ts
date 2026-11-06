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
}

export type CatalogFetchFn<T extends Listing = Listing> = (externalRef: string) => Promise<T[]>;

/**
 * Cache POR CICLO das respostas de catálogo: masters que compartilham um catálogo (duplicata) chamam a API uma vez só.
 * Chamadas simultâneas do mesmo catálogo dividem a mesma promessa; falha NÃO fica em cache (o retry busca de novo).
 */
export function createCatalogFetcher<T extends Listing>(fetchFn: CatalogFetchFn<T>): CatalogFetchFn<T> {
  const cache = new Map<string, Promise<T[]>>();
  return (externalRef) => {
    const hit = cache.get(externalRef);
    if (hit) return hit;
    const p = fetchFn(externalRef);
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
    let done = false;
    for (let i = 0; i <= retries && !done; i++) {
      attempts++;
      try {
        const results = await fetchFn(ref);
        outcomes.push({ externalRef: ref, status: 'ok', results });
        done = true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    if (!done) {
      failed = true;
      outcomes.push({ externalRef: ref, status: 'failed', results: [], error: lastError });
    }
  }
  return { outcomes, complete: !failed, attempts };
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
  /** Reserva as chamadas de um master; catálogos já reservados (compartilhados) não custam. O 1º master sempre passa. */
  tryReserve(externalRefs: string[]): boolean;
  used(): number;
}

export function createCallBudget(cap: number): CallBudget {
  const reserved = new Set<string>();
  return {
    tryReserve(externalRefs) {
      const fresh = Array.from(new Set(externalRefs)).filter((r) => !reserved.has(r));
      if (reserved.size > 0 && reserved.size + fresh.length > cap) return false;
      for (const r of fresh) reserved.add(r);
      return true;
    },
    used: () => reserved.size,
  };
}

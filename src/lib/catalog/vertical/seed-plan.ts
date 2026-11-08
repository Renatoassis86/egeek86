// Sem 'server-only': planejador de semeadura. Só LEITURA da API oficial do ML (via MlClient) e consultas de duplicata
// injetadas (lookup). Não escreve em lugar nenhum: quem grava é scripts/semear-vertical.ts, e só com --apply.
import { parseMeliCatalogPage } from '@/lib/affiliate/master-consolidation';
import { domainMatches, type SegmentConfig } from './config';
import { gateFor, type VerticalGateResult } from './gate';
import { evaluateIdentity, normalizeTitleKey, type IdentityResult, type MlAttribute, type MlCatalogPayload } from './identity';
import { CallBudgetExceeded, RateLimited, type MlClient } from './ml-api';

/** Consultas de duplicata (somente leitura no banco). Implementadas pelo script; em memória nos testes. */
export interface ExistingLookup {
  byCatalogId(catalogId: string): Promise<{ id: string; name: string } | null>;
  byGtins(gtins: string[]): Promise<{ id: string; name: string } | null>;
  byIdentityKey(key: string): Promise<{ id: string; name: string } | null>;
  byTitleKey(titleKey: string): Promise<{ id: string; name: string } | null>;
}

export interface SeedOptions {
  /** Tamanho da página de /products/search (padrão 10, o valor medido). */
  pageLimit?: number;
  /** Offset inicial de /products/search. */
  offset?: number;
  /** Quantos termos da whitelist usar (padrão todos). */
  termsLimit?: number;
  /** Máximo de masters a PLANEJAR criar por segmento. */
  maxCreate?: number;
  log?: (msg: string) => void;
}

export interface SeedPlanEntry {
  catalogId: string;
  name: string;
  domainId: string | null;
  term: string;
  segment: string;
  vertical: string;
  identity: IdentityResult;
  gate: VerticalGateResult;
  /** Anúncios NOVOS devolvidos por /products/{id}/items (condition = new). */
  sellers: number;
  distinctSellers: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  /** original_price BRUTO do anúncio mais barato (null se a API não devolveu); nunca base de selo. */
  bestOriginalPriceCents: number | null;
  catalogTotal: number | null;
  /** HTTP 206 / total > itens: itens parciais, nada inventado. */
  partial: boolean;
  httpStatusItems: number;
  pictures: string[];
  attributesSnapshot: Record<string, string | null>;
  parentId: string | null;
  brand: string | null;
  mpn: string | null;
}

export interface SeedSkip {
  catalogId: string;
  name: string;
  reason: string;
  detail?: string | null;
}

export interface SeedReport {
  segment: string;
  vertical: string;
  termsSearched: number;
  searchResults: number;
  counts: Record<string, number>;
  plans: SeedPlanEntry[];
  skips: SeedSkip[];
  /** Candidatos sem identidade forte: fila de revisão humana (NUNCA viram master automático). */
  reviews: Array<{ catalogId: string; name: string; reason: string; missing: string[]; domainId: string | null }>;
  errors: string[];
  stoppedBecause: string | null;
  callsUsed: number;
}

const bump = (c: Record<string, number>, k: string) => {
  c[k] = (c[k] ?? 0) + 1;
};

/** Atributos de identidade/auditoria guardados no master (só o que a API devolveu). */
const SNAPSHOT_ATTRS = ['BRAND', 'MODEL', 'ALPHANUMERIC_MODEL', 'LINE', 'SERIES', 'EDITION', 'MEMORY_SIZE', 'CAPACITY', 'VOLTAGE', 'TOTAL_CAPACITY', 'COLOR', 'VERSION', 'MPN', 'GTIN', 'AUTHOR', 'BOOK_TITLE', 'BOOK_PUBLISHER', 'BOOK_EDITION', 'BOOK_COVER'];

function mergeDetail(search: MlCatalogPayload, detail: MlCatalogPayload | null): MlCatalogPayload {
  if (!detail) return search;
  const byId = new Map<string, MlAttribute>();
  for (const a of search.attributes ?? []) if (a?.id) byId.set(a.id, a);
  for (const a of detail.attributes ?? []) if (a?.id) byId.set(a.id, a); // o detalhe é a fonte mais completa
  return {
    id: search.id,
    name: detail.name ?? search.name,
    domain_id: detail.domain_id ?? search.domain_id,
    status: detail.status ?? search.status,
    attributes: Array.from(byId.values()),
    pictures: detail.pictures ?? search.pictures,
    parent_id: detail.parent_id ?? search.parent_id ?? null,
  };
}

export async function planSeed(client: MlClient, seg: SegmentConfig, lookup: ExistingLookup, opts: SeedOptions = {}): Promise<SeedReport> {
  const log = opts.log ?? (() => {});
  const gate = gateFor(seg.vertical);
  const pageLimit = opts.pageLimit ?? 10;
  const maxCreate = opts.maxCreate ?? 20;
  const terms = seg.terms.slice(0, opts.termsLimit ?? seg.terms.length);
  const report: SeedReport = {
    segment: seg.key,
    vertical: seg.vertical,
    termsSearched: 0,
    searchResults: 0,
    counts: {},
    plans: [],
    skips: [],
    reviews: [],
    errors: [],
    stoppedBecause: null,
    callsUsed: 0,
  };
  const seenCatalogs = new Set<string>();
  const skip = (p: MlCatalogPayload, reason: string, detail: string | null = null) => {
    bump(report.counts, reason);
    report.skips.push({ catalogId: p.id, name: p.name ?? '', reason, detail });
  };

  try {
    outer: for (const term of terms) {
      const r = await client.get(
        `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(term)}&limit=${pageLimit}&offset=${opts.offset ?? 0}`
      );
      report.termsSearched++;
      if (r.status !== 200 || !Array.isArray(r.json?.results)) {
        report.errors.push(`busca "${term}" HTTP ${r.status}`);
        bump(report.counts, 'erro_busca');
        continue;
      }
      const results: MlCatalogPayload[] = r.json.results;
      report.searchResults += results.length;

      for (const searchPayload of results) {
        if (!searchPayload?.id || seenCatalogs.has(searchPayload.id)) continue;
        seenCatalogs.add(searchPayload.id);
        if (report.plans.length >= maxCreate) {
          report.stoppedBecause = 'teto_de_criacao';
          break outer;
        }

        // 1) Identidade na resposta da busca (0 chamadas).
        const idSearch = evaluateIdentity(searchPayload, seg);
        if (idSearch.status === 'off_domain') {
          skip(searchPayload, 'dominio_fora_do_segmento', searchPayload.domain_id ?? null);
          continue;
        }
        if (idSearch.status === 'rejected') {
          skip(searchPayload, 'rejeitado_' + idSearch.reason, idSearch.matched);
          continue;
        }
        if (idSearch.status === 'review') {
          bump(report.counts, 'revisao_sem_identidade_forte');
          report.reviews.push({ catalogId: searchPayload.id, name: searchPayload.name ?? '', reason: idSearch.reason, missing: idSearch.missing, domainId: searchPayload.domain_id ?? null });
          continue;
        }

        // 2) Duplicata ANTES de gastar chamadas (0 chamadas de API).
        const dup = await findDuplicate(lookup, report.plans, searchPayload.id, idSearch, searchPayload.name ?? '');
        if (dup) {
          skip(searchPayload, dup.reason, `${dup.master.id} ${dup.master.name}`);
          continue;
        }

        // 3) /items primeiro: 70% dos catálogos medidos não têm vendedor (404 "No winners found"); descarta sem retentar.
        if (client.remaining() < 2) {
          report.stoppedBecause = 'teto_de_chamadas';
          break outer;
        }
        const it = await client.get(`/products/${searchPayload.id}/items?limit=100`);
        if (it.status === 404) {
          skip(searchPayload, 'sem_vendedor_404');
          continue;
        }
        if (it.status !== 200 && it.status !== 206) {
          report.errors.push(`items ${searchPayload.id} HTTP ${it.status}`);
          bump(report.counts, 'erro_items');
          continue;
        }
        let page;
        try {
          page = parseMeliCatalogPage(it.json, 0);
        } catch (e) {
          report.errors.push(`items ${searchPayload.id}: ${(e as Error).message}`);
          bump(report.counts, 'erro_items');
          continue;
        }
        if (page.items.length === 0) {
          skip(searchPayload, 'sem_anuncio_novo', `brutos=${page.rawIds.length}`);
          continue;
        }

        // 4) Detalhe do catálogo (1 chamada): atributos completos; reavalia identidade e domínio.
        const dt = await client.get(`/products/${searchPayload.id}`);
        let detail: MlCatalogPayload | null = null;
        if (dt.status === 200 && dt.json?.id) detail = dt.json as MlCatalogPayload;
        else {
          report.errors.push(`detalhe ${searchPayload.id} HTTP ${dt.status}`);
          bump(report.counts, 'erro_detalhe');
        }
        const merged = mergeDetail(searchPayload, detail);
        const identity = evaluateIdentity(merged, seg);
        if (identity.status !== 'strong') {
          if (identity.status === 'review') {
            bump(report.counts, 'revisao_sem_identidade_forte');
            report.reviews.push({ catalogId: merged.id, name: merged.name ?? '', reason: identity.reason, missing: identity.missing, domainId: merged.domain_id ?? null });
          } else skip(merged, (identity.status === 'rejected' ? 'rejeitado_' : 'dominio_') + identity.reason, identity.matched);
          continue;
        }
        if (identity.key !== idSearch.key) {
          const dup2 = await findDuplicate(lookup, report.plans, merged.id, identity, merged.name ?? '');
          if (dup2) {
            skip(merged, dup2.reason, `${dup2.master.id} ${dup2.master.name}`);
            continue;
          }
        }

        // 5) Porteiro do departamento (evidência positiva).
        const verdict = gate.evaluate({ segment: seg.key, name: merged.name ?? '', domainId: merged.domain_id ?? null, identity });
        if (verdict.verdict === 'rejected') {
          skip(merged, 'porteiro_rejeitou_' + verdict.reason, verdict.matched);
          continue;
        }

        const prices = page.items.map((i) => i.priceCents);
        const cheapest = page.items.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
        const attributesSnapshot: Record<string, string | null> = {};
        for (const id of SNAPSHOT_ATTRS) {
          const a = (merged.attributes ?? []).find((x) => x?.id === id);
          const v = (a?.value_name ?? a?.values?.[0]?.name ?? '').toString().trim();
          if (v) attributesSnapshot[id] = v;
        }
        report.plans.push({
          catalogId: merged.id,
          name: merged.name ?? '',
          domainId: merged.domain_id ?? null,
          term,
          segment: seg.key,
          vertical: seg.vertical,
          identity,
          gate: verdict,
          sellers: page.items.length,
          distinctSellers: new Set(page.items.map((i) => i.externalSellerId)).size,
          priceMinCents: Math.min(...prices),
          priceMaxCents: Math.max(...prices),
          bestOriginalPriceCents: cheapest.listPriceCents ?? null,
          catalogTotal: page.paging?.total ?? null,
          partial: it.status === 206 || (page.paging != null && page.rawIds.length < page.paging.total),
          httpStatusItems: it.status,
          pictures: (merged.pictures ?? []).map((p) => p?.secure_url ?? p?.url ?? '').filter(Boolean),
          attributesSnapshot,
          parentId: merged.parent_id ?? null,
          brand: identity.brand,
          mpn: identity.mpn,
        });
        bump(report.counts, 'planejado_criar');
        log(`planejado: ${merged.id} | ${merged.name} | ${identity.key} | ${page.items.length} anúncios novos`);
      }
    }
  } catch (e) {
    if (e instanceof CallBudgetExceeded) report.stoppedBecause = 'teto_de_chamadas';
    else if (e instanceof RateLimited) report.stoppedBecause = 'http_429';
    else throw e;
  }
  report.callsUsed = client.used();
  return report;
}

async function findDuplicate(
  lookup: ExistingLookup,
  planned: SeedPlanEntry[],
  catalogId: string,
  identity: IdentityResult,
  name: string
): Promise<{ reason: string; master: { id: string; name: string } } | null> {
  // Dentro da mesma execução: dois catálogos da mesma chave/GTIN/título não viram dois masters.
  const tkPlanned = normalizeTitleKey(name);
  for (const p of planned) {
    if (p.identity.key && p.identity.key === identity.key) return { reason: 'ja_planejado_chave_identidade', master: { id: p.catalogId, name: p.name } };
    if (identity.gtins.some((g) => p.identity.gtins.includes(g))) return { reason: 'ja_planejado_gtin', master: { id: p.catalogId, name: p.name } };
    if (tkPlanned && normalizeTitleKey(p.name) === tkPlanned) return { reason: 'ja_planejado_titulo_conferir', master: { id: p.catalogId, name: p.name } };
  }
  const byCat = await lookup.byCatalogId(catalogId);
  if (byCat) return { reason: 'ja_existe_catalogo_ml', master: byCat };
  if (identity.gtins.length > 0) {
    const byGtin = await lookup.byGtins(identity.gtins);
    if (byGtin) return { reason: 'ja_existe_gtin', master: byGtin };
  }
  if (identity.key) {
    const byKey = await lookup.byIdentityKey(identity.key);
    if (byKey) return { reason: 'ja_existe_chave_identidade', master: byKey };
  }
  const tk = normalizeTitleKey(name);
  if (tk) {
    const byTitle = await lookup.byTitleKey(tk);
    // Mesmo título normalizado, chave diferente: NÃO cria (um produto = um master); vai para conferência no log.
    if (byTitle) return { reason: 'titulo_duplicado_conferir', master: byTitle };
  }
  return null;
}

export { domainMatches };

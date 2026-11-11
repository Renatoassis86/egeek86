// Sem 'server-only': planejador de semeadura. Só LEITURA da API oficial do ML (via MlClient) e consultas de duplicata
// injetadas (lookup). Não escreve em lugar nenhum: quem grava é scripts/semear-vertical.ts, e só com --apply.
import { parseMeliCatalogPage } from '@/lib/affiliate/master-consolidation';
import { domainMatches, type SegmentConfig } from './config';
import { colorlessTitleKey, stripColors } from './scope';
import { gateFor, type VerticalGateResult } from './gate';
import { evaluateIdentity, normalizeTitleKey, type IdentityResult, type MlAttribute, type MlCatalogPayload } from './identity';
import { CallBudgetExceeded, DailyBudgetExceeded, RateLimited, type MlClient } from './ml-api';
import { pagingDecision, searchPath } from './seed-utils';

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
  /** Paginas por termo (padrao 1). Avanca em largura: pagina 1 de todos os termos, depois a 2... Para o termo se a pagina nao rendeu (pagingDecision). */
  pages?: number;
  /** Cache negativo de catalogos sem vendedor (404): consulta e registro, sem chamar a API. */
  isKnownNotFound?: (catalogId: string) => boolean;
  onNotFound?: (catalogId: string) => void;
  /** Interrupcao segura (Ctrl+C): checada antes de cada busca e de cada candidato; o que ja foi planejado e mantido. */
  shouldStop?: () => boolean;
  /** Filtro de dominio na propria busca (SegmentConfig.searchDomain), quando verificado. */
  useSearchDomain?: boolean;
  /** Quantos termos da whitelist usar (padrão todos). */
  termsLimit?: number;
  /** Primeiro termo a usar (0-based): rodadas seguintes continuam a lista de onde a anterior parou. */
  termsFrom?: number;
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
  /**
   * COR JUNTA (filamento/resina, chave por campos): este catálogo do ML é o MESMO produto de outro (cor/GTIN diferente). Não cria master:
   * a oferta-placeholder dele entra no master indicado. 'planned' = master que este mesmo plano cria (catalogId); 'existing' = master do banco (id).
   */
  mergeInto?: { kind: 'planned' | 'existing'; ref: string; name: string };
  /** Nome do MASTER (cor junta): título do catálogo sem a cor. Ausente => usa `name`. A oferta mantém o título original do catálogo. */
  masterName?: string;
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
  reviews: Array<{ catalogId: string; name: string; reason: string; missing: string[]; domainId: string | null; relatedCatalogId?: string }>;
  errors: string[];
  stoppedBecause: string | null;
  /** Chamadas acumuladas do cliente ao fim deste segmento. */
  callsUsed: number;
  /** Chamadas gastas SO neste segmento. */
  callsSpent: number;
  /** Paginas de busca pedidas e motivo de parada por termo. */
  pagesFetched: number;
  termStops: Record<string, string>;
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
  const from = Math.max(0, opts.termsFrom ?? 0);
  const terms = seg.terms.slice(from, from + (opts.termsLimit ?? seg.terms.length));
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
    callsSpent: 0,
    pagesFetched: 0,
    termStops: {},
  };
  const startUsed = client.used();
  const seenCatalogs = new Set<string>();
  const skip = (p: MlCatalogPayload, reason: string, detail: string | null = null) => {
    bump(report.counts, reason);
    report.skips.push({ catalogId: p.id, name: p.name ?? '', reason, detail });
  };

  /** Processa um candidato da busca. Devolve true para PARAR tudo (teto de criacao / de chamadas). */
  const processCandidate = async (searchPayload: MlCatalogPayload, term: string): Promise<boolean> => {
        if (!searchPayload?.id || seenCatalogs.has(searchPayload.id)) return false;
        seenCatalogs.add(searchPayload.id);
        if (report.plans.filter((p) => !p.mergeInto).length >= maxCreate) {
          report.stoppedBecause = 'teto_de_criacao';
          return true;
        }

        // 1) Identidade na resposta da busca (0 chamadas).
        const idSearch = evaluateIdentity(searchPayload, seg);
        if (idSearch.status === 'off_domain') {
          skip(searchPayload, 'dominio_fora_do_segmento', searchPayload.domain_id ?? null);
          return false;
        }
        if (idSearch.status === 'rejected') {
          skip(searchPayload, 'rejeitado_' + idSearch.reason, idSearch.matched);
          return false;
        }
        if (idSearch.status === 'review') {
          bump(report.counts, 'revisao_sem_identidade_forte');
          report.reviews.push({ catalogId: searchPayload.id, name: searchPayload.name ?? '', reason: idSearch.reason, missing: idSearch.missing, domainId: searchPayload.domain_id ?? null });
          return false;
        }

        // 2) Duplicata ANTES de gastar chamadas (0 chamadas de API).
        let mergeInto: SeedPlanEntry['mergeInto'];
        const dup = await findDuplicate(lookup, report.plans, searchPayload.id, idSearch, searchPayload.name ?? '', idSearch.byFields === true);
        if (dup && !dup.merge) {
          skip(searchPayload, dup.reason, `${dup.master.id} ${dup.master.name}`);
          return false;
        }
        if (dup?.merge) mergeInto = { kind: dup.merge, ref: dup.master.id, name: dup.master.name };

        // 2b) Cache negativo: catalogo que ja deu 404 nos ultimos dias nao gasta chamada de novo.
        if (opts.isKnownNotFound?.(searchPayload.id)) {
          skip(searchPayload, 'sem_vendedor_404_cache');
          return false;
        }

        // 3) /items primeiro: 70% dos catálogos medidos não têm vendedor (404 "No winners found"); descarta sem retentar.
        if (client.remaining() < 2) {
          report.stoppedBecause = 'teto_de_chamadas';
          return true;
        }
        const it = await client.get(`/products/${searchPayload.id}/items?limit=100`);
        if (it.status === 404) {
          opts.onNotFound?.(searchPayload.id);
          skip(searchPayload, 'sem_vendedor_404');
          return false;
        }
        if (it.status !== 200 && it.status !== 206) {
          report.errors.push(`items ${searchPayload.id} HTTP ${it.status}`);
          bump(report.counts, 'erro_items');
          return false;
        }
        let page;
        try {
          page = parseMeliCatalogPage(it.json, 0);
        } catch (e) {
          report.errors.push(`items ${searchPayload.id}: ${(e as Error).message}`);
          bump(report.counts, 'erro_items');
          return false;
        }
        if (page.items.length === 0) {
          skip(searchPayload, 'sem_anuncio_novo', `brutos=${page.rawIds.length}`);
          return false;
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
          return false;
        }
        if (identity.key !== idSearch.key) {
          const dup2 = await findDuplicate(lookup, report.plans, merged.id, identity, merged.name ?? '', identity.byFields === true);
          if (dup2 && !dup2.merge) {
            skip(merged, dup2.reason, `${dup2.master.id} ${dup2.master.name}`);
            return false;
          }
          mergeInto = dup2?.merge ? { kind: dup2.merge, ref: dup2.master.id, name: dup2.master.name } : undefined;
        }

        const attributesSnapshot: Record<string, string | null> = {};
        for (const id of SNAPSHOT_ATTRS) {
          const a = (merged.attributes ?? []).find((x) => x?.id === id);
          const v = (a?.value_name ?? a?.values?.[0]?.name ?? '').toString().trim();
          if (v) attributesSnapshot[id] = v;
        }

        // 4b) Variante de cor do MESMO modelo (regra do dono: cor junta, exceto tênis). GTINs diferentes por cor não
        // criam masters irmãos: o irmão vai para revisão apontando o primeiro. A junção em um master só com decisão do dono.
        if (seg.profile.strategy !== 'review_only' && identity.byFields !== true) {
          const sib = findColorSibling(report.plans, seg, merged.name ?? '', attributesSnapshot);
          if (sib) {
            bump(report.counts, 'revisao_variante_de_cor');
            report.reviews.push({ catalogId: merged.id, name: merged.name ?? '', reason: 'variante_de_cor_do_mesmo_modelo', missing: [], domainId: merged.domain_id ?? null, relatedCatalogId: sib.catalogId });
            return false;
          }
        }

        // 5) Porteiro do departamento (evidência positiva).
        const verdict = gate.evaluate({ segment: seg.key, name: merged.name ?? '', domainId: merged.domain_id ?? null, identity });
        if (verdict.verdict === 'rejected') {
          skip(merged, 'porteiro_rejeitou_' + verdict.reason, verdict.matched);
          return false;
        }

        const prices = page.items.map((i) => i.priceCents);
        const cheapest = page.items.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
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
          ...(mergeInto ? { mergeInto } : {}),
          ...(identity.byFields ? { masterName: stripColors(merged.name ?? '', attributesSnapshot.COLOR) } : {}),
        });
        bump(report.counts, mergeInto ? 'planejado_anexar_cor_junta' : 'planejado_criar');
        log(`planejado${mergeInto ? ' (ANEXA ao master ' + mergeInto.name + ')' : ''}: ${merged.id} | ${merged.name} | ${identity.key} | ${page.items.length} anúncios novos`);
        return false;
  };

  try {
    const pages = Math.max(1, opts.pages ?? 1);
    const active = new Set(terms);
    const baseOffset = opts.offset ?? 0;
    outer: for (let pageIdx = 0; pageIdx < pages && active.size > 0; pageIdx++) {
      for (const term of terms) {
        if (!active.has(term)) continue;
        if (opts.shouldStop?.()) {
          report.stoppedBecause = 'interrompido';
          break outer;
        }
        const offset = baseOffset + pageIdx * pageLimit;
        const r = await client.get(searchPath(term, pageLimit, offset, opts.useSearchDomain ? seg.searchDomain : null));
        report.termsSearched++;
        report.pagesFetched++;
        if (r.status !== 200 || !Array.isArray(r.json?.results)) {
          report.errors.push(`busca "${term}" offset ${offset} HTTP ${r.status}`);
          bump(report.counts, 'erro_busca');
          active.delete(term);
          report.termStops[term] = `erro_http_${r.status}`;
          continue;
        }
        const results: MlCatalogPayload[] = r.json.results;
        report.searchResults += results.length;
        const verdict = pagingDecision({
          returned: results.length,
          limit: pageLimit,
          offset,
          total: typeof r.json?.paging?.total === 'number' ? r.json.paging.total : null,
          inDomain: results.filter((x) => domainMatches(seg, x?.domain_id)).length,
          fresh: results.filter((x) => x?.id && !seenCatalogs.has(x.id)).length,
        });
        if (!verdict.next) {
          active.delete(term);
          report.termStops[term] = `${verdict.reason}@pagina${pageIdx + 1}`;
        }
        for (const searchPayload of results) {
          if (opts.shouldStop?.()) {
            report.stoppedBecause = 'interrompido';
            break outer;
          }
          if (await processCandidate(searchPayload, term)) break outer;
        }
      }
    }
  } catch (e) {
    if (e instanceof DailyBudgetExceeded) report.stoppedBecause = 'teto_diario';
    else if (e instanceof CallBudgetExceeded) report.stoppedBecause = 'teto_de_chamadas';
    else if (e instanceof RateLimited) report.stoppedBecause = 'http_429';
    else throw e;
  }
  report.callsUsed = client.used();
  report.callsSpent = client.used() - startUsed;
  return report;
}

/**
 * Já há, neste plano, um master do MESMO modelo em outra cor? Mesmo título sem palavras de cor E mesmos atributos que
 * separam variantes (MODEL, ALPHANUMERIC_MODEL, VOLTAGE, capacidade, VERSION...; a cor é a única diferença).
 * Atributo presente de um lado e ausente do outro => não é irmão (na dúvida, não junta).
 */
function findColorSibling(planned: SeedPlanEntry[], seg: SegmentConfig, name: string, attrs: Record<string, string | null>): SeedPlanEntry | null {
  const ck = colorlessTitleKey(name);
  if (!ck) return null;
  const ids = ['MODEL', ...seg.profile.fallbackAttrs, ...seg.profile.keyExtras].filter((id, i, a) => id !== 'COLOR' && a.indexOf(id) === i);
  for (const p of planned) {
    if (p.segment !== seg.key || colorlessTitleKey(p.name) !== ck) continue;
    if (ids.every((id) => (p.attributesSnapshot[id] ?? null) === (attrs[id] ?? null))) return p;
  }
  return null;
}

async function findDuplicate(
  lookup: ExistingLookup,
  planned: SeedPlanEntry[],
  catalogId: string,
  identity: IdentityResult,
  name: string,
  mergeable = false
): Promise<{ reason: string; master: { id: string; name: string }; merge?: 'planned' | 'existing' } | null> {
  // Dentro da mesma execução: dois catálogos da mesma chave/GTIN/título não viram dois masters.
  const tkPlanned = normalizeTitleKey(name);
  for (const p of planned) {
    if (p.identity.key && p.identity.key === identity.key) {
      // Cor junta: mesma chave por campos => mesmo produto; o catálogo novo anexa a oferta ao master planejado (nunca cria outro).
      if (mergeable && !p.mergeInto) return { reason: 'cor_junta_planejado', master: { id: p.catalogId, name: p.name }, merge: 'planned' };
      if (mergeable && p.mergeInto) return { reason: 'cor_junta_planejado', master: { id: p.mergeInto.ref, name: p.mergeInto.name }, merge: p.mergeInto.kind };
      return { reason: 'ja_planejado_chave_identidade', master: { id: p.catalogId, name: p.name } };
    }
    if (identity.gtins.some((g) => p.identity.gtins.includes(g))) return { reason: 'ja_planejado_gtin', master: { id: p.catalogId, name: p.name } };
    if (tkPlanned && normalizeTitleKey(p.name) === tkPlanned) return { reason: 'ja_planejado_titulo_conferir', master: { id: p.catalogId, name: p.name } };
  }
  const byCat = await lookup.byCatalogId(catalogId);
  if (byCat) return { reason: 'ja_existe_catalogo_ml', master: byCat };
  if (mergeable && identity.key) {
    const byKeyMerge = await lookup.byIdentityKey(identity.key);
    if (byKeyMerge) return { reason: 'cor_junta_existente', master: byKeyMerge, merge: 'existing' };
  }
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

import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, or, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
import { GAMES } from '@/lib/catalog/verticais';
import { getPriceSource, listOperationalSourceSlugs } from './price-sources';
import type { PriceSnapshotResult } from './price-sources';
import { recordPriceSnapshot } from './record-price-snapshot';
import { evaluateOfferIdentity, type OfferIdentityResult } from '@/lib/affiliate/offer-identity';
import { upsertSellerFromOffer } from './sources/mercado-livre-seller';
import { slugify } from '@/lib/slugify';
import { pickCatalogPlaceholder } from '@/lib/affiliate/catalog-placeholder';
import { mapWithConcurrency } from '@/lib/concurrency';
import {
  collapseBySeller,
  consolidateMasterResults,
  createCallBudget,
  createCatalogFetcher,
  decideMasterExpiry,
  fetchCatalogAllPages,
  fetchMasterCatalogs,
  groupDueOffers,
  masterCallCap,
  withExemptRetry,
  sanitizeErrorForSummary,
  CATALOG_ALARM_TOTAL,
  type CatalogFetchFn,
  type CatalogOutcome,
  type MasterTarget,
} from '@/lib/affiliate/master-consolidation';
import { getMasterGroupingScope, shouldGroupByMaster } from '@/lib/affiliate/master-grouping-config';
import { NOOP_RUN, collectorRunsEnabled, startCollectorRun, type CollectorRunHandle } from './collector-runs';
import './sources'; // registra os adapters disponíveis (efeito colateral do import)

/**
 * Depois de N checagens SEGUIDAS sem achar nenhum vendedor ativo pro
 * catalog_product_id, marca a(s) oferta(s) como 'expired' — achado real
 * (2026-07-30): antes disso, uma oferta sem vendedor nenhum ficava 'active'
 * pra sempre, preço congelado na tela, disputando espaço na fila de coleta
 * com ofertas que ainda estão vivas de verdade. 3 tentativas (~45min-3h
 * dependendo do intervalo de refresh) dá margem pra não expirar por causa
 * de uma falha passageira da API.
 */
const MAX_CONSECUTIVE_MISSES = 3;

/** Intervalo mínimo entre coletas — catálogo geral. */
const REFRESH_INTERVAL = sql`interval '15 minutes'`;
/** Intervalo mínimo entre coletas — jogos com pelo menos um cliente acompanhando (dado "quente"). */
const WATCHED_REFRESH_INTERVAL = sql`interval '5 minutes'`;
/**
 * Protege contra timeout se o backlog crescer — o que sobrar pega no próximo
 * tick do cron (a cada 5min). Achado real (2026-07-29): com 40/execução e
 * ~11.700 ofertas ativas vencidas pro refresh, mais de 88% delas nunca
 * recebiam um segundo preço — o teto era tão menor que o catálogo que a
 * maioria das ofertas nunca era alcançada de fato (gráfico de preço vazio
 * pro cliente, "menor preço"/"média" praticamente congelados). Subido pra
 * 150 (mesma concorrência de 4 grupos por vez, ver GROUP_CONCURRENCY) —
 * ainda cabe com folga dentro do maxDuration=250s do plano Pro da Vercel.
 */
const MAX_OFFERS_PER_RUN = 150;

const isWatchedExpr = sql`EXISTS (
  SELECT 1 FROM affiliate_price_watches w
  WHERE w.master_product_id = ${affiliateOffers.masterProductId} AND w.is_active = true
)`;

/** Ofertas devidas para coleta (mesma condicao usada na selecao e na medicao de backlog da observabilidade). */
function dueWhere(operationalSlugs: string[]) {
  return and(
        // Isolamento por departamento (ADR 0008): o coletor GAMER só enfileira oferta Games; oferta de outra
        // vertical tem fila/cron/teto próprios (collect-vertical) e não consome os MAX_OFFERS_PER_RUN slots daqui.
        eq(affiliateOffers.vertical, GAMES),
        // 'draft' entra aqui de propósito: publicação e rastreamento de preço
        // são decisões independentes — mesmo uma oferta ainda não publicada
        // (ex: rascunho criado manualmente pelo admin) já acumula histórico.
        // Descoberta automática hoje já entra direto como 'active' (ver
        // discover-products.ts), então 'draft' aqui cobre principalmente o
        // fluxo manual do admin.
        inArray(affiliateOffers.status, ['active', 'draft']),
        // Só redes com coleta oficial operacional (EG-03): stubs (Shopee,
        // Amazon, AliExpress) sempre lançam erro e, sem renovar o carimbo,
        // ficariam no topo da fila e starvariam o Mercado Livre.
        inArray(affiliateNetworks.slug, operationalSlugs),
        isNotNull(affiliateOffers.externalRef),
        or(
          isNull(affiliateOffers.lastCheckedAt),
          lt(
            affiliateOffers.lastCheckedAt,
            sql`now() - CASE WHEN ${isWatchedExpr} THEN ${WATCHED_REFRESH_INTERVAL} ELSE ${REFRESH_INTERVAL} END`
          )
        )
      );
}

export interface CollectPricesSummary {
  checked: number;
  /** Preços gravados (soma de todos os vendedores retornados, não só 1 por oferta). */
  updated: number;
  /** Ofertas novas criadas pra vendedor até então não rastreado no mesmo produto/rede. */
  offersCreated: number;
  skippedNoSource: number;
  skippedNoOffer: number;
  errors: { externalRef: string; message: string }[];
  /**
   * Rechecagem de identidade (decisões do dono, 2026-11-03): anúncios cujo TÍTULO ORIGINAL do vendedor
   * diverge do master (ou é Open Box/usado/cross-gen) NÃO foram ligados como 'active': ficam 'draft'
   * (fora de média, mediana, menor preço e vitrine) até conferência humana. Cada item guarda o título
   * original, porque o schema atual não tem coluna para ele (ver proposta de migration no ADR 0006).
   */
  identityReview: IdentityReviewEntry[];
  /**
   * Presente SOMENTE com COLLECT_MASTER_GROUPING=1 (coleta por master, ata 2026-11-06). Ausente com a flag desligada,
   * para o retorno ficar idêntico ao anterior.
   */
  masterGrouping?: MasterGroupingStats;
}

export interface MasterGroupingStats {
  scope: 'lista' | 'todos' | 'vazio';
  /** Masters que entraram na coleta por master neste ciclo. */
  mastersProcessed: number;
  /** Chamadas reais a /products/{id}/items feitas pelos masters agrupados (já descontado o cache do ciclo). */
  catalogApiCalls: number;
  /** Chamadas que o agrupamento LEGADO faria para as mesmas ofertas devidas (linha de base). */
  baselineCatalogCalls: number;
  /** Teto de chamadas do ciclo para os masters agrupados (linha de base + 10%). */
  catalogCallCap: number;
  /** Masters adiados por não caberem no teto de chamadas; ficam devidos para o próximo tick. */
  mastersDeferredByBudget: number;
  /** Masters com falha parcial: nada gravado nem expirado, carimbo não renovado. */
  mastersPartialFailure: number;
  /** Destes, quantos pararam porque o orçamento de chamadas (custo = páginas) acabou no meio de um catálogo. */
  mastersPartialByBudget: number;
  /**
   * ALARME (mede sem custo extra): catálogos cujo paging.total passou de 100, isto é, que precisam de 2+ páginas.
   * Lista por catálogo, sem repetição no ciclo. Fica no summary para medir a frequência real da paginação.
   */
  catalogosAcimaDe100: { externalRef: string; total: number }[];
  /** Falhas de paginação do ciclo (lista incompleta, paging ausente/inconsistente, teto de páginas, página caída). */
  paginationFailures: { externalRef: string; kind: string }[];
  /**
   * Catálogos que responderam 200 bem formado com results vazio e SEM paging, tratados como catálogo vazio. Caso NÃO
   * medido na API real: fica contado para visibilidade (se virar frequente, investigar).
   */
  catalogosVaziosSemPaging: { externalRef: string }[];
  /**
   * ESTIMATIVA (ceil(anúncios da página / 20)) das chamadas do multiget de títulos /items?ids= feitas por fetchSellerTitles.
   * NÃO entram no teto de chamadas (subestimação conhecida, igual ao legado); contadas à parte só para dimensionar.
   */
  titleMultigetCallsEstimated: number;
}

export interface IdentityReviewEntry {
  offerId: string;
  externalItemId: string;
  sellerTitle: string;
  masterProductId: string;
  masterName: string;
  reason: string;
  /** Status da oferta antes da coleta ('new' = oferta criada agora). */
  previousStatus: string;
}

interface OfferGroup {
  networkId: string;
  networkSlug: string;
  externalRef: string;
  masterProductId: string;
  offerIds: string[];
}

/**
 * Roda uma passada de coleta: pega ofertas ativas com external_ref cadastrado
 * e vencidas pro refresh, busca preço atual via o PriceSource da rede, grava
 * o snapshot (source: 'api') e marca last_checked_at SÓ quando a consulta à
 * fonte teve sucesso (EG-03). Falha (exceção) não renova o carimbo: a oferta
 * continua 'não verificada' e volta ao topo da fila no próximo tick.
 *
 * Agrupa por (network_id, external_ref) antes de consultar a fonte: no
 * Mercado Livre, o mesmo catalog_product_id pode ter várias affiliate_offers
 * (uma por vendedor concorrente) — sem agrupar, a mesma chamada de API
 * seria feita várias vezes por execução, uma pra cada oferta irmã. Cada
 * resultado devolvido pela fonte vira uma oferta própria: se já existe uma
 * affiliate_offer pra aquele (produto, rede, vendedor), atualiza; senão,
 * cria já publicada ('active', mesma regra de discover-products.ts — decisão
 * explícita do usuário de priorizar vitrine sempre cheia sobre garantir link
 * de afiliado real em 100% dos itens desde o primeiro instante).
 */
export async function collectPrices(): Promise<CollectPricesSummary> {
  const operationalSlugs = listOperationalSourceSlugs();
  if (operationalSlugs.length === 0) {
    return { checked: 0, updated: 0, offersCreated: 0, skippedNoSource: 0, skippedNoOffer: 0, errors: [], identityReview: [] };
  }
  const dueOffers = await db
    .select({
      id: affiliateOffers.id,
      externalRef: affiliateOffers.externalRef,
      networkId: affiliateOffers.networkId,
      networkSlug: affiliateNetworks.slug,
      masterProductId: affiliateOffers.masterProductId,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(dueWhere(operationalSlugs))
    .orderBy(sql`${isWatchedExpr} DESC`, sql`${affiliateOffers.lastCheckedAt} ASC NULLS FIRST`)
    .limit(MAX_OFFERS_PER_RUN);

  const summary: CollectPricesSummary = {
    checked: dueOffers.length,
    updated: 0,
    offersCreated: 0,
    skippedNoSource: 0,
    skippedNoOffer: 0,
    errors: [],
    identityReview: [],
  };

  // Observabilidade (flag COLLECTOR_RUNS=1; no-op sem a flag): uma execucao registrada por rede operacional.
  const runs = await startRuns(operationalSlugs, dueOffers);

  // Flag COLLECT_MASTER_GROUPING (desligada por padrão): masters-piloto são coletados por (rede, master); todo o
  // resto segue EXATAMENTE como antes, agrupado por (rede, catálogo). Com a flag desligada `masterTargets` é vazio e
  // `catalogGroups` é idêntico ao agrupamento original (provado em scripts/test-collector-multicatalog.ts).
  const scope = getMasterGroupingScope();
  const { catalogGroups, masterTargets, masterBaselineCalls } = groupDueOffers(dueOffers, (masterId) =>
    shouldGroupByMaster(masterId, scope)
  );
  const masterStats: MasterGroupingStats | null = scope.enabled
    ? {
        scope: scope.all ? 'todos' : scope.masterIds.size > 0 ? 'lista' : 'vazio',
        mastersProcessed: 0,
        catalogApiCalls: 0,
        baselineCatalogCalls: masterBaselineCalls,
        catalogCallCap: masterCallCap(masterBaselineCalls),
        mastersDeferredByBudget: 0,
        mastersPartialFailure: 0,
        mastersPartialByBudget: 0,
        catalogosAcimaDe100: [],
        paginationFailures: [],
        catalogosVaziosSemPaging: [],
        titleMultigetCallsEstimated: 0,
      }
    : null;
  if (masterStats) summary.masterGrouping = masterStats;
  const callBudget = createCallBudget(masterCallCap(masterBaselineCalls));
  // Master isento do teto eleito ANTES da corrida entre os slots concorrentes (determinístico: o 1º alvo da fila, que já
  // vem ordenado por urgência), em vez de depender de quem chega primeiro ao orçamento depois de um await.
  if (masterTargets.length > 0) callBudget.setExempt(masterTargets[0].masterProductId);
  // Cache de respostas de catálogo POR CICLO (só usado pelo caminho por master): dois masters que dividem um catálogo
  // chamam a API uma vez só. Falha não fica em cache.
  // Caminho por master PAGINA o catálogo (limit=100, offset crescente) e só devolve a lista COMPLETA ou falha; cada
  // página/retry é cobrada do orçamento do master que disparou a busca (o 2º master que divide o catálogo pega do cache).
  const catalogFetchers = new Map<string, CatalogFetchFn<PriceSnapshotResult, string>>();
  const fetcherFor = (networkSlug: string) => {
    let f = catalogFetchers.get(networkSlug);
    if (!f) {
      const source = getPriceSource(networkSlug)!;
      f = createCatalogFetcher<PriceSnapshotResult, string>(async (externalRef, owner = '') => {
        const fetchPage = source.fetchCatalogPage?.bind(source);
        if (!fetchPage) {
          // Falha fechada: sem paginação não dá para afirmar que a lista está completa (nada gravado, nada expirado).
          throw new Error(`fonte ${networkSlug} sem fetchCatalogPage: coleta por master exige paginação`);
        }
        const result = await fetchCatalogAllPages(
          externalRef,
          async (ref, offset, limit) => {
            if (masterStats) masterStats.catalogApiCalls++;
            const page = await fetchPage(ref, offset, limit);
            if (masterStats) masterStats.titleMultigetCallsEstimated += Math.ceil(page.items.length / 20);
            const total = page.paging?.total;
            if (masterStats && typeof total === 'number' && total > CATALOG_ALARM_TOTAL && !masterStats.catalogosAcimaDe100.some((c) => c.externalRef === ref)) {
              masterStats.catalogosAcimaDe100.push({ externalRef: ref, total });
            }
            return page;
          },
          { charge: () => callBudget.tryCharge(owner) }
        );
        if (masterStats && result.emptyWithoutPaging) masterStats.catalogosVaziosSemPaging.push({ externalRef });
        return result.items;
      });
      catalogFetchers.set(networkSlug, f);
    }
    return f;
  };

  /**
   * Coleta por (rede, master) — SÓ com COLLECT_MASTER_GROUPING (ata 2026-11-06). Resolve TODOS os catálogos ativos do
   * master em sequência, consolida (menor anúncio por vendedor entre catálogos) e aplica uma vez. Tudo ou nada: se um
   * catálogo falha (após 1 retry), nada é gravado, nada expira e o carimbo não é renovado (o master segue devido).
   */
  const processMasterTarget = async (target: MasterTarget): Promise<void> => {
    const source = getPriceSource(target.networkSlug);
    if (!source) {
      summary.skippedNoSource += target.dueOfferIds.length;
      return;
    }
    const run = runs.get(target.networkSlug) ?? NOOP_RUN;
    try {
      // Todas as ofertas ativas/rascunho do master na rede (as devidas e as irmãs), com o catálogo de cada uma.
      const rows = await db
        .select({
          id: affiliateOffers.id,
          externalRef: affiliateOffers.externalRef,
          sellerId: affiliateOffers.sellerId,
        })
        .from(affiliateOffers)
        .where(
          and(
            eq(affiliateOffers.masterProductId, target.masterProductId),
            eq(affiliateOffers.networkId, target.networkId),
            inArray(affiliateOffers.status, ['active', 'draft']),
            isNotNull(affiliateOffers.externalRef)
          )
        );
      if (rows.length === 0) return;
      const refs = Array.from(new Set(rows.map((r) => r.externalRef!))).sort();
      // Teto de chamadas por ciclo (+10% da linha de base); custo = PÁGINAS (cada página/retry é cobrada antes da chamada
      // em fetcherFor). Aqui só a admissão: precisa haver folga para ao menos 1 página por catálogo. Adiado = não
      // carimba, continua devido no próximo tick. Se o orçamento acabar no meio de um catálogo = falha parcial do master.
      if (!callBudget.admit(target.masterProductId, refs.length)) {
        if (masterStats) masterStats.mastersDeferredByBudget++;
        return;
      }
      if (masterStats) masterStats.mastersProcessed++;
      const group: OfferGroup = {
        networkId: target.networkId,
        networkSlug: target.networkSlug,
        externalRef: refs[0],
        masterProductId: target.masterProductId,
        offerIds: rows.map((r) => r.id),
      };

      // retries: 0 porque o retry (1x) já é por PÁGINA dentro de fetchCatalogAllPages; repetir o catálogo inteiro gastaria cota.
      // O master isento que herdar falha por orçamento de outro master (promessa em cache) refaz a busca com isenção.
      const catalogFetcher = withExemptRetry(fetcherFor(target.networkSlug), (owner) => callBudget.isExempt(owner));
      const fetched = await fetchMasterCatalogs(refs, (ref) => catalogFetcher(ref, target.masterProductId), { retries: 0 });
      const attempted = fetched.outcomes.filter((o) => o.status !== 'skipped');
      run.counters.queries += attempted.length;
      if (!fetched.complete) {
        // Falha parcial: NADA gravado, NADA expirado, carimbo NÃO renovado (EG-03).
        if (masterStats) masterStats.mastersPartialFailure++;
        for (const f of fetched.outcomes.filter((o) => o.status === 'failed')) {
          if (masterStats && f.errorKind) masterStats.paginationFailures.push({ externalRef: f.externalRef, kind: f.errorKind });
          if (f.errorKind === 'orcamento') {
            // Orçamento esgotado no meio do catálogo: não é erro da API, é adiamento (o master segue devido).
            if (masterStats) masterStats.mastersPartialByBudget++;
            continue;
          }
          const message = f.error ?? 'falha ao consultar catálogo';
          summary.errors.push({ externalRef: f.externalRef, message: `master ${target.masterProductId}: ${message}` });
          run.addError(message);
        }
        return;
      }
      run.counters.checked += attempted.length;
      run.counters.misses += fetched.outcomes.filter((o) => o.results.length === 0).length;
      const flat = fetched.outcomes.flatMap((o) => o.results);

      if (flat.length === 0) {
        // Todos os catálogos responderam OK e vazios: mesma regra do coletor atual (carimbo + contador de faltas).
        await stampChecked(group.offerIds);
        summary.skippedNoOffer += group.offerIds.length;
        await registerMiss(group.offerIds);
        return;
      }

      const { updated, created, reviewed, pricedOfferIds, snapshotsWritten } = await applySnapshotsToGroup(group, flat, {
        outcomes: fetched.outcomes,
        offers: rows.map((r) => ({ id: r.id, sellerId: r.sellerId })),
      });
      summary.updated += updated;
      summary.offersCreated += created;
      run.counters.offersCreated += created;
      run.counters.snapshotsWritten += snapshotsWritten;
      await run.confirmPrices(pricedOfferIds);
      if (reviewed.length > 0) {
        summary.identityReview.push(...reviewed);
        console.warn('[identidade] ofertas em revisão (fora dos indicadores):', JSON.stringify(reviewed));
      }
      await stampChecked(group.offerIds);
    } catch (err) {
      // Texto do erro pode embutir corpo de resposta de auth: sem credencial e no máximo ~200 caracteres (só neste caminho).
      const safeMessage = sanitizeErrorForSummary((err as Error).message);
      summary.errors.push({ externalRef: `master:${target.masterProductId}`, message: safeMessage });
      run.addError(safeMessage);
    } finally {
      callBudget.release(target.masterProductId); // devolve a reserva de admissão não usada
    }
  };

  // Cada grupo = 1 chamada de API externa (I/O, não CPU) — processar em
  // paralelo é o que faz a rota caber no maxDuration com mais ofertas por
  // execução. Concorrência 4: deixa folga no pool de conexão do banco
  // (max:5) pro trabalho de escrita (snapshot + upsert de vendedor) de cada grupo.
  const GROUP_CONCURRENCY = 4;
  const processCatalogGroup = async (group: OfferGroup): Promise<void> => {
    const source = getPriceSource(group.networkSlug);
    if (!source) {
      summary.skippedNoSource += group.offerIds.length;
      return;
    }
    const run = runs.get(group.networkSlug) ?? NOOP_RUN;
    run.counters.queries++;

    try {
      const results = await source.fetchSnapshots(group.externalRef);
      run.counters.checked++;
      if (results.length === 0) {
        run.counters.misses++;
        // Resposta bem-sucedida da API dizendo "sem vendedor ativo": é uma
        // checagem real, então o carimbo é renovado (diferente de exceção).
        await stampChecked(group.offerIds);
        summary.skippedNoOffer += group.offerIds.length;
        // Incrementa a sequência de falhas e expira quem já bateu o teto —
        // numa query só (evita ler o valor antes pra decidir o que fazer).
        await registerMiss(group.offerIds);
        return;
      }

      const { updated, created, reviewed, pricedOfferIds, snapshotsWritten } = await applySnapshotsToGroup(group, results);
      summary.updated += updated;
      summary.offersCreated += created;
      run.counters.offersCreated += created;
      run.counters.snapshotsWritten += snapshotsWritten;
      // last_price_confirmed_at: SO as ofertas em que a API devolveu preco (nunca o stampChecked do grupo inteiro).
      await run.confirmPrices(pricedOfferIds);
      if (reviewed.length > 0) {
        summary.identityReview.push(...reviewed);
        console.warn('[identidade] ofertas em revisão (fora dos indicadores):', JSON.stringify(reviewed));
      }
      // Só chega aqui se a fonte respondeu e os snapshots foram aplicados.
      await stampChecked(group.offerIds);
    } catch (err) {
      // Sem finally: falha NÃO grava last_checked_at (EG-03).
      summary.errors.push({ externalRef: group.externalRef, message: (err as Error).message });
      run.addError((err as Error).message);
    }
  };

  const tasks: Array<() => Promise<void>> = [
    ...catalogGroups.map((group) => () => processCatalogGroup(group)),
    ...masterTargets.map((target) => () => processMasterTarget(target)),
  ];
  await mapWithConcurrency(tasks, GROUP_CONCURRENCY, (task) => task());

  for (const run of runs.values()) {
    await run.finish({ meta: { errorSamples: summary.errors.slice(0, 3).map((e) => e.message.slice(0, 160)) } });
  }

  return summary;
}

/**
 * Abre uma execucao por rede (so com COLLECTOR_RUNS=1) e mede o backlog ANTES do teto por execucao: quantas ofertas
 * estao devidas e a idade da checagem da mais velha. Falha aqui (ex.: tabela ainda nao criada) nunca afeta a coleta.
 */
async function startRuns(
  operationalSlugs: string[],
  dueOffers: { networkSlug: string }[]
): Promise<Map<string, CollectorRunHandle>> {
  const runs = new Map<string, CollectorRunHandle>();
  const backlog = new Map<string, { total: number; oldestS: number | null }>();
  try {
    if (collectorRunsEnabled()) {
      const rows = await db
        .select({
          slug: affiliateNetworks.slug,
          total: sql<number>`count(*)::int`,
          oldest: sql<number | null>`max(extract(epoch from now() - coalesce(${affiliateOffers.lastCheckedAt}, ${affiliateOffers.createdAt})))::int`,
        })
        .from(affiliateOffers)
        .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
        .where(dueWhere(operationalSlugs))
        .groupBy(affiliateNetworks.slug);
      for (const r of rows) backlog.set(r.slug, { total: r.total, oldestS: r.oldest });
    }
  } catch (err) {
    console.error('[collector-runs] backlog falhou (ignorado):', err instanceof Error ? err.message : err);
  }
  for (const slug of operationalSlugs) {
    const b = backlog.get(slug);
    const run = await startCollectorRun('collect-prices', slug, {
      selected: dueOffers.filter((o) => o.networkSlug === slug).length,
      dueTotal: b?.total ?? 0,
      oldestDueAgeS: b?.oldestS ?? null,
    });
    runs.set(slug, run);
  }
  return runs;
}

/**
 * collapseBySeller foi extraída SEM alteração para src/lib/affiliate/master-consolidation.ts (função pura, usada
 * também pela coleta por master). A identidade da oferta no banco é (produto, rede, vendedor): quando o MESMO vendedor
 * tem 2+ anúncios, o vendedor é representado pelo mais barato (desempate: item id).
 */

/** Incrementa a sequência de faltas e expira quem já bateu o teto (MAX_CONSECUTIVE_MISSES), numa query só. */
async function registerMiss(offerIds: string[]): Promise<void> {
  if (offerIds.length === 0) return;
  await db.execute(sql`
    UPDATE affiliate_offers
    SET consecutive_miss_count = consecutive_miss_count + 1,
        status = CASE
          WHEN status = 'active' AND consecutive_miss_count + 1 >= ${MAX_CONSECUTIVE_MISSES}
          THEN 'expired'::affiliate_offer_status
          ELSE status
        END,
        updated_at = now()
    WHERE id IN (${sql.join(offerIds.map((id) => sql`${id}`), sql`, `)})
  `);
}

async function stampChecked(offerIds: string[]): Promise<void> {
  await db
    .update(affiliateOffers)
    .set({ lastCheckedAt: new Date() })
    .where(inArray(affiliateOffers.id, offerIds));
}

/**
 * Aplica os resultados (um por vendedor) de um grupo — atualiza a oferta
 * existente do vendedor se já rastreada, ou cria uma nova (sempre 'draft').
 */
async function applySnapshotsToGroup(
  group: OfferGroup,
  rawResults: PriceSnapshotResult[],
  /**
   * Presente SÓ na coleta por master (COLLECT_MASTER_GROUPING): resultados por catálogo e as ofertas do master.
   * Ausente = caminho legado, inalterado (placeholder do catálogo do grupo e expiração por `group.offerIds`).
   */
  master?: { outcomes: CatalogOutcome<PriceSnapshotResult>[]; offers: { id: string; sellerId: string | null }[] }
): Promise<{ updated: number; created: number; reviewed: IdentityReviewEntry[]; pricedOfferIds: string[]; snapshotsWritten: number }> {
  let masterCache: { name: string; productType: string; gameFormat: string; defaultImages: string[]; vertical: string } | null = null;
  const loadMaster = async () => {
    if (masterCache) return masterCache;
    const [row] = await db
      .select({ name: masterProducts.name, productType: masterProducts.productType, gameFormat: masterProducts.gameFormat, defaultImages: masterProducts.defaultImages, vertical: masterProducts.vertical })
      .from(masterProducts)
      .where(eq(masterProducts.id, group.masterProductId))
      .limit(1);
    masterCache = row
      ? { name: row.name, productType: row.productType, gameFormat: row.gameFormat, defaultImages: (row.defaultImages as unknown as string[]) ?? [], vertical: row.vertical }
      : { name: 'Produto', productType: 'game', gameFormat: 'unknown', defaultImages: [], vertical: GAMES };
    return masterCache;
  };

  // Rechecagem de identidade: título original do anúncio x master (só quando a fonte devolveu o título).
  const verdicts = new Map<string, OfferIdentityResult>();
  if (rawResults.some((r) => r.sellerTitle)) {
    const m = await loadMaster();
    for (const r of rawResults) {
      if (r.sellerTitle) verdicts.set(r.externalItemId, evaluateOfferIdentity(r.sellerTitle, { name: m.name, productType: m.productType, gameFormat: m.gameFormat }));
    }
  }
  const isExcluded = (r: PriceSnapshotResult) => verdicts.get(r.externalItemId)?.excluded === true;

  // Coleta por master: um resultado por vendedor = o MENOR anúncio dele entre TODOS os catálogos do master (preço real
  // observado, sem interpolar). Legado: colapso dentro do catálogo do grupo.
  const consolidated = master ? consolidateMasterResults(master.outcomes, verdicts) : null;
  const results: Array<PriceSnapshotResult & { catalogRef?: string }> = consolidated
    ? consolidated.sellers
    : collapseBySeller(rawResults, verdicts);
  let updated = 0;
  let created = 0;
  let snapshotsWritten = 0;
  const pricedOfferIds: string[] = [];
  const reviewed: IdentityReviewEntry[] = [];

  // O placeholder de catálogo criado por discover-products.ts (sellerId
  // nulo) nunca bate no filtro `eq(sellerId, ...)` abaixo — cada resultado
  // por vendedor sempre criava uma oferta IRMÃ nova em vez de atualizar esse
  // placeholder, que ficava com current_price_cents preso em 0 para sempre
  // (e por isso nunca aparecia nas listagens, que filtram price > 0).
  // Corrige aqui: mantém esse placeholder com o melhor preço encontrado
  // entre os vendedores, sem mexer no link nem no status dele. `sellerId
  // IS NULL` já identifica exclusivamente essa linha (não filtra por
  // affiliateLinkPending — isso é ortogonal a ter preço atualizado: um
  // placeholder pendente de link real ainda deve mostrar o preço correto,
  // só o botão de compra fica desabilitado até o link real ser colado).
  //
  // IMPORTANTE: passa por recordPriceSnapshot (não um .update() direto) —
  // achado real (2026-07-24): esse placeholder é escolhido como "melhor
  // oferta" do produto (getBestActiveOfferIdsForMasterProducts empata nele
  // sempre que seu preço bate com o do vendedor mais barato, que é o caso
  // aqui por construção) em boa parte das checagens, mas nunca tinha uma
  // linha própria em affiliate_price_snapshots — o preço "atual" exibido
  // pro cliente vinha desse placeholder, enquanto o gráfico (que só lê
  // affiliate_price_snapshots) nunca sabia que esse preço existiu.
  //
  // Colisão (2026-11-05, Mario vs. Donkey Kong): master com N catálogos ML tem N grupos mas 1 placeholder;
  // sem filtrar external_ref todos os grupos sobrescreviam o mesmo placeholder (preço alternava a cada ciclo).
  // Agora o placeholder é escolhido pelo external_ref do catálogo do grupo (pickCatalogPlaceholder). Grupo sem
  // placeholder próprio NÃO grava em placeholder alheio: o preço dele vive nas ofertas por vendedor abaixo.
  const placeholderCandidates = await db
    .select({ id: affiliateOffers.id, externalRef: affiliateOffers.externalRef })
    .from(affiliateOffers)
    .where(
      and(
        eq(affiliateOffers.masterProductId, group.masterProductId),
        eq(affiliateOffers.networkId, group.networkId),
        isNull(affiliateOffers.sellerId)
      )
    );
  // Coleta por master: o grupo não tem UM catálogo; cada placeholder é tratado pelo seu catálogo no bloco abaixo.
  const placeholderOffer = consolidated ? null : pickCatalogPlaceholder(placeholderCandidates, group.externalRef);

  // O placeholder do catálogo só recebe preço de anúncio com identidade ok (Open Box não vira "menor preço").
  const okResults = results.filter((r) => !isExcluded(r));
  if (placeholderOffer && okResults.length > 0) {
    const bestResult = okResults.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
    if (
      await recordPriceSnapshot({
        offerId: placeholderOffer.id,
        priceCents: bestResult.priceCents,
        listPriceCents: bestResult.listPriceCents,
        source: 'api',
      })
    ) {
      snapshotsWritten++;
    }
    pricedOfferIds.push(placeholderOffer.id); // a API devolveu preco para o placeholder (melhor entre os vendedores)
    await db
      .update(affiliateOffers)
      .set({ lastCheckedAt: new Date(), consecutiveMissCount: 0 })
      .where(eq(affiliateOffers.id, placeholderOffer.id));
  }

  // Coleta por master: cada placeholder recebe o melhor preço do SEU catálogo (mesma regra de pickCatalogPlaceholder,
  // correção de 05/11 preservada); placeholder cujo catálogo respondeu OK e vazio conta falta (igual ao coletor atual).
  if (consolidated) {
    const placeholderMissIds: string[] = [];
    for (const candidate of placeholderCandidates) {
      if (!candidate.externalRef) continue;
      const best = consolidated.bestByCatalog.get(candidate.externalRef);
      if (best) {
        if (
          await recordPriceSnapshot({
            offerId: candidate.id,
            priceCents: best.priceCents,
            listPriceCents: best.listPriceCents,
            source: 'api',
          })
        ) {
          snapshotsWritten++;
        }
        pricedOfferIds.push(candidate.id);
        await db
          .update(affiliateOffers)
          .set({ lastCheckedAt: new Date(), consecutiveMissCount: 0 })
          .where(eq(affiliateOffers.id, candidate.id));
      } else if (consolidated.emptyCatalogs.includes(candidate.externalRef)) {
        placeholderMissIds.push(candidate.id);
      }
    }
    await registerMiss(placeholderMissIds);
  }

  const updatedOfferIds = new Set<string>();
  let sellerUpsertFailed = false;

  for (const result of results) {
    let sellerId: string;
    try {
      sellerId = await upsertSellerFromOffer(group.networkId, result.externalSellerId);
    } catch (err) {
      console.error(`Falha ao atualizar vendedor ${result.externalSellerId} (${result.catalogRef ?? group.externalRef}):`, (err as Error).message);
      sellerUpsertFailed = true;
      continue;
    }

    const existingQuery = db
      .select({
        id: affiliateOffers.id,
        affiliateLinkPending: affiliateOffers.affiliateLinkPending,
        status: affiliateOffers.status,
      })
      .from(affiliateOffers)
      .where(
        and(
          eq(affiliateOffers.masterProductId, group.masterProductId),
          eq(affiliateOffers.networkId, group.networkId),
          eq(affiliateOffers.sellerId, sellerId)
        )
      );
    // Coleta por master: se o vendedor tem linhas duplicadas (master, rede, vendedor), prioriza a ativa/rascunho em vez
    // de uma expirada arbitrária (o legado não ordena; fica inalterado).
    const [existingOffer] = await (consolidated
      ? existingQuery
          .orderBy(
            sql`CASE ${affiliateOffers.status} WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END`,
            affiliateOffers.createdAt,
            affiliateOffers.id
          )
          .limit(1)
      : existingQuery.limit(1));

    const excluded = isExcluded(result);
    let offerId: string;
    let isNewOffer = false;
    let previousStatus = 'new';
    if (existingOffer) {
      offerId = existingOffer.id;
      previousStatus = existingOffer.status;
    } else {
      isNewOffer = true;
      const masterProduct = await loadMaster();

      const baseSlug = slugify(`${masterProduct.name}-${result.externalSellerId}`);
      const [collision] = await db
        .select({ id: affiliateOffers.id })
        .from(affiliateOffers)
        .where(eq(affiliateOffers.slug, baseSlug))
        .limit(1);
      const slug = collision ? slugify(`${baseSlug}-${randomUUID().slice(0, 6)}`) : baseSlug;

      function formatMeliItemId(itemId: string): string {
        return itemId.replace(/^([A-Z]{3})(\d+)$/i, '$1-$2');
      }

      const realToolId = process.env.MELI_TOOL_ID;
      const formattedMeliId = result.externalItemId ? formatMeliItemId(result.externalItemId) : '';
      // Se for Mercado Livre, gera link direto pro anúncio específico do vendedor.
      // Achado real (2026-08-02): o parâmetro certo de rastreamento é
      // `matt_tool` (confirmado contra um link gerado de verdade no Gerador
      // de Links do Mercado Livre) — `matt_tool_id` nunca existiu de verdade.
      // Só não deu problema até aqui porque MELI_TOOL_ID nunca esteve
      // configurado (realToolId sempre undefined, todo link ficava pendente).
      const initialUrl = (group.networkSlug === 'mercado-livre' && result.externalItemId)
        ? (realToolId ? `https://produto.mercadolivre.com.br/${formattedMeliId}?matt_tool=${realToolId}` : `https://produto.mercadolivre.com.br/${formattedMeliId}`)
        : `https://www.mercadolivre.com.br/p/${(result.catalogRef ?? group.externalRef)}`;

      const [createdRow] = await db
        .insert(affiliateOffers)
        .values({
          masterProductId: group.masterProductId,
          // A oferta HERDA a vertical do master (ADR 0008); fallback GAMES só para o master ausente (placeholder 'Produto').
          vertical: masterProduct.vertical,
          networkId: group.networkId,
          title: masterProduct.name,
          slug,
          affiliateUrl: initialUrl,
          // Se tivermos o ID de afiliado configurado, a oferta já entra ativa e clicável pro público
          affiliateLinkPending: !realToolId,
          imageUrl: masterProduct.defaultImages[0] ?? null,
          externalRef: result.catalogRef ?? group.externalRef,
          sellerId,
          // Nunca o preço real aqui — 0 é o mesmo sentinel de "ainda não
          // coletado" usado em discover-products.ts. O recordPriceSnapshot()
          // logo abaixo é o único lugar que grava preço real: se essa oferta
          // já nascesse com currentPriceCents = result.priceCents, o check de
          // "priceChanged" do recordPriceSnapshot (cache já bate com o
          // input) ficava falso e pulava o INSERT do primeiro snapshot —
          // oferta nascia com preço na tela mas zero linha de histórico
          // (achado real: 132 ofertas exatamente nesse estado).
          currentPriceCents: 0,
          // Identidade duvidosa (Open Box, outro modelo, cross-gen): 'draft' = fora dos indicadores e da vitrine.
          status: excluded ? 'draft' : 'active',
          publishedAt: excluded ? null : new Date(),
          lastCheckedAt: new Date(),
        })
        .returning();
      offerId = createdRow.id;
      created++;
    }

    updatedOfferIds.add(offerId);
    if (excluded) {
      reviewed.push({
        offerId,
        externalItemId: result.externalItemId,
        sellerTitle: result.sellerTitle ?? '',
        masterProductId: group.masterProductId,
        masterName: (await loadMaster()).name,
        reason: verdicts.get(result.externalItemId)?.summary ?? 'identidade',
        previousStatus,
      });
    }

    if (
      await recordPriceSnapshot({
        offerId,
        priceCents: result.priceCents,
        listPriceCents: result.listPriceCents,
        source: 'api',
      })
    ) {
      snapshotsWritten++;
    }
    pricedOfferIds.push(offerId);
    // sellerId só pode ter mudado na oferta EXISTENTE (buy box trocou de
    // vendedor) — numa recém-criada já foi setado no insert acima, round-trip
    // a mais aqui seria puro desperdício (o pool de conexão roda com max:1,
    // cada round-trip a menos importa de verdade pro tempo total da execução).
    if (!isNewOffer) {
      // QUARENTENA (migration 0023): `quarantined_at` é independente de `status`. Reativar 'expired' -> 'active'
      // aqui NÃO tira a oferta da quarentena (nenhum coletor escreve essa coluna); só `--revert` do script tira.
      // Achou vendedor de novo pra essa oferta — zera a sequência de falhas
      // (ver MAX_CONSECUTIVE_MISSES). Também reativa quem tinha sido
      // marcada 'expired' por engano numa falha passageira e voltou a
      // aparecer, em vez de ficar presa fora do catálogo pra sempre.
      const updateData: Partial<typeof affiliateOffers.$inferInsert> = {
        sellerId,
        consecutiveMissCount: 0,
        // Identidade duvidosa tira a oferta de 'active' (vai para 'draft'); nunca promove uma 'draft' sozinha.
        status: excluded
          ? existingOffer.status === 'active' || existingOffer.status === 'expired'
            ? 'draft'
            : existingOffer.status
          : existingOffer.status === 'expired'
            ? 'active'
            : existingOffer.status,
      };
      // Se o link de afiliado ainda está pendente, atualiza o placeholder com a URL do anúncio específico
      if (existingOffer.affiliateLinkPending && result.externalItemId && group.networkSlug === 'mercado-livre') {
        const realToolId = process.env.MELI_TOOL_ID;
        const formattedItemId = result.externalItemId.replace(/^([A-Z]{3})(\d+)$/i, '$1-$2');
        updateData.affiliateUrl = realToolId
          ? `https://produto.mercadolivre.com.br/${formattedItemId}?matt_tool=${realToolId}`
          : `https://produto.mercadolivre.com.br/${formattedItemId}`;
        if (realToolId) {
          updateData.affiliateLinkPending = false; // Ativa automaticamente o link!
        }
      }
      await db.update(affiliateOffers).set(updateData).where(eq(affiliateOffers.id, offerId));
    }
    updated++;
  }

  // Identifica ofertas do grupo que não foram retornadas nesta coleta
  // (vendedores que ficaram sem estoque ou removeram o anúncio).
  // Desconsideramos o placeholderOffer (que tem sellerId nulo) dessa desativação.
  //
  // Coleta por master: a expiração é decidida sobre a UNIÃO dos catálogos (decideMasterExpiry): só expira o vendedor
  // que não apareceu em nenhum catálogo; placeholders nunca expiram por aqui (contador de faltas acima).
  const expiredOfferIds = consolidated
    ? decideMasterExpiry({
        complete: consolidated.complete,
        unionSize: consolidated.unionSize,
        offers: master!.offers.map((o) => ({ id: o.id, isPlaceholder: o.sellerId === null })),
        updatedOfferIds,
        sellerUpsertFailed,
      }).expireIds
    : group.offerIds.filter((id) => !updatedOfferIds.has(id) && id !== placeholderOffer?.id);
  if (expiredOfferIds.length > 0) {
    await db
      .update(affiliateOffers)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(inArray(affiliateOffers.id, expiredOfferIds));
  }

  return { updated, created, reviewed, pricedOfferIds, snapshotsWritten };
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loadOwnerBlocks } from '@/server/identity-queue/owner-blocks';
import { affiliateNetworks, affiliateOffers, masterProducts } from '@/db/schema';
import { collapseBySeller, sanitizeErrorForSummary } from '@/lib/affiliate/master-consolidation';
import { mapWithConcurrency } from '@/lib/concurrency';
import { slugify } from '@/lib/slugify';
import { isVertical } from '@/lib/catalog/verticais';
import { isVerticalEnabled, killSwitchEnvName, refreshMinutesFor, type NonGamesVertical } from '@/lib/catalog/vertical/config';
import { fetchVerticalCatalog, VerticalPagingError, type RawPage, type VerticalCatalogOutcome } from '@/lib/catalog/vertical/paging';
import { groupDueOldestFirst, mayExpireStale, plusCallQuota, staleExpireHours, STALE_EXPIRE_MAX_PER_RUN } from '@/lib/catalog/vertical/queue';
import { startCollectorRun, collectorRunsEnabled } from '../collector-runs';
import { recordPriceSnapshot } from '../record-price-snapshot';
import { getMasterReferencePrices, isImplausiblyHigh, isImplausiblyLow } from '../price-plausibility';
import { getValidAccessToken } from '../sources/mercado-livre-auth';
import { upsertSellerFromOffer } from '../sources/mercado-livre-seller';

/**
 * COLETA RECORRENTE POR DEPARTAMENTO (ADR 0008 item 5). Fila, teto de chamadas e kill-switch PRÓPRIOS; o caminho gamer
 * (collect-prices.ts) não é tocado nem compartilha estado.
 *
 *  - Kill-switch `VERTICAL_<NOME>_ENABLED` (1/true). Desligado (padrão) => `{skipped:'disabled'}` sem tocar banco nem API.
 *  - Fila = affiliate_offers.vertical = <v>, status active/draft, com external_ref, devidas pelo intervalo do departamento.
 *  - Só a API oficial de catálogo do ML: GET /products/{id}/items?limit&offset. NÃO usa o multiget /items?ids= (403 com o
 *    token do app, achado da medição): título original do anúncio fica ausente (sem rechecagem por título); a defesa
 *    contra usado/Open Box é a condição `new` (parseMeliCatalogPage) + a identidade forte do catálogo.
 *  - Catálogo que responde 206 com total > itens NÃO é falha eterna (ver paging.ts): grava o que veio, não expira ninguém,
 *    carimba e conta como parcial.
 *  - Nunca interpola: sem resposta válida não há preço, não há snapshot, não há carimbo.
 *  - Reutiliza recordPriceSnapshot, upsertSellerFromOffer, collapseBySeller e startCollectorRun. A aplicação de resultados é
 *    um wrapper NOVO (applySnapshotsToGroup do gamer não é exportado e não grava `vertical` nas ofertas que cria).
 */

export type VerticalSkipReason = 'disabled' | 'invalid_vertical' | 'no_network';

export interface CollectVerticalSummary {
  vertical: string;
  skipped?: VerticalSkipReason;
  dryRun?: boolean;
  /** Ofertas devidas antes do teto de catálogos desta execução. */
  dueTotal: number;
  /** Ofertas escolhidas (agrupadas em `catalogs`). */
  selected: number;
  catalogs: number;
  /** Chamadas a /products/{id}/items (páginas e retries). Não inclui as de /users (reputação de vendedor novo). */
  apiCalls: number;
  callCap: number;
  pricesWritten: number;
  snapshotsWritten: number;
  rejectedImplausible: number;
  offersCreated: number;
  misses: number;
  partialCatalogs: number;
  failedCatalogs: number;
  deferredByBudget: number;
  /** HTTP 429 recebido: a execução parou na hora, sem novas chamadas (freio de cota). */
  rateLimited: boolean;
  /** Ofertas ativas já checadas, mas sem preço reconfirmado há N h, expiradas pela varredura de cauda. */
  expiredStale: number;
  /** Qual limite decidiu o teto de chamadas desta execução ('execucao' | 'hora' | 'dia'). */
  quotaLimitedBy: string | null;
  errors: { externalRef: string; message: string }[];
  stoppedBecause: string | null;
}

const MELI_SLUG = 'mercado-livre';
const MAX_CONSECUTIVE_MISSES = 3; // mesma regra do coletor gamer
const CATALOG_CONCURRENCY = 3;
// 2026-11-11 (fase de formação das lojas que não são games): 150 -> 240 chamadas por execução; o orçamento de 240 s continua parando antes se preciso.
const DEFAULT_MAX_CALLS = 240;
const DEFAULT_BUDGET_MS = 240_000;
// Freios de cota do conjunto Plus (somados em collector_runs; só valem com COLLECTOR_RUNS=1). Valores PADRÃO ASSUMIDOS:
// a cota oficial do ML não está documentada no repositório; o dono/integrador confirma e ajusta por ambiente.
const DEFAULT_PLUS_HOURLY_CAP = 8000;
const DEFAULT_PLUS_DAILY_CAP = 150_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function emptySummary(vertical: string, extra: Partial<CollectVerticalSummary> = {}): CollectVerticalSummary {
  return {
    vertical,
    dueTotal: 0,
    selected: 0,
    catalogs: 0,
    apiCalls: 0,
    callCap: 0,
    pricesWritten: 0,
    snapshotsWritten: 0,
    rejectedImplausible: 0,
    offersCreated: 0,
    misses: 0,
    partialCatalogs: 0,
    failedCatalogs: 0,
    deferredByBudget: 0,
    rateLimited: false,
    expiredStale: 0,
    quotaLimitedBy: null,
    errors: [],
    stoppedBecause: null,
    ...extra,
  };
}

interface Group {
  networkId: string;
  externalRef: string;
  masterProductId: string;
  offerIds: string[];
}

async function fetchRawPage(ref: string, offset: number, limit: number): Promise<RawPage> {
  const token = await getValidAccessToken();
  const res = await fetch(`https://api.mercadolibre.com/products/${ref}/items?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Mesma regra do coletor gamer (registerMiss não é exportado): soma a falta e expira quem bateu o teto. */
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
  if (offerIds.length === 0) return;
  await db.update(affiliateOffers).set({ lastCheckedAt: new Date() }).where(inArray(affiliateOffers.id, offerIds));
}

function dueWhere(vertical: NonGamesVertical, networkId: string, refreshMin: number) {
  return and(
    eq(affiliateOffers.vertical, vertical),
    eq(affiliateOffers.networkId, networkId),
    inArray(affiliateOffers.status, ['active', 'draft']),
    isNotNull(affiliateOffers.externalRef),
    or(isNull(affiliateOffers.lastCheckedAt), lt(affiliateOffers.lastCheckedAt, sql`now() - make_interval(mins => ${refreshMin})`))
  );
}

interface ApplyResult {
  created: number;
  snapshots: number;
  rejectedImplausible: number;
  priced: string[];
}

/** Grava os preços REAIS devolvidos pela API. Oferta nova herda `vertical`; oferta de vendedor existente é corrigida para a vertical do grupo. */
async function applyVerticalGroup(
  group: Group,
  vertical: NonGamesVertical,
  outcome: Extract<VerticalCatalogOutcome, { kind: 'complete' | 'partial' }>
): Promise<ApplyResult> {
  const out: ApplyResult = { created: 0, snapshots: 0, rejectedImplausible: 0, priced: [] };
  const results = collapseBySeller(outcome.items);
  if (results.length === 0) return out;

  const [master] = await db
    .select({ name: masterProducts.name, defaultImages: masterProducts.defaultImages })
    .from(masterProducts)
    .where(eq(masterProducts.id, group.masterProductId))
    .limit(1);
  const masterName = master?.name ?? 'Produto';
  const image = ((master?.defaultImages as unknown as string[]) ?? [])[0] ?? null;

  // Placeholder do catálogo (seller_id nulo, mesmo external_ref): recebe o MENOR preço real entre os vendedores.
  const placeholders = await db
    .select({ id: affiliateOffers.id })
    .from(affiliateOffers)
    .where(
      and(
        eq(affiliateOffers.masterProductId, group.masterProductId),
        eq(affiliateOffers.networkId, group.networkId),
        eq(affiliateOffers.externalRef, group.externalRef),
        isNull(affiliateOffers.sellerId)
      )
    );
  const best = results.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
  for (const ph of placeholders) {
    if (await recordPriceSnapshot({ offerId: ph.id, priceCents: best.priceCents, listPriceCents: best.listPriceCents, source: 'api' })) out.snapshots++;
    out.priced.push(ph.id);
    await db.update(affiliateOffers).set({ lastCheckedAt: new Date(), consecutiveMissCount: 0 }).where(eq(affiliateOffers.id, ph.id));
  }

  const touched = new Set<string>(placeholders.map((p) => p.id));
  let sellerUpsertFailed = false;
  const realToolId = process.env.MELI_TOOL_ID;

  for (const r of results) {
    let sellerId: string;
    try {
      sellerId = await upsertSellerFromOffer(group.networkId, r.externalSellerId);
    } catch (err) {
      console.error(`[collect-vertical] vendedor ${r.externalSellerId} (${group.externalRef}) falhou:`, sanitizeErrorForSummary((err as Error).message));
      sellerUpsertFailed = true;
      continue;
    }
    const [existing] = await db
      .select({ id: affiliateOffers.id, status: affiliateOffers.status, vertical: affiliateOffers.vertical })
      .from(affiliateOffers)
      .where(and(eq(affiliateOffers.masterProductId, group.masterProductId), eq(affiliateOffers.networkId, group.networkId), eq(affiliateOffers.sellerId, sellerId)))
      .orderBy(sql`CASE ${affiliateOffers.status} WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END`, affiliateOffers.createdAt, affiliateOffers.id)
      .limit(1);

    let offerId: string;
    if (existing) {
      offerId = existing.id;
      const upd: Partial<typeof affiliateOffers.$inferInsert> = {
        sellerId,
        consecutiveMissCount: 0,
        // Reativa quem expirou por falha passageira e voltou a aparecer (mesma regra do gamer). Draft não é promovido sozinho.
        // Decisao do dono ("nao e este produto") vence: expirada bloqueada nao volta a 'active'.
        status: existing.status === 'expired' && !(await loadOwnerBlocks(db, [existing.id])).draft.has(existing.id) ? 'active' : existing.status,
        lastCheckedAt: new Date(),
      };
      if (existing.vertical !== vertical) upd.vertical = vertical; // corrige vazamento (oferta gravada com o default 'games')
      await db.update(affiliateOffers).set(upd).where(eq(affiliateOffers.id, offerId));
    } else {
      const baseSlug = slugify(`${masterName}-${r.externalSellerId}`);
      const [collision] = await db.select({ id: affiliateOffers.id }).from(affiliateOffers).where(eq(affiliateOffers.slug, baseSlug)).limit(1);
      const slug = collision ? slugify(`${baseSlug}-${randomUUID().slice(0, 6)}`) : baseSlug;
      const itemId = r.externalItemId.replace(/^([A-Z]{3})(\d+)$/i, '$1-$2');
      const url = `https://produto.mercadolivre.com.br/${itemId}`;
      const [row] = await db
        .insert(affiliateOffers)
        .values({
          masterProductId: group.masterProductId,
          networkId: group.networkId,
          title: masterName,
          slug,
          affiliateUrl: realToolId ? `${url}?matt_tool=${realToolId}` : url,
          affiliateLinkPending: !realToolId,
          imageUrl: image,
          externalRef: group.externalRef,
          sellerId,
          currentPriceCents: 0, // sentinela "ainda não coletado"; só recordPriceSnapshot grava preço real
          vertical, // HERDADA do grupo (o default do banco seria 'games')
          status: 'active',
          publishedAt: new Date(),
          lastCheckedAt: new Date(),
        })
        .returning({ id: affiliateOffers.id });
      offerId = row.id;
      out.created++;
    }
    touched.add(offerId);
    // Guarda de plausibilidade (0,35x a 3x a mediana das OUTRAS ofertas do master, com >= 2 referências): fora da faixa
    // vai para quarentena e NÃO vira snapshot; dentro da faixa libera a quarentena (só vertical <> games, sem curadoria manual).
    const refs = await getMasterReferencePrices(group.masterProductId, offerId);
    if (isImplausiblyLow(r.priceCents, refs) || isImplausiblyHigh(r.priceCents, refs)) {
      await db.update(affiliateOffers).set({ quarantinedAt: new Date() }).where(eq(affiliateOffers.id, offerId));
      out.rejectedImplausible++;
      continue;
    }
    await db.update(affiliateOffers).set({ quarantinedAt: null }).where(and(
      eq(affiliateOffers.id, offerId),
      sql`${affiliateOffers.vertical} <> 'games'`,
      // "Preco errado" decidido pelo dono na fila: a coleta nao libera a quarentena.
      sql`NOT EXISTS (SELECT 1 FROM identity_decisions d WHERE d.offer_id = ${affiliateOffers.id} AND d.undone_at IS NULL AND d.axis = 'preco' AND d.value = 'preco_errado')`,
    ));
    if (await recordPriceSnapshot({ offerId, priceCents: r.priceCents, listPriceCents: r.listPriceCents, source: 'api' })) out.snapshots++;
    out.priced.push(offerId);
  }

  // Expiração SÓ com lista completa, ao menos 1 vendedor, sem falha de vendedor e master com UM catálogo ativo.
  if (outcome.kind === 'complete' && !sellerUpsertFailed) {
    const siblings = await db
      .select({ id: affiliateOffers.id, externalRef: affiliateOffers.externalRef })
      .from(affiliateOffers)
      .where(
        and(
          eq(affiliateOffers.masterProductId, group.masterProductId),
          eq(affiliateOffers.networkId, group.networkId),
          inArray(affiliateOffers.status, ['active', 'draft']),
          isNotNull(affiliateOffers.externalRef)
        )
      );
    const distinctRefs = new Set(siblings.map((s) => s.externalRef));
    if (distinctRefs.size === 1) {
      const sellerOffers = await db
        .select({ id: affiliateOffers.id })
        .from(affiliateOffers)
        .where(
          and(
            eq(affiliateOffers.masterProductId, group.masterProductId),
            eq(affiliateOffers.networkId, group.networkId),
            inArray(affiliateOffers.status, ['active', 'draft']),
            isNotNull(affiliateOffers.sellerId)
          )
        );
      const toExpire = sellerOffers.map((o) => o.id).filter((id) => !touched.has(id));
      if (toExpire.length > 0) await db.update(affiliateOffers).set({ status: 'expired', updatedAt: new Date() }).where(inArray(affiliateOffers.id, toExpire));
    }
  }
  await stampChecked(Array.from(new Set([...group.offerIds, ...touched])));
  return out;
}

/** Chamadas do conjunto Plus (todas as lojas) na última hora e em 24 h, somadas de collector_runs. null = não medido. */
async function plusCallsUsed(): Promise<{ h1: number; h24: number } | null> {
  if (!collectorRunsEnabled()) return null;
  try {
    const rows = (await db.execute(sql`
      SELECT coalesce(sum((meta->>'apiCalls')::numeric) FILTER (WHERE started_at > now() - interval '1 hour'), 0)::int AS h1,
             coalesce(sum((meta->>'apiCalls')::numeric), 0)::int AS h24
      FROM collector_runs
      WHERE job LIKE 'collect-vertical:%' AND started_at > now() - interval '24 hours'`)) as unknown as { h1: number; h24: number }[];
    return rows[0] ? { h1: Number(rows[0].h1), h24: Number(rows[0].h24) } : null;
  } catch (err) {
    console.error('[collect-vertical] leitura da cota falhou (usa só o teto da execução):', sanitizeErrorForSummary((err as Error).message));
    return null;
  }
}

/**
 * Varredura de cauda: oferta ATIVA (vendedor real) que foi checada recentemente mas cujo preço não é reconfirmado há N h
 * (ex.: está numa página do catálogo que o ML não entrega) sai como 'expired' pelo mesmo status já usado pelo coletor.
 * Nunca inventa preço. Oferta que nem foi checada (backlog nosso) NÃO expira: volta ao topo da fila.
 */
async function expireStaleOffers(vertical: NonGamesVertical, networkId: string, hours: number, refreshMin: number): Promise<number> {
  const rows = (await db.execute(sql`
    UPDATE affiliate_offers SET status = 'expired'::affiliate_offer_status, updated_at = now()
    WHERE id IN (
      SELECT id FROM affiliate_offers
      WHERE vertical = ${vertical} AND network_id = ${networkId} AND status = 'active' AND seller_id IS NOT NULL
        AND coalesce(last_price_confirmed_at, created_at) < now() - make_interval(hours => ${hours})
        AND last_checked_at > now() - make_interval(mins => ${refreshMin * 3})
      ORDER BY coalesce(last_price_confirmed_at, created_at) ASC
      LIMIT ${STALE_EXPIRE_MAX_PER_RUN})
    RETURNING id`)) as unknown as { id: string }[];
  return rows.length;
}

export interface CollectVerticalOptions {
  /** Só seleciona e conta; nenhuma chamada à API nem escrita. */
  dryRun?: boolean;
  maxCalls?: number;
  budgetMs?: number;
}

export async function collectVertical(vertical: string, options: CollectVerticalOptions = {}): Promise<CollectVerticalSummary> {
  if (!isVertical(vertical) || vertical === 'games') return emptySummary(vertical, { skipped: 'invalid_vertical' });
  const v = vertical as NonGamesVertical;
  if (!isVerticalEnabled(v)) return emptySummary(v, { skipped: 'disabled' }); // kill-switch: nada de banco, nada de API

  const [network] = await db.select({ id: affiliateNetworks.id }).from(affiliateNetworks).where(eq(affiliateNetworks.slug, MELI_SLUG)).limit(1);
  if (!network) return emptySummary(v, { skipped: 'no_network' });

  const refreshMin = refreshMinutesFor(v);
  const envCap = Number(process.env[`${killSwitchEnvName(v).replace('_ENABLED', '')}_MAX_CALLS`]);
  const runCap = options.maxCalls ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_MAX_CALLS);
  const used = options.dryRun ? null : await plusCallsUsed();
  const quota = plusCallQuota({
    runCap,
    usedLastHour: used?.h1 ?? null,
    usedLast24h: used?.h24 ?? null,
    hourlyCap: envInt('PLUS_ML_HOURLY_CALL_CAP', DEFAULT_PLUS_HOURLY_CAP),
    dailyCap: envInt('PLUS_ML_DAILY_CALL_CAP', DEFAULT_PLUS_DAILY_CAP),
  });
  const callCap = quota.callCap;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedMs = Date.now();
  const summary = emptySummary(v, { callCap, dryRun: options.dryRun === true, quotaLimitedBy: quota.limitedBy });
  const where = dueWhere(v, network.id, refreshMin);

  const [{ total, oldest }] = await db
    .select({
      total: sql<number>`count(*)::int`,
      oldest: sql<number | null>`max(extract(epoch from now() - coalesce(${affiliateOffers.lastCheckedAt}, ${affiliateOffers.createdAt})))::int`,
    })
    .from(affiliateOffers)
    .where(where);
  summary.dueTotal = total;

  const due = await db
    .select({
      id: affiliateOffers.id,
      externalRef: affiliateOffers.externalRef,
      masterProductId: affiliateOffers.masterProductId,
      lastCheckedAt: affiliateOffers.lastCheckedAt,
    })
    .from(affiliateOffers)
    .where(where)
    .orderBy(sql`${affiliateOffers.lastCheckedAt} ASC NULLS FIRST`, asc(affiliateOffers.id))
    .limit(Math.max(callCap, 1) * 20);

  // Fila POR ANTIGUIDADE: o catálogo cuja oferta é a mais velha vai primeiro; nunca checado antes de todos.
  const list: Group[] = groupDueOldestFirst(
    due.map((o) => ({ id: o.id, externalRef: o.externalRef, masterProductId: o.masterProductId, checkedAtMs: o.lastCheckedAt ? o.lastCheckedAt.getTime() : null }))
  ).map((g) => ({ networkId: network.id, externalRef: g.externalRef, masterProductId: g.masterProductId, offerIds: g.offerIds }));
  summary.selected = due.length;
  summary.catalogs = list.length;
  if (options.dryRun) return summary;

  const run = await startCollectorRun(`collect-vertical:${v}`, MELI_SLUG, {
    selected: due.length,
    dueTotal: total,
    oldestDueAgeS: collectorRunsEnabled() ? oldest : null,
  });
  let stopped: string | null = null;

  const charge = (): boolean => {
    if (summary.apiCalls >= callCap) return false;
    summary.apiCalls++;
    return true;
  };

  try {
    await mapWithConcurrency(list, CATALOG_CONCURRENCY, async (group) => {
      if (summary.rateLimited) {
        summary.deferredByBudget++; // 429 já recebido: nenhuma chamada nova nesta execução
        return;
      }
      if (Date.now() - startedMs > budgetMs) {
        stopped = 'orcamento_de_tempo';
        summary.deferredByBudget++;
        return;
      }
      try {
        run.counters.queries++;
        const outcome = await fetchVerticalCatalog(group.externalRef, fetchRawPage, { charge });
        run.counters.checked++;
        if (outcome.kind === 'empty') {
          // Resposta válida "sem vendedor" (404 "No winners found"): checagem real; soma falta, sem descartar a oferta de imediato.
          summary.misses++;
          run.counters.misses++;
          await stampChecked(group.offerIds);
          await registerMiss(group.offerIds);
          return;
        }
        if (outcome.kind === 'partial') {
          summary.partialCatalogs++;
          console.warn(`[collect-vertical:${v}] catálogo parcial ${group.externalRef}: HTTP ${outcome.httpStatus}, ${outcome.seen} de ${outcome.total} itens`);
        }
        if (outcome.items.length === 0) {
          // Sem anúncio novo utilizável: parcial sem itens (indeterminado) não conta falta; completo com só não-novos conta.
          await stampChecked(group.offerIds);
          if (outcome.kind === 'complete') {
            summary.misses++;
            run.counters.misses++;
            await registerMiss(group.offerIds);
          }
          return;
        }
        const applied = await applyVerticalGroup(group, v, outcome);
        summary.offersCreated += applied.created;
        summary.snapshotsWritten += applied.snapshots;
        summary.rejectedImplausible += applied.rejectedImplausible;
        summary.pricesWritten += applied.priced.length;
        run.counters.offersCreated += applied.created;
        run.counters.snapshotsWritten += applied.snapshots;
        await run.confirmPrices(applied.priced);
      } catch (err) {
        if (err instanceof VerticalPagingError && err.kind === 'limite-429') {
          summary.rateLimited = true;
          stopped = 'http_429';
          run.addError('HTTP 429 em /products/{id}/items', 'http_429');
          return; // sem carimbo: o catálogo segue devido; as demais execuções esperam a próxima rodada
        }
        if (err instanceof VerticalPagingError && err.kind === 'orcamento') {
          stopped = 'orcamento_de_chamadas';
          summary.deferredByBudget++;
          return; // adiado: sem carimbo, continua devido
        }
        summary.failedCatalogs++;
        const message = sanitizeErrorForSummary((err as Error).message);
        if (summary.errors.length < 20) summary.errors.push({ externalRef: group.externalRef, message });
        run.addError(message);
      }
    });
    // Cauda: preço não reconfirmado há N h em oferta já checada => 'expired' (só em execução saudável e com a coluna de confirmação ativa).
    if (mayExpireStale({ rateLimited: summary.rateLimited, pricesWritten: summary.pricesWritten, catalogs: summary.catalogs, failedCatalogs: summary.failedCatalogs, confirmationTracked: collectorRunsEnabled() })) {
      try {
        summary.expiredStale = await expireStaleOffers(v, network.id, staleExpireHours(), refreshMin);
      } catch (err) {
        console.error('[collect-vertical] varredura de cauda falhou (ignorada):', sanitizeErrorForSummary((err as Error).message));
      }
    }
  } finally {
    summary.stoppedBecause = stopped;
    await run.finish({
      stoppedBecause: stopped,
      budgetExhausted: stopped !== null,
      meta: {
        vertical: v,
        catalogs: summary.catalogs,
        apiCalls: summary.apiCalls,
        callCap,
        partialCatalogs: summary.partialCatalogs,
        failedCatalogs: summary.failedCatalogs,
        deferredByBudget: summary.deferredByBudget,
        rateLimited: summary.rateLimited,
        expiredStale: summary.expiredStale,
        quotaLimitedBy: quota.limitedBy,
        errorSamples: summary.errors.slice(0, 3).map((e) => e.message.slice(0, 160)),
      },
    });
  }
  return summary;
}

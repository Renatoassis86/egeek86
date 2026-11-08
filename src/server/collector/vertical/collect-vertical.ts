import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateNetworks, affiliateOffers, masterProducts } from '@/db/schema';
import { collapseBySeller, sanitizeErrorForSummary } from '@/lib/affiliate/master-consolidation';
import { mapWithConcurrency } from '@/lib/concurrency';
import { slugify } from '@/lib/slugify';
import { isVertical } from '@/lib/catalog/verticais';
import { isVerticalEnabled, killSwitchEnvName, refreshMinutesFor, type NonGamesVertical } from '@/lib/catalog/vertical/config';
import { fetchVerticalCatalog, VerticalPagingError, type RawPage, type VerticalCatalogOutcome } from '@/lib/catalog/vertical/paging';
import { startCollectorRun, collectorRunsEnabled } from '../collector-runs';
import { recordPriceSnapshot } from '../record-price-snapshot';
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
  offersCreated: number;
  misses: number;
  partialCatalogs: number;
  failedCatalogs: number;
  deferredByBudget: number;
  errors: { externalRef: string; message: string }[];
  stoppedBecause: string | null;
}

const MELI_SLUG = 'mercado-livre';
const MAX_CONSECUTIVE_MISSES = 3; // mesma regra do coletor gamer
const CATALOG_CONCURRENCY = 3;
const DEFAULT_MAX_CALLS = 150;
const DEFAULT_BUDGET_MS = 240_000;

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
    offersCreated: 0,
    misses: 0,
    partialCatalogs: 0,
    failedCatalogs: 0,
    deferredByBudget: 0,
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
  priced: string[];
}

/** Grava os preços REAIS devolvidos pela API. Oferta nova herda `vertical`; oferta de vendedor existente é corrigida para a vertical do grupo. */
async function applyVerticalGroup(
  group: Group,
  vertical: NonGamesVertical,
  outcome: Extract<VerticalCatalogOutcome, { kind: 'complete' | 'partial' }>
): Promise<ApplyResult> {
  const out: ApplyResult = { created: 0, snapshots: 0, priced: [] };
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
        status: existing.status === 'expired' ? 'active' : existing.status,
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
  const callCap = options.maxCalls ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_MAX_CALLS);
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedMs = Date.now();
  const summary = emptySummary(v, { callCap, dryRun: options.dryRun === true });
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
    .select({ id: affiliateOffers.id, externalRef: affiliateOffers.externalRef, masterProductId: affiliateOffers.masterProductId })
    .from(affiliateOffers)
    .where(where)
    .orderBy(sql`${affiliateOffers.lastCheckedAt} ASC NULLS FIRST`, asc(affiliateOffers.id))
    .limit(callCap * 20);

  const groups = new Map<string, Group>();
  for (const o of due) {
    const key = `${o.masterProductId}:${o.externalRef}`;
    const g = groups.get(key);
    if (g) g.offerIds.push(o.id);
    else groups.set(key, { networkId: network.id, externalRef: o.externalRef!, masterProductId: o.masterProductId, offerIds: [o.id] });
  }
  const list = Array.from(groups.values());
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
        summary.pricesWritten += applied.priced.length;
        run.counters.offersCreated += applied.created;
        run.counters.snapshotsWritten += applied.snapshots;
        await run.confirmPrices(applied.priced);
      } catch (err) {
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
        errorSamples: summary.errors.slice(0, 3).map((e) => e.message.slice(0, 160)),
      },
    });
  }
  return summary;
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { slugify } from '@/lib/slugify';
import { reviewGateFor } from '@/lib/catalog/vertical/gate';
import { normalizeTitleKey } from '@/lib/catalog/vertical/identity';
import { createMlClient } from '@/lib/catalog/vertical/ml-api';
import type { ExistingLookup, SeedPlanEntry } from '@/lib/catalog/vertical/seed-plan';
import { NOT_FOUND_TTL_DAYS } from '@/lib/catalog/vertical/seed-budget';
import { plusCapsFromEnv } from '@/lib/catalog/vertical/queue';
import {
  DEFAULT_BUDGET_MS,
  DEFAULT_RUN_CAP,
  emptyServerState,
  normalizeServerState,
  parseLojas,
  pruneNotFoundMap,
  runSeedSlice,
  type ApplyOutcome,
  type SeedRunHandle,
  type SeedServerState,
  type SeedSliceDeps,
  type SeedSliceSummary,
} from '@/lib/catalog/vertical/seed-slice';
import { startCollectorRun } from '../collector-runs';
import { recordPriceSnapshot } from '../record-price-snapshot';
import { getValidAccessToken } from '../sources/mercado-livre-auth';
import { plusCallsUsed } from './collect-vertical';

/**
 * SEMEADURA POR DEPARTAMENTO NO SERVIDOR (cron /api/cron/semear-vertical). Liga as dependências reais (banco Drizzle, API oficial do ML)
 * à orquestração pura de `seed-slice.ts`. Mesmo comportamento do script `scripts/semear-vertical.ts --fila`, em fatias curtas:
 * o master nasce SEMPRE em `review` (invisível), product_type 'general', com oferta-placeholder do catálogo e cotação inicial REAL
 * (menor preço entre os anúncios novos devolvidos pela API). Nada é inventado; nenhum scraping; só `/products/*` da API oficial.
 */

const STATE_KEY = 'semeadura_vertical_estado';
const NOTFOUND_KEY = 'semeadura_vertical_404';
const MELI_SLUG = 'mercado-livre';

type Row = Record<string, unknown>;

async function readJson(key: string): Promise<unknown> {
  const rows = (await db.execute(sql`SELECT value FROM system_config WHERE key = ${key} LIMIT 1`)) as unknown as Row[];
  return rows[0]?.value ?? null;
}

async function writeJson(key: string, value: unknown, description: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO system_config (key, value, description, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${description}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`);
}

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
}

// Cache de títulos normalizados (duplicata por título): instância morna reaproveita por 15 min.
let titleCache: { at: number; titles: Map<string, { id: string; name: string }> } | null = null;
const TITLE_CACHE_MS = 15 * 60_000;

async function loadTitles(): Promise<Map<string, { id: string; name: string }>> {
  if (titleCache && Date.now() - titleCache.at < TITLE_CACHE_MS) return titleCache.titles;
  const rows = (await db.execute(sql`
    SELECT id::text AS id, name FROM master_products
    WHERE (vertical <> 'games' OR product_type IN ('console', 'accessory')) AND (attributes ->> 'mergedInto') IS NULL`)) as unknown as Array<{ id: string; name: string }>;
  const titles = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    const k = normalizeTitleKey(r.name);
    if (k && !titles.has(k)) titles.set(k, r);
  }
  titleCache = { at: Date.now(), titles };
  return titles;
}

async function buildLookup(): Promise<ExistingLookup & { remember(e: SeedPlanEntry, id: string): void }> {
  const titles = await loadTitles();
  const one = async (q: Promise<unknown>) => ((await q) as unknown as Array<{ id: string; name: string }>)[0] ?? null;
  return {
    // Catálogo já cadastrado como master OU como oferta-placeholder anexada a um master (cor junta).
    byCatalogId: async (id) =>
      (await one(db.execute(sql`SELECT id::text AS id, name FROM master_products WHERE meli_catalog_id = ${id} LIMIT 1`))) ??
      (await one(db.execute(sql`SELECT m.id::text AS id, m.name FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id WHERE o.external_ref = ${id} AND o.seller_id IS NULL LIMIT 1`))),
    byGtins: (g) => one(db.execute(sql`SELECT id::text AS id, name FROM master_products WHERE gtin IN (${sql.join(g.map((x) => sql`${x}`), sql`, `)}) LIMIT 1`)),
    byIdentityKey: (k) => one(db.execute(sql`SELECT id::text AS id, name FROM master_products WHERE attributes -> 'vertical' ->> 'identityKey' = ${k} LIMIT 1`)),
    byTitleKey: async (k) => titles.get(k) ?? null,
    remember(e, id) {
      const k = normalizeTitleKey(e.name);
      if (k) titles.set(k, { id, name: e.name });
    },
  };
}

/** Cria master (review, 'general') + oferta-placeholder do catálogo, numa transação. Idempotente por catálogo. */
async function applyEntry(e: SeedPlanEntry, networkId: string): Promise<{ masterId: string; offerId: string } | { skipped: string }> {
  const now = new Date().toISOString();
  const attributes = {
    catalogGate: reviewGateFor(e.gate, now),
    vertical: {
      segment: e.segment,
      identityKey: e.identity.key,
      keyKind: e.identity.keyKind,
      domainId: e.domainId,
      parentId: e.parentId,
      gtins: e.identity.gtins,
      source: 'semear-vertical-servidor',
      seededAt: now,
      catalogAttributes: e.attributesSnapshot,
    },
  };
  const realToolId = process.env.MELI_TOOL_ID;
  const meliUrl = `https://www.mercadolivre.com.br/p/${e.catalogId}`;
  try {
    return await db.transaction(async (tx) => {
      const masterName = e.masterName ?? e.name;
      let slug = slugify(masterName);
      const coll = (await tx.execute(sql`SELECT id FROM master_products WHERE slug = ${slug} LIMIT 1`)) as unknown as Row[];
      if (coll.length > 0) slug = slugify(`${masterName}-${e.catalogId.slice(-6)}`);
      const gtin = e.identity.keyKind === 'gtin' || e.identity.keyKind === 'isbn' ? e.identity.key!.split(':')[1] : null;
      const m = (await tx.execute(sql`
        INSERT INTO master_products (name, slug, gtin, mpn, manufacturer, meli_catalog_id, default_images, attributes, vertical, product_type, is_verified)
        VALUES (${masterName}, ${slug}, ${gtin}, ${e.mpn}, ${e.brand}, ${e.catalogId}, ${JSON.stringify(e.pictures)}::jsonb, ${JSON.stringify(attributes)}::jsonb, ${e.vertical}, 'general'::product_type, false)
        RETURNING id::text AS id`)) as unknown as Array<{ id: string }>;
      const offerSlug = slugify(`${e.name}-${e.catalogId.slice(-6)}-${randomUUID().slice(0, 6)}`);
      const o = (await tx.execute(sql`
        INSERT INTO affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, external_ref,
                                      current_price_cents, status, published_at, vertical)
        VALUES (${m[0].id}, ${networkId}, ${e.name}, ${offerSlug}, ${realToolId ? `${meliUrl}?matt_tool=${realToolId}` : meliUrl}, ${!realToolId},
                ${e.pictures[0] ?? null}, ${e.catalogId}, 0, 'active', now(), ${e.vertical})
        ON CONFLICT (network_id, external_ref) WHERE external_ref IS NOT NULL AND seller_id IS NULL DO NOTHING
        RETURNING id::text AS id`)) as unknown as Array<{ id: string }>;
      if (o.length === 0) throw new Error('__oferta_ja_existe__'); // desfaz o master criado agora
      return { masterId: m[0].id, offerId: o[0].id };
    });
  } catch (err) {
    if ((err as Error)?.message === '__oferta_ja_existe__') return { skipped: 'oferta_placeholder_ja_existe' };
    if (pgCode(err) === '23505') return { skipped: 'violacao_unicidade' };
    throw err;
  }
}

/** Oferta-placeholder de um catálogo ANEXADO (cor junta) a um master que já existe. Idempotente por (rede, catálogo). */
async function applyAttach(e: SeedPlanEntry, networkId: string, masterId: string): Promise<{ masterId: string; offerId: string } | { skipped: string }> {
  const realToolId = process.env.MELI_TOOL_ID;
  const meliUrl = `https://www.mercadolivre.com.br/p/${e.catalogId}`;
  const offerSlug = slugify(`${e.name}-${e.catalogId.slice(-6)}-${randomUUID().slice(0, 6)}`);
  const o = (await db.execute(sql`
    INSERT INTO affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, external_ref,
                                  current_price_cents, status, published_at, vertical)
    VALUES (${masterId}, ${networkId}, ${e.name}, ${offerSlug}, ${realToolId ? `${meliUrl}?matt_tool=${realToolId}` : meliUrl}, ${!realToolId},
            ${e.pictures[0] ?? null}, ${e.catalogId}, 0, 'active', now(), ${e.vertical})
    ON CONFLICT (network_id, external_ref) WHERE external_ref IS NOT NULL AND seller_id IS NULL DO NOTHING
    RETURNING id::text AS id`)) as unknown as Array<{ id: string }>;
  return o.length > 0 ? { masterId, offerId: o[0].id } : { skipped: 'oferta_placeholder_ja_existe' };
}

async function applyPlans(
  plans: SeedPlanEntry[],
  masterByCatalog: Map<string, string>,
  lookup: ExistingLookup & { remember(e: SeedPlanEntry, id: string): void }
): Promise<ApplyOutcome> {
  const out: ApplyOutcome = { masters: [], offers: [], skipped: 0 };
  const net = (await db.execute(sql`SELECT id::text AS id FROM affiliate_networks WHERE slug = ${MELI_SLUG} LIMIT 1`)) as unknown as Array<{ id: string }>;
  if (net.length === 0) throw new Error('rede mercado-livre nao cadastrada em affiliate_networks');
  for (const p of plans) {
    let r: Awaited<ReturnType<typeof applyEntry>>;
    if (p.mergeInto) {
      const target = p.mergeInto.kind === 'existing' ? p.mergeInto.ref : masterByCatalog.get(p.mergeInto.ref);
      if (!target) {
        out.skipped++;
        continue;
      }
      r = await applyAttach(p, net[0].id, target);
    } else r = await applyEntry(p, net[0].id);
    if ('skipped' in r) {
      out.skipped++;
      continue;
    }
    // Cotação inicial REAL do placeholder = menor preço entre os anúncios novos devolvidos pela API (nada interpolado).
    await recordPriceSnapshot({ offerId: r.offerId, priceCents: p.priceMinCents!, listPriceCents: p.bestOriginalPriceCents, source: 'api' });
    if (!p.mergeInto) {
      lookup.remember(p, r.masterId);
      masterByCatalog.set(p.catalogId, r.masterId);
      out.masters.push(r.masterId);
    }
    out.offers.push(r.offerId);
  }
  return out;
}

function realDeps(): SeedSliceDeps {
  return {
    nowMs: () => Date.now(),
    async loadState() {
      return normalizeServerState(await readJson(STATE_KEY));
    },
    async saveState(s: SeedServerState) {
      await writeJson(STATE_KEY, s, 'Estado da semeadura no servidor (cursor por tipo, uso do dia, recuo de 429). Gerido por /api/cron/semear-vertical.');
    },
    async loadNotFound() {
      const v = (await readJson(NOTFOUND_KEY)) as Record<string, string> | null;
      return v && typeof v === 'object' ? v : {};
    },
    async saveNotFound(added) {
      const now = new Date();
      const cur = ((await readJson(NOTFOUND_KEY)) as Record<string, string> | null) ?? {};
      await writeJson(NOTFOUND_KEY, pruneNotFoundMap({ ...cur, ...added }, now, NOT_FOUND_TTL_DAYS), 'Catalogos do ML sem vendedor (404) lembrados por 7 dias pela semeadura.');
    },
    measuredPlusUsage: () => plusCallsUsed(),
    async makeClient({ maxCalls, beforeCall }) {
      const token = await getValidAccessToken();
      return createMlClient({ token, maxCalls, beforeCall });
    },
    buildLookup,
    applyPlans,
    async startRun(job): Promise<SeedRunHandle> {
      const h = await startCollectorRun(job, MELI_SLUG);
      return {
        counters: h.counters as unknown as SeedRunHandle['counters'],
        addError: (m, k) => h.addError(m, k as never),
        finish: (o) => h.finish(o),
      };
    },
    log: (m) => console.log('[semear-vertical]', m),
  };
}

export interface SeedVerticalParams {
  /** Lista de lojas (SEMEADURA_LOJAS); a rota pode sobrepor SÓ em dry-run. */
  lojas: string | undefined;
  apply: boolean;
  runCap?: number;
}

/**
 * Executa UMA fatia. `apply` só grava com SEMEADURA_TERMOS_APROVADOS=1 (a whitelist de termos é provisória até o dono curar;
 * ver TERMS_STATUS em config.ts): sem a env, a fatia roda em dry-run mesmo com apply=1 e o resumo avisa.
 */
export async function runSeedVertical(p: SeedVerticalParams): Promise<SeedSliceSummary & { applyBlockedByTerms?: boolean }> {
  const termsApproved = process.env.SEMEADURA_TERMOS_APROVADOS === '1';
  const apply = p.apply && termsApproved;
  const envCap = Number(process.env.SEMEADURA_MAX_CALLS);
  const runCap = p.runCap ?? (Number.isFinite(envCap) && envCap > 0 ? Math.floor(envCap) : DEFAULT_RUN_CAP);
  const dailyEnv = Number(process.env.SEMEADURA_DAILY_CAP);
  const caps = plusCapsFromEnv();
  const summary = await runSeedSlice(
    {
      lojas: parseLojas(p.lojas),
      apply,
      runCap,
      budgetMs: DEFAULT_BUDGET_MS,
      dailyCap: Number.isFinite(dailyEnv) && dailyEnv > 0 ? dailyEnv : undefined,
      plusHourlyCap: caps.hourlyCap,
      plusDailyCap: caps.dailyCap,
      notFoundTtlDays: NOT_FOUND_TTL_DAYS,
    },
    realDeps()
  );
  return { ...summary, ...(p.apply && !termsApproved ? { applyBlockedByTerms: true } : {}) };
}

export { emptyServerState };

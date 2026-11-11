import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateNetworks, affiliateOffers } from '@/db/schema';
import { slugify } from '@/lib/slugify';
import { isVertical, type Vertical } from '@/lib/catalog/verticais';
import { masterAprovadoSql } from '@/server/queries/departamento';
import { capFor, discoverCooldownHours, weightCaseSql, type QueueMode } from '@/lib/affiliate/amazon-budget';
import {
  buildQueryFor, judgeGame, judgeGeneric, parseBrl, prepareGame, prepareGeneric,
  type AmzCand, type MasterIdentity, type Verdict,
} from '@/lib/affiliate/amazon-identity';
import { recordPriceSnapshot } from './record-price-snapshot';
import { getMasterReferencePrices, isImplausiblyHigh, isImplausiblyLow } from './price-plausibility';

/**
 * Coleta ASSISTIDA da Amazon (decisão do dono, ata 2026-11-10-integracao-amazon-aliexpress.md; todas as frentes desde 2026-11-11).
 * Não existe API para a conta (Creators API exige 10 vendas em 30 dias); a aba logada do dono lê as buscas da Amazon e envia os
 * resultados para cá. Este módulo só casa e grava. A identidade (src/lib/affiliate/amazon-identity.ts) é a regra D4: dúvida fica
 * FORA (oferta 'draft', excluída de todo indicador). Só produto NOVO e EM LINHA. Nada de dado inventado: sem preço lido, sem oferta.
 */

export { parseBrl, buildAmazonQuery } from '@/lib/affiliate/amazon-identity';
export type { AmzCand } from '@/lib/affiliate/amazon-identity';

const AMZ_IMG_RE = /^https:\/\/m\.media-amazon\.com\/images\/[A-Za-z0-9_\-\/.%+,]{6,200}$/;
export const safeAmazonImage = (u: unknown): string | null => (typeof u === 'string' && AMZ_IMG_RE.test(u) ? u : null);
export interface AmzRow { id: string; q?: string; r: AmzCand[] }
export interface AmzQueueItem { id: string; q: string }

// ---------------------------------------------------------------------------
// Filas (mesmos endpoints; agora todas as frentes, com rodízio por departamento e orçamento de ciclo)
// ---------------------------------------------------------------------------

type QRow = {
  id: string; name: string; vertical: string; gen: string | null; gtin: string | null; mpn: string | null; manufacturer: string | null;
  brand_name: string | null; segment: string | null; cat: unknown;
}

function parseJson(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; } }
  return null;
}

export function masterFromRow(r: QRow): MasterIdentity | null {
  if (!isVertical(r.vertical)) return null;
  return {
    vertical: r.vertical, name: String(r.name), gen: r.gen, segment: r.segment, brand: r.brand_name ?? r.manufacturer,
    gtin: r.gtin, mpn: r.mpn, cat: parseJson(r.cat),
  };
}

/** Games: como sempre (sem 'review'); demais departamentos: SÓ porteiro aprovado (por inclusão). */
const eligibleSql = (): SQL => sql`((m.vertical = 'games' AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review') OR (m.vertical <> 'games' AND (${masterAprovadoSql('m')})))`;

function baseCte(mode: QueueMode, vertical?: Vertical): SQL {
  const cooldown = sql.raw(String(discoverCooldownHours()));
  const modeFilter = mode === 'refresh' ? sql`n_amz > 0` : mode === 'discover'
    ? sql`n_amz = 0 AND (scan_at IS NULL OR scan_at < now() - (${cooldown} * interval '1 hour'))`
    : sql`true`;
  const orderBy = mode === 'refresh' ? sql`amz_checked ASC NULLS FIRST, id` : mode === 'discover' ? sql`scan_at ASC NULLS FIRST, n_other DESC, id` : sql`n_other DESC, id`;
  const only = vertical ? sql`AND m.vertical = ${vertical}` : sql``;
  return sql`
    WITH base AS (
      SELECT m.id, m.vertical, m.name, m.game_platform_gen AS gen, m.gtin, m.mpn, m.manufacturer, b.name AS brand_name,
             m.attributes->'vertical'->>'segment' AS segment, m.attributes->'vertical'->'catalogAttributes' AS cat,
             NULLIF(m.attributes->'amazonScan'->>'at', '')::timestamptz AS scan_at,
             count(*) FILTER (WHERE nn.slug <> 'amazon') AS n_other,
             count(*) FILTER (WHERE nn.slug = 'amazon') AS n_amz,
             min(o.last_checked_at) FILTER (WHERE nn.slug = 'amazon') AS amz_checked
      FROM master_products m
      LEFT JOIN brands b ON b.id = m.brand_id
      JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
      JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE ${eligibleSql()} ${only}
      GROUP BY m.id, b.name
    ), filtered AS (SELECT * FROM base WHERE ${modeFilter}),
    ranked AS (SELECT f.*, row_number() OVER (PARTITION BY f.vertical ORDER BY ${orderBy}) AS rn FROM filtered f)`;
}

async function countMode(mode: QueueMode, vertical?: Vertical): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`${baseCte(mode, vertical)} SELECT count(*)::int AS n FROM ranked`);
  return Number(r[0]?.n ?? 0);
}

/** Fila do modo, com rodízio proporcional por departamento (posição/peso) e teto de orçamento do ciclo. */
async function loadQueue(mode: QueueMode, offset: number, n: number, vertical?: Vertical): Promise<AmzQueueItem[]> {
  const refreshTotal = mode === 'discover' ? await countMode('refresh') : 0;
  const cap = capFor(mode, refreshTotal);
  const off = Math.max(0, offset);
  const lim = Math.min(Math.max(1, n), 200, Math.max(0, cap - off));
  if (lim <= 0) return [];
  const w = sql.raw(weightCaseSql('r', mode));
  const rows = await db.execute<QRow>(sql`${baseCte(mode, vertical)}
    SELECT r.id::text AS id, r.name, r.vertical, r.gen, r.gtin, r.mpn, r.manufacturer, r.brand_name, r.segment, r.cat
    FROM ranked r ORDER BY (r.rn::float8 / (${w})), r.vertical, r.id OFFSET ${off} LIMIT ${lim}`);
  const items: AmzQueueItem[] = [];
  for (const r of rows) { const m = masterFromRow(r); if (m) items.push({ id: String(r.id), q: buildQueryFor(m) }); }
  return items;
}

/** Fila priorizada: masters elegíveis de todas as frentes, com mais ofertas ativas (ML/Shopee) primeiro. */
export const amazonQueue = (offset: number, n: number, vertical?: Vertical) => loadQueue('queue', offset, n, vertical);
/** Fila de ATUALIZAÇÃO: masters que JÁ têm oferta ativa da Amazon, da checagem mais antiga para a mais nova. */
export const amazonRefreshQueue = (offset: number, n: number, vertical?: Vertical) => loadQueue('refresh', offset, n, vertical);
/** Fila de DESCOBERTA: masters elegíveis SEM oferta ativa da Amazon; nunca buscados primeiro, depois o rodízio por busca mais antiga (carência de 72 h). */
export const amazonDiscoverQueue = (offset: number, n: number, vertical?: Vertical) => loadQueue('discover', offset, n, vertical);

/** Totais JÁ limitados pelo orçamento do ciclo (o laço pára em `total`). */
export async function amazonRefreshTotal(vertical?: Vertical): Promise<number> {
  return Math.min(await countMode('refresh', vertical), capFor('refresh', 0));
}
export async function amazonDiscoverTotal(vertical?: Vertical): Promise<number> {
  const [d, r] = await Promise.all([countMode('discover', vertical), countMode('refresh')]);
  return Math.min(d, capFor('discover', r));
}
export async function amazonQueueTotal(vertical?: Vertical): Promise<number> {
  return Math.min(await countMode('queue', vertical), capFor('queue', 0));
}

// ---------------------------------------------------------------------------
// Ingestão
// ---------------------------------------------------------------------------

export interface Counters { aceito: number; draft_identidade: number; rejeitado_condicao: number; rejeitado_composicao: number; fora_de_linha_ou_retro: number; patrocinado: number; sem_match: number }
const zero = (): Counters => ({ aceito: 0, draft_identidade: 0, rejeitado_condicao: 0, rejeitado_composicao: 0, fora_de_linha_ou_retro: 0, patrocinado: 0, sem_match: 0 });

export interface AmzStats {
  buscas: number; sem_candidato: number; aceitos: number; novos: number; atualizados: number; rejeitados: number; motivos: Record<string, number>;
  /** aceito/draft_identidade/rejeitado_X e patrocinado: por candidato; sem_match: por BUSCA sem nenhum candidato aproveitável. */
  contadores: Counters;
  por_vertical: Record<string, Counters & { buscas: number }>;
  rascunhos_novos: number; rascunhos_atualizados: number;
  amostra_draft: Array<{ master: string; asin: string; motivo: string }>;
}
export interface AmzLogEntry { id: string; master?: string; asin?: string; titulo?: string; preco?: number; score?: number; resultado: string; refs?: number; motivo?: string }

const MASTER_SQL = (id: string) => sql`
  SELECT m.id::text AS id, m.name, m.vertical, m.game_platform_gen AS gen, m.gtin, m.mpn, m.manufacturer, b.name AS brand_name,
         m.attributes->'vertical'->>'segment' AS segment, m.attributes->'vertical'->'catalogAttributes' AS cat,
         (${masterAprovadoSql('m')}) AS approved
  FROM master_products m LEFT JOIN brands b ON b.id = m.brand_id WHERE m.id = ${id}::uuid LIMIT 1`;

export async function ingestAmazonRows(rows: AmzRow[], opts: { tag: string; apply: boolean }): Promise<{ stats: AmzStats; log: AmzLogEntry[] }> {
  const [net] = await db.select().from(affiliateNetworks).where(eq(affiliateNetworks.slug, 'amazon')).limit(1);
  if (!net) throw new Error('rede amazon não existe');
  const stats: AmzStats = {
    buscas: 0, sem_candidato: 0, aceitos: 0, novos: 0, atualizados: 0, rejeitados: 0, motivos: {}, contadores: zero(), por_vertical: {},
    rascunhos_novos: 0, rascunhos_atualizados: 0, amostra_draft: [],
  };
  const bump = (m: string) => { stats.motivos[m] = (stats.motivos[m] ?? 0) + 1; stats.rejeitados++; };
  const log: AmzLogEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    stats.buscas++;
    const [mr] = await db.execute<QRow & { approved: boolean }>(MASTER_SQL(row.id));
    const master = mr ? masterFromRow(mr) : null;
    if (!mr || !master) { bump('master_inexistente'); continue; }
    if (master.vertical !== 'games' && mr.approved !== true) { bump('master_nao_aprovado'); continue; }
    const v = master.vertical;
    const pv = (stats.por_vertical[v] ??= { ...zero(), buscas: 0 });
    pv.buscas++;
    const name = master.name;

    let judge: (c: AmzCand) => Verdict;
    if (v === 'games') {
      const ctx = prepareGame({ name, gen: master.gen });
      if (!ctx) { bump('master_sem_plataforma'); continue; }
      judge = (c) => judgeGame(ctx, c);
    } else {
      const ctx = prepareGeneric(master);
      judge = (c) => judgeGeneric(ctx, c);
    }

    const accepted: { c: AmzCand; price: number; score: number; reason: string }[] = [];
    const drafts: { c: AmzCand; price: number; score: number; reason: string }[] = [];
    for (const raw of (row.r ?? []).slice(0, 10)) {
      const c = raw && typeof raw === 'object' ? { ...raw, t: String(raw.t ?? '').slice(0, 300) } : raw;
      const vd = judge(c);
      const k = vd.counter;
      if (vd.outcome === 'reject') {
        if (k === 'rejeitado_condicao' || k === 'rejeitado_composicao' || k === 'fora_de_linha_ou_retro' || k === 'patrocinado') { stats.contadores[k]++; pv[k]++; }
        stats.motivos[`${k}:${vd.reason}`] = (stats.motivos[`${k}:${vd.reason}`] ?? 0) + 1;
        continue;
      }
      (vd.outcome === 'accept' ? accepted : drafts).push({ c, price: vd.price as number, score: vd.score, reason: vd.reason });
    }
    accepted.sort((x, y) => y.score - x.score);
    drafts.sort((x, y) => y.score - x.score);
    let scanResult = 'sem_match';
    if (!accepted.length && !drafts.length) {
      stats.sem_candidato++; stats.contadores.sem_match++; pv.sem_match++;
      log.push({ id: row.id, master: name, resultado: 'sem_candidato' });
    }

    const refs = accepted.length || drafts.length ? await getMasterReferencePrices(row.id, '00000000-0000-0000-0000-000000000000') : [];
    const todo = [...accepted.slice(0, 2).map((x) => ({ ...x, kind: 'active' as const })), ...drafts.slice(0, 2).map((x) => ({ ...x, kind: 'draft' as const }))];
    for (const a of todo) {
      const low = isImplausiblyLow(a.price, refs), high = isImplausiblyHigh(a.price, refs);
      if (low || high) { bump(low ? 'preco_baixo_demais' : 'preco_alto_demais'); log.push({ id: row.id, master: name, asin: a.c.a, titulo: a.c.t, preco: a.price, resultado: low ? 'preco_baixo_demais' : 'preco_alto_demais', refs: refs.length }); continue; }
      const ref = `amazon-${a.c.a}`;
      const [existing] = await db.select({ id: affiliateOffers.id, master: affiliateOffers.masterProductId, status: affiliateOffers.status }).from(affiliateOffers).where(and(eq(affiliateOffers.networkId, net.id), eq(affiliateOffers.externalRef, ref))).limit(1);
      if (existing && existing.master !== row.id) { bump('asin_ja_em_outro_master'); log.push({ id: row.id, asin: a.c.a, resultado: 'asin_ja_em_outro_master' }); continue; }
      if (seen.has(a.c.a)) { bump('asin_repetido_no_lote'); continue; }
      seen.add(a.c.a);
      const isDraft = a.kind === 'draft';
      if (isDraft) {
        stats.contadores.draft_identidade++; pv.draft_identidade++;
        if (stats.amostra_draft.length < 25) stats.amostra_draft.push({ master: name.slice(0, 80), asin: a.c.a, motivo: a.reason });
        scanResult = scanResult === 'aceito' ? 'aceito' : 'draft';
      } else { stats.aceitos++; stats.contadores.aceito++; pv.aceito++; scanResult = 'aceito'; }
      const listCents = parseBrl(a.c.l);
      log.push({ id: row.id, master: name, asin: a.c.a, titulo: a.c.t, preco: a.price, score: Number(a.score.toFixed(2)), resultado: (existing ? 'atualizar' : 'criar') + (isDraft ? '_draft' : ''), motivo: a.reason, refs: refs.length });
      if (!opts.apply) { if (isDraft) { existing ? stats.rascunhos_atualizados++ : stats.rascunhos_novos++; } else if (existing) stats.atualizados++; else stats.novos++; continue; }
      // Oferta existente: atualiza preço/checagem, mas NUNCA muda o status (draft só sai por promoção humana; ativa com dúvida fica como está).
      if (existing) {
        if (isDraft && existing.status === 'active') { stats.motivos['ativa_com_duvida_nova'] = (stats.motivos['ativa_com_duvida_nova'] ?? 0) + 1; continue; }
        await recordPriceSnapshot({ offerId: existing.id, priceCents: a.price, listPriceCents: listCents, source: 'scrape' });
        const img = safeAmazonImage(a.c.i);
        await db.execute(sql`UPDATE affiliate_offers SET last_checked_at = now(), last_price_confirmed_at = now(), image_url = COALESCE(${img}, image_url) WHERE id = ${existing.id}`);
        if (existing.status === 'draft') stats.rascunhos_atualizados++; else stats.atualizados++;
        continue;
      }
      const [o] = await db.insert(affiliateOffers).values({
        masterProductId: row.id, vertical: v as Vertical, networkId: net.id, title: a.c.t.slice(0, 200),
        slug: slugify(`${a.c.t}-amazon-${randomUUID().slice(0, 6)}`), affiliateUrl: `https://www.amazon.com.br/dp/${a.c.a}?tag=${opts.tag}`, affiliateLinkPending: false,
        imageUrl: safeAmazonImage(a.c.i), storeName: 'Amazon', externalRef: ref, currentPriceCents: 0,
        status: isDraft ? 'draft' : 'active', publishedAt: isDraft ? null : new Date(), lastCheckedAt: new Date(),
      }).returning({ id: affiliateOffers.id });
      await recordPriceSnapshot({ offerId: o.id, priceCents: a.price, listPriceCents: listCents, source: 'scrape' });
      await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now() WHERE id = ${o.id}`);
      if (isDraft) stats.rascunhos_novos++; else stats.novos++;
    }

    // Rodízio da descoberta: registra a busca (quando e com que resultado) no próprio master; sem migração.
    if (opts.apply) {
      try {
        await db.execute(sql`UPDATE master_products SET attributes = jsonb_set(attributes, '{amazonScan}', jsonb_build_object('at', now()::text, 'r', ${scanResult}::text), true) WHERE id = ${row.id}::uuid`);
      } catch (e) { console.error('[amazon-assistida] falha ao registrar rodízio', e); }
    }
  }

  // Ofertas Amazon do mesmo master que NÃO apareceram nesta busca ficam como estão: ausência numa busca não prova que saíram do ar.
  return { stats, log };
}

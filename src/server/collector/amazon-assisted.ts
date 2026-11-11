import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateNetworks, affiliateOffers } from '@/db/schema';
import { slugify } from '@/lib/slugify';
import { GAMES } from '@/lib/catalog/verticais';
import { recordPriceSnapshot } from './record-price-snapshot';
import { getMasterReferencePrices, isImplausiblyHigh, isImplausiblyLow } from './price-plausibility';

/**
 * Coleta ASSISTIDA da Amazon (decisão do dono, ata 2026-11-10-integracao-amazon-aliexpress.md). Não existe API para a conta
 * (Creators API exige 10 vendas em 30 dias); a aba logada do dono lê as buscas da Amazon e envia os resultados para cá.
 * Este módulo só casa e grava. Regras: condição nova, plataforma e edição idênticas, sem pacote/kit/internacional/digital
 * (se o master não for digital), preço dentro de 0,35x–3x a mediana das outras ofertas (>=2 referências), 2 ASIN por master
 * no máximo, um ASIN nunca pertence a dois masters. Nada de dado inventado: sem preço lido, sem oferta.
 */

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function platformSet(text: string): Set<string> {
  const t = ' ' + norm(text) + ' ';
  const s = new Set<string>();
  if (/ ps ?5 | playstation ?5 /.test(t)) s.add('ps5');
  if (/ ps ?4 | playstation ?4 /.test(t)) s.add('ps4');
  if (/ ps ?3 | playstation ?3 /.test(t)) s.add('ps3');
  if (/ switch ?2 | ns2 /.test(t)) s.add('switch2');
  else if (/ switch /.test(t)) s.add('switch1');
  if (/ xbox series | series x | series s /.test(t)) s.add('xboxs');
  if (/ xbox one /.test(t)) s.add('xboxone');
  if (/ xbox 360 /.test(t)) s.add('xbox360');
  return s;
}
const GEN_PLAT: Record<string, string> = { ps5: 'ps5', ps4: 'ps4', ps3: 'ps3', switch_1: 'switch1', switch_2: 'switch2', xbox_series: 'xboxs', xbox_one: 'xboxone', xbox_360: 'xbox360' };
const GEN_LABEL: Record<string, string> = { ps5: 'PS5', ps4: 'PS4', ps3: 'PS3', xbox_series: 'Xbox Series', xbox_one: 'Xbox One', switch_1: 'Nintendo Switch', switch_2: 'Nintendo Switch 2', pc: 'PC' };

const STOP = new Set('jogo jogos midia fisica fisico novo nova original lacrado de do da dos das para e com o a os as the of sony standard padrao edition versao em portugues br pronta entrega envio imediato nacional game games video videogame ns2'.split(' '));
const PLAT_PHRASES = /\b(playstation ?[345]|ps ?[345]|xbox series x ?\/? ?s?|xbox series|series x ?\/? ?s?|xbox one|xbox 360|nintendo switch ?2|switch ?2|nintendo switch|switch)\b/g;
const COLORS = ['preto', 'branco', 'ouro', 'azul', 'vermelho', 'cinza', 'verde', 'rosa', 'roxo', 'amarelo', 'cobalt', 'starlight', 'galactic', 'cosmic', 'chroma'];
const EDITION = ['deluxe', 'ultimate', 'gold', 'goty', 'collector', 'colecionador', 'limitada', 'limited', 'edge', 'complete', 'completa', 'remastered', 'director', 'premium', 'special', 'especial', 'definitive', 'definitiva', 'anniversary', 'aniversario', 'launch', 'day'];
const EDMAP: Record<string, string> = { limited: 'limitada', completa: 'complete', especial: 'special', definitiva: 'definitive', aniversario: 'anniversary', colecionador: 'collector' };
const BAD = /\b(bundle|pacote|kit|combo|usado|seminovo|internacional|importado|importada|codigo|cartao|gift|amiibo|manga|livro|pelicula|skin|capa|suporte|cabo|compativel)\b/;

const tokens = (s: string): string[] => norm(s).replace(PLAT_PHRASES, ' ').split(' ').filter((w) => w && !STOP.has(w));
const colorSet = (s: string) => { const t = new Set(norm(s).split(' ')); return new Set(COLORS.filter((c) => t.has(c))); };
const editionSet = (s: string) => { const t = new Set(norm(s).split(' ')); const out = new Set<string>(); for (const e of EDITION) if (t.has(e)) out.add(EDMAP[e] ?? e); return out; };
const eqSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
export function parseBrl(p: string | null | undefined): number | null {
  if (!p) return null;
  const v = Number(p.replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

export interface AmzCand { a: string; t: string; p: string | null; l: string | null; s: number; /** URL da capa na CDN da Amazon (só o link; a Licença de PI permite guardar o link por até 24 h, então é renovado a cada leitura). */ i?: string | null }

const AMZ_IMG_RE = /^https:\/\/m\.media-amazon\.com\/images\/[A-Za-z0-9_\-\/.%+,]{6,200}$/;
export const safeAmazonImage = (u: unknown): string | null => (typeof u === 'string' && AMZ_IMG_RE.test(u) ? u : null);
export interface AmzRow { id: string; q?: string; r: AmzCand[] }
export interface AmzQueueItem { id: string; q: string }

/** Texto de busca do master: nome limpo + rótulo da plataforma quando o nome não a cita. */
export function buildAmazonQuery(name: string, gen: string | null): string {
  let q = name.replace(/[®™©]/g, ' ').replace(/\b(jogo|m[ií]dia f[ií]sica|midia fisica|novo|original|lacrado|pronta entrega|envio imediato|nacional)\b/gi, ' ').replace(/[-–]+/g, ' ').replace(/"/g, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  const l = gen ? GEN_LABEL[gen] : undefined;
  if (l && !q.toLowerCase().includes(l.toLowerCase().split(' ')[0])) q += ' ' + l;
  return q;
}

/** Fila priorizada: masters visíveis de games, com mais ofertas ativas primeiro. */
export async function amazonQueue(offset: number, n: number): Promise<AmzQueueItem[]> {
  const rows = await db.execute<{ id: string; name: string; gen: string | null }>(sql`
    SELECT m.id::text AS id, m.name, m.game_platform_gen AS gen
    FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
    WHERE m.vertical = 'games' AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'
    GROUP BY m.id ORDER BY count(o.id) DESC, m.id
    OFFSET ${Math.max(0, offset)} LIMIT ${Math.min(Math.max(1, n), 200)}`);
  return rows.map((r) => ({ id: r.id, q: buildAmazonQuery(String(r.name), r.gen)}));
}

/**
 * Fila de ATUALIZAÇÃO (tempo quase real): masters que JÁ têm oferta ativa da Amazon, da checagem mais antiga para a mais nova
 * (ofertas nunca checadas primeiro). Decisão do dono, 2026-11-10: os itens da Amazon devem chegar ao banco em tempo real.
 */
export async function amazonRefreshQueue(offset: number, n: number): Promise<AmzQueueItem[]> {
  const rows = await db.execute<{ id: string; name: string; gen: string | null }>(sql`
    SELECT m.id::text AS id, m.name, m.game_platform_gen AS gen
    FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
    JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'amazon'
    WHERE m.vertical = 'games' AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'
    GROUP BY m.id ORDER BY min(o.last_checked_at) ASC NULLS FIRST, m.id
    OFFSET ${Math.max(0, offset)} LIMIT ${Math.min(Math.max(1, n), 200)}`);
  return rows.map((r) => ({ id: r.id, q: buildAmazonQuery(String(r.name), r.gen) }));
}

export async function amazonRefreshTotal(): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT m.id)::int AS n FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
    JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'amazon'
    WHERE m.vertical = 'games' AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'`);
  return Number(r[0]?.n ?? 0);
}

/** Fila de DESCOBERTA: masters visíveis SEM oferta ativa da Amazon, com mais ofertas nas outras lojas primeiro. */
export async function amazonDiscoverQueue(offset: number, n: number): Promise<AmzQueueItem[]> {
  const rows = await db.execute<{ id: string; name: string; gen: string | null }>(sql`
    SELECT m.id::text AS id, m.name, m.game_platform_gen AS gen
    FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
    WHERE m.vertical = 'games' AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'
      AND NOT EXISTS (SELECT 1 FROM affiliate_offers a JOIN affiliate_networks an ON an.id = a.network_id AND an.slug = 'amazon'
                      WHERE a.master_product_id = m.id AND a.status = 'active' AND a.quarantined_at IS NULL)
    GROUP BY m.id ORDER BY count(o.id) DESC, m.id
    OFFSET ${Math.max(0, offset)} LIMIT ${Math.min(Math.max(1, n), 200)}`);
  return rows.map((r) => ({ id: r.id, q: buildAmazonQuery(String(r.name), r.gen) }));
}

export async function amazonQueueTotal(): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT m.id)::int AS n FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
    WHERE m.vertical = 'games' AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'`);
  return Number(r[0]?.n ?? 0);
}

export interface AmzStats { buscas: number; sem_candidato: number; aceitos: number; novos: number; atualizados: number; rejeitados: number; motivos: Record<string, number> }
export interface AmzLogEntry { id: string; master?: string; asin?: string; titulo?: string; preco?: number; score?: number; resultado: string; refs?: number }

export async function ingestAmazonRows(rows: AmzRow[], opts: { tag: string; apply: boolean }): Promise<{ stats: AmzStats; log: AmzLogEntry[] }> {
  const [net] = await db.select().from(affiliateNetworks).where(eq(affiliateNetworks.slug, 'amazon')).limit(1);
  if (!net) throw new Error('rede amazon não existe');
  const stats: AmzStats = { buscas: 0, sem_candidato: 0, aceitos: 0, novos: 0, atualizados: 0, rejeitados: 0, motivos: {} };
  const bump = (m: string) => { stats.motivos[m] = (stats.motivos[m] ?? 0) + 1; stats.rejeitados++; };
  const log: AmzLogEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    stats.buscas++;
    const [m] = await db.execute<{ id: string; name: string; gen: string | null }>(sql`SELECT id::text AS id, name, game_platform_gen AS gen FROM master_products WHERE id = ${row.id}::uuid AND vertical = 'games' LIMIT 1`);
    if (!m) { bump('master_inexistente'); continue; }
    const name = String(m.name);
    const mPlat = platformSet(name + ' ' + buildAmazonQuery(name, m.gen));
    const gp = m.gen ? GEN_PLAT[m.gen] : undefined; if (gp) { mPlat.clear(); mPlat.add(gp); }
    if (mPlat.size === 0) { bump('master_sem_plataforma'); continue; }
    const mTok = tokens(name), mEd = editionSet(name), mCol = colorSet(name), mDigital = /\bdigital\b/.test(norm(name));
    const ok: { c: AmzCand; price: number; score: number }[] = [];
    for (const c of (row.r ?? []).slice(0, 10)) {
      if (!c || typeof c.a !== 'string' || !/^[A-Z0-9]{10}$/.test(c.a) || c.s) continue;
      const price = parseBrl(c.p); if (!price) continue;
      const title = String(c.t ?? '').slice(0, 300); const ct = norm(title);
      if (BAD.test(ct)) continue;
      if (!mDigital && /\bdigital\b/.test(ct) && !/midia fisica|fisico/.test(ct)) continue;
      const cPlat = platformSet(title);
      const platOk = mPlat.has('xboxs') || mPlat.has('xboxone') ? [...mPlat].every((x) => cPlat.has(x)) : eqSet(mPlat, cPlat);
      if (!platOk || !eqSet(mEd, editionSet(title))) continue;
      const cCol = colorSet(title);
      if (mCol.size && cCol.size && ![...mCol].some((x) => cCol.has(x))) continue;
      if (!mCol.size && cCol.size && /ouro|edicao limitada/.test(ct) && !mEd.size) continue;
      const cTok = tokens(title), cs = new Set(cTok);
      const inter = mTok.filter((w) => cs.has(w)).length;
      const covM = mTok.length ? inter / mTok.length : 0, covC = cTok.length ? inter / cTok.length : 0;
      if (covM < 0.8 || covC < 0.5) continue;
      ok.push({ c: { ...c, t: title }, price, score: covM * 0.6 + covC * 0.4 });
    }
    ok.sort((x, y) => y.score - x.score);
    if (!ok.length) { stats.sem_candidato++; log.push({ id: row.id, master: name, resultado: 'sem_candidato' }); continue; }
    const refs = await getMasterReferencePrices(row.id, '00000000-0000-0000-0000-000000000000');
    for (const a of ok.slice(0, 2)) {
      const low = isImplausiblyLow(a.price, refs), high = isImplausiblyHigh(a.price, refs);
      if (low || high) { bump(low ? 'preco_baixo_demais' : 'preco_alto_demais'); log.push({ id: row.id, master: name, asin: a.c.a, titulo: a.c.t, preco: a.price, resultado: low ? 'preco_baixo_demais' : 'preco_alto_demais', refs: refs.length }); continue; }
      const ref = `amazon-${a.c.a}`;
      const [existing] = await db.select({ id: affiliateOffers.id, master: affiliateOffers.masterProductId }).from(affiliateOffers).where(and(eq(affiliateOffers.networkId, net.id), eq(affiliateOffers.externalRef, ref))).limit(1);
      if (existing && existing.master !== row.id) { bump('asin_ja_em_outro_master'); log.push({ id: row.id, asin: a.c.a, resultado: 'asin_ja_em_outro_master' }); continue; }
      if (seen.has(a.c.a)) { bump('asin_repetido_no_lote'); continue; }
      seen.add(a.c.a);
      stats.aceitos++;
      const listCents = parseBrl(a.c.l);
      log.push({ id: row.id, master: name, asin: a.c.a, titulo: a.c.t, preco: a.price, score: Number(a.score.toFixed(2)), resultado: existing ? 'atualizar' : 'criar', refs: refs.length });
      if (!opts.apply) { if (existing) stats.atualizados++; else stats.novos++; continue; }
      if (existing) {
        await recordPriceSnapshot({ offerId: existing.id, priceCents: a.price, listPriceCents: listCents, source: 'scrape' });
        const img = safeAmazonImage(a.c.i);
        await db.execute(sql`UPDATE affiliate_offers SET last_checked_at = now(), last_price_confirmed_at = now(), image_url = COALESCE(${img}, image_url) WHERE id = ${existing.id}`);
        stats.atualizados++;
        continue;
      }
      const [o] = await db.insert(affiliateOffers).values({
        masterProductId: row.id, vertical: GAMES, networkId: net.id, title: a.c.t.slice(0, 200),
        slug: slugify(`${a.c.t}-amazon-${randomUUID().slice(0, 6)}`), affiliateUrl: `https://www.amazon.com.br/dp/${a.c.a}?tag=${opts.tag}`, affiliateLinkPending: false,
        imageUrl: safeAmazonImage(a.c.i), storeName: 'Amazon', externalRef: ref, currentPriceCents: 0, status: 'active', publishedAt: new Date(), lastCheckedAt: new Date(),
      }).returning({ id: affiliateOffers.id });
      await recordPriceSnapshot({ offerId: o.id, priceCents: a.price, listPriceCents: listCents, source: 'scrape' });
      await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now() WHERE id = ${o.id}`);
      stats.novos++;
    }
  }

  // Ofertas Amazon do mesmo master que NÃO apareceram nesta busca ficam como estão: ausência numa busca não prova que saíram do ar.
  return { stats, log };
}

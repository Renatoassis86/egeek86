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
import { posicaoPrioridade3d } from '@/lib/messaging/prioridade-3d';
import { recordPriceSnapshot } from './record-price-snapshot';
import { decidirPrecoAmazon } from './amazon-tipo-preco';
import { enfileirarDuvidaAmazon } from './amazon-fila';
import { gravarEntregasPorAsin } from '@/server/shipping/frete-prazo';
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

function baseCte(mode: QueueMode, vertical?: Vertical, excluir: readonly string[] = []): SQL {
  const cooldown = sql.raw(String(discoverCooldownHours()));
  const modeFilter = mode === 'refresh' ? sql`n_amz > 0` : mode === 'discover'
    ? sql`n_amz = 0 AND (scan_at IS NULL OR scan_at < now() - (${cooldown} * interval '1 hour'))`
    : sql`true`;
  // QUENTES primeiro na atualização: master com oferta da Amazon que gerou candidato de mensagem nas últimas 6 h (a regra de envio exige preço confirmado em até 40 min).
  const orderBy = mode === 'refresh' ? sql`hot DESC, amz_checked ASC NULLS FIRST, id` : mode === 'discover' ? sql`scan_at ASC NULLS FIRST, n_other DESC, id` : sql`n_other DESC, id`;
  const only = vertical ? sql`AND m.vertical = ${vertical}` : sql``;
  const fora = excluir.length ? sql`AND m.id NOT IN (${sql.join(excluir.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  return sql`
    WITH base AS (
      SELECT m.id, m.vertical, m.name, m.game_platform_gen AS gen, m.gtin, m.mpn, m.manufacturer, b.name AS brand_name,
             m.attributes->'vertical'->>'segment' AS segment, m.attributes->'vertical'->'catalogAttributes' AS cat,
             NULLIF(m.attributes->'amazonScan'->>'at', '')::timestamptz AS scan_at,
             count(*) FILTER (WHERE nn.slug <> 'amazon') AS n_other,
             count(*) FILTER (WHERE nn.slug = 'amazon') AS n_amz,
             min(o.last_checked_at) FILTER (WHERE nn.slug = 'amazon') AS amz_checked,
             bool_or(nn.slug = 'amazon' AND EXISTS (SELECT 1 FROM group_messages gm WHERE gm.offer_id = o.id AND gm.created_at > now() - interval '6 hours')) AS hot
      FROM master_products m
      LEFT JOIN brands b ON b.id = m.brand_id
      JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL
      JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE ${eligibleSql()} ${only} ${fora}
      GROUP BY m.id, b.name
    ), filtered AS (SELECT * FROM base WHERE ${modeFilter}),
    ranked AS (SELECT f.*, row_number() OVER (PARTITION BY f.vertical ORDER BY ${orderBy}) AS rn FROM filtered f)`;
}

async function countMode(mode: QueueMode, vertical?: Vertical, excluir: readonly string[] = []): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`${baseCte(mode, vertical, excluir)} SELECT count(*)::int AS n FROM ranked`);
  return Number(r[0]?.n ?? 0);
}

/**
 * CABEÇA PRIORITÁRIA (dono, 2026-11-15, #59/#111): as impressoras 3D prioritárias (ordem fixa, SEMPRE COMBO PRIMEIRO: P2S Combo, P1S Combo,
 * A1 Combo, A1 Mini Combo; depois P2S, P1S, A1, A1 Mini; Kobra por último) abrem as filas de ATUALIZAÇÃO e de DESCOBERTA, antes do rodízio
 * por departamento, e IGNORAM a carência de 72 h da descoberta (a busca é refeita a cada ciclo: 8 a 12 buscas). Não é barreira: só ordem e
 * cobertura. O laço baixa a fila no começo do ciclo e descarta repetidos (`vistoCiclo`), então o próximo ciclo já abre pelo P2S Combo.
 * Desligar: AMAZON_PRIO_3D=off (ou GROUP_PRIORIDADE_3D=off, que zera a prioridade 3D inteira).
 */
const PRIO_3D_KOBRA_MAX = 6;
export function prioridade3dAmazonLigada(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AMAZON_PRIO_3D ?? '').toLowerCase() !== 'off';
}
type CabecaItem = AmzQueueItem & { pos: number; nome: string };
async function cabecaPrioritaria(vertical?: Vertical): Promise<CabecaItem[]> {
  if ((vertical && vertical !== 'impressao3d') || !prioridade3dAmazonLigada()) return [];
  const rows = await db.execute<QRow>(sql`
    SELECT m.id::text AS id, m.name, m.vertical, m.game_platform_gen AS gen, m.gtin, m.mpn, m.manufacturer, b.name AS brand_name,
           m.attributes->'vertical'->>'segment' AS segment, m.attributes->'vertical'->'catalogAttributes' AS cat
    FROM master_products m LEFT JOIN brands b ON b.id = m.brand_id
    WHERE m.vertical = 'impressao3d' AND ${eligibleSql()} AND m.name ~* '(bambu|kobra|anycubic)'
      AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.quarantined_at IS NULL)`);
  const todos: CabecaItem[] = [];
  for (const r of rows) {
    const pos = posicaoPrioridade3d('impressao3d', r.name);
    if (pos > 7 && pos !== 9) continue; // só os 8 modelos do dono e a Kobra; outros Bambu (H2D, X2D, A2L...) seguem o rodízio normal
    const m = masterFromRow(r);
    if (m) todos.push({ id: String(r.id), q: buildQueryFor(m), pos, nome: String(r.name) });
  }
  todos.sort((a, b) => a.pos - b.pos || a.nome.localeCompare(b.nome) || a.id.localeCompare(b.id));
  let kobra = 0;
  return todos.filter((t) => (t.pos === 9 ? ++kobra <= PRIO_3D_KOBRA_MAX : true));
}

/** Fila do modo, com rodízio proporcional por departamento (posição/peso) e teto de orçamento do ciclo. */
async function loadQueue(mode: QueueMode, offset: number, n: number, vertical?: Vertical): Promise<AmzQueueItem[]> {
  const cabeca = mode === 'queue' ? [] : await cabecaPrioritaria(vertical);
  const excl = cabeca.map((c) => c.id);
  const H = cabeca.length;
  const refreshTotal = mode === 'discover' ? await countMode('refresh', undefined, excl) : 0;
  const cap = capFor(mode, refreshTotal);
  const off = Math.max(0, offset);
  const lim0 = Math.min(Math.max(1, n), 200);
  const items: AmzQueueItem[] = cabeca.slice(off, off + lim0).map(({ id, q }) => ({ id, q }));
  const restOff = Math.max(0, off - H);
  const lim = Math.min(lim0 - items.length, Math.max(0, cap - restOff));
  if (lim <= 0) return items;
  const w = sql.raw(weightCaseSql('r', mode));
  const rows = await db.execute<QRow>(sql`${baseCte(mode, vertical, excl)}
    SELECT r.id::text AS id, r.name, r.vertical, r.gen, r.gtin, r.mpn, r.manufacturer, r.brand_name, r.segment, r.cat
    FROM ranked r ORDER BY (r.rn::float8 / (${w})), r.vertical, r.id OFFSET ${restOff} LIMIT ${lim}`);
  for (const r of rows) { const m = masterFromRow(r); if (m) items.push({ id: String(r.id), q: buildQueryFor(m) }); }
  return items;
}

/** Fila priorizada: masters elegíveis de todas as frentes, com mais ofertas ativas (ML/Shopee) primeiro. */
export const amazonQueue = (offset: number, n: number, vertical?: Vertical) => loadQueue('queue', offset, n, vertical);
/** Fila de ATUALIZAÇÃO: impressoras 3D prioritárias primeiro (combo antes), depois masters que JÁ têm oferta ativa da Amazon, da checagem mais antiga para a mais nova. */
export const amazonRefreshQueue = (offset: number, n: number, vertical?: Vertical) => loadQueue('refresh', offset, n, vertical);
/** Fila de DESCOBERTA: impressoras 3D prioritárias primeiro (sem carência); masters elegíveis SEM oferta ativa da Amazon: nunca buscados primeiro, depois o rodízio por busca mais antiga (carência de 72 h). */
export const amazonDiscoverQueue = (offset: number, n: number, vertical?: Vertical) => loadQueue('discover', offset, n, vertical);

/**
 * R-81 (dono, 2026-11-16): preço de Amazon só vale com leitura de até 45 min (confirmacao-preco). A cabeça prioritária (as impressoras do privado do dono)
 * ganha uma passada própria, curta, a cada ~20 min dentro do loop (modo 'cabeca'), sem esperar o ciclo de 2 h. No máximo 10 itens.
 */
export async function amazonCabecaQueue(): Promise<{ total: number; items: AmzQueueItem[] }> {
  const c = (await cabecaPrioritaria()).slice(0, 10).map(({ id, q }) => ({ id, q }));
  return { total: c.length, items: c };
}

/** Totais JÁ limitados pelo orçamento do ciclo (o laço pára em `total`); incluem a cabeça prioritária. */
export async function amazonRefreshTotal(vertical?: Vertical): Promise<number> {
  const ids = (await cabecaPrioritaria(vertical)).map((c) => c.id);
  return ids.length + Math.min(await countMode('refresh', vertical, ids), capFor('refresh', 0));
}
export async function amazonDiscoverTotal(vertical?: Vertical): Promise<number> {
  const ids = (await cabecaPrioritaria(vertical)).map((c) => c.id);
  const [d, r] = await Promise.all([countMode('discover', vertical, ids), countMode('refresh', undefined, ids)]);
  return ids.length + Math.min(d, capFor('discover', r));
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
  /** Rascunhos de FRONTEIRA (marca+modelo/plataforma+edicao iguais, cobertura de título baixa): vão para a fila de classificação em vez de serem descartados. */
  fronteira: number;
  /** Perguntas novas criadas na fila de classificação (rascunhos da Amazon em dúvida). */
  fila_criados: number;
  /** Patrocinados que seriam aceitos se o preço vier da página do produto: o cliente abre /dp/ASIN e reenvia o candidato com pg=1 e o preço da página. */
  paginas_pendentes: Array<{ id: string; a: string }>;
  /** Amostra de candidatos RECUSADOS (sem preço): permite simular regras novas sobre dado real nas próximas rodadas. Truncada em 30 por chamada. */
  amostra_recusados: Array<{ master: string; vertical: string; asin: string; titulo: string; motivo: string; covM?: number; covC?: number }>;
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
    rascunhos_novos: 0, rascunhos_atualizados: 0, amostra_draft: [], fronteira: 0, fila_criados: 0, paginas_pendentes: [], amostra_recusados: [],
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
    // R-88: entrega lida na página do produto (leitor 1.3.0). Melhor esforço; nunca derruba a ingestão do preço.
    if (opts.apply) await gravarEntregasPorAsin(net.id, row.id, (row.r ?? []).slice(0, 10)).catch((e) => console.error('[amazon-assistida] entrega falhou:', e instanceof Error ? e.message : e));

    // ASINs das ofertas ATIVAS da Amazon neste master: identidade já comprovada (usado só para aceitar o resultado patrocinado lido na página).
    const knownAsins = new Set((await db.execute<{ r: string }>(sql`
      SELECT o.external_ref AS r FROM affiliate_offers o WHERE o.network_id = ${net.id} AND o.master_product_id = ${row.id}::uuid AND o.status = 'active' AND o.external_ref LIKE 'amazon-%'`))
      .map((x) => String(x.r).replace(/^amazon-/, '')));
    let judge: (c: AmzCand) => Verdict;
    if (v === 'games') {
      const ctx = prepareGame({ name, gen: master.gen });
      if (!ctx) { bump('master_sem_plataforma'); continue; }
      judge = (c) => judgeGame(ctx, c, { knownAsins });
    } else {
      const ctx = prepareGeneric(master);
      judge = (c) => judgeGeneric(ctx, c, { knownAsins });
    }

    type Hit = { c: AmzCand; price: number; score: number; reason: string; border?: boolean; covM?: number; covC?: number };
    const accepted: Hit[] = [];
    const drafts: Hit[] = [];
    for (const raw of (row.r ?? []).slice(0, 10)) {
      const c = raw && typeof raw === 'object' ? { ...raw, t: String(raw.t ?? '').slice(0, 300) } : raw;
      const vd = judge(c);
      const k = vd.counter;
      if (vd.outcome === 'reject') {
        if (k === 'rejeitado_condicao' || k === 'rejeitado_composicao' || k === 'fora_de_linha_ou_retro' || k === 'patrocinado') { stats.contadores[k]++; pv[k]++; }
        stats.motivos[`${k}:${vd.reason}`] = (stats.motivos[`${k}:${vd.reason}`] ?? 0) + 1;
        if (vd.needsPage && stats.paginas_pendentes.length < 40) stats.paginas_pendentes.push({ id: row.id, a: c.a });
        if ((k === 'sem_match' || k === 'patrocinado') && stats.amostra_recusados.length < 30 && c && typeof c === 'object') {
          stats.amostra_recusados.push({ master: name.slice(0, 80), vertical: v, asin: String(c.a), titulo: String(c.t).slice(0, 120), motivo: vd.reason, covM: vd.covM != null ? Number(vd.covM.toFixed(2)) : undefined, covC: vd.covC != null ? Number(vd.covC.toFixed(2)) : undefined });
        }
        continue;
      }
      (vd.outcome === 'accept' ? accepted : drafts).push({ c, price: vd.price as number, score: vd.score, reason: vd.reason, border: vd.border, covM: vd.covM, covC: vd.covC });
    }
    accepted.sort((x, y) => y.score - x.score);
    drafts.sort((x, y) => y.score - x.score);
    let scanResult = 'sem_match';
    if (!accepted.length && !drafts.length) {
      stats.sem_candidato++; stats.contadores.sem_match++; pv.sem_match++;
      log.push({ id: row.id, master: name, resultado: 'sem_candidato' });
    }

    const refs = accepted.length || drafts.length ? await getMasterReferencePrices(row.id, '00000000-0000-0000-0000-000000000000') : [];
    const maxAceitos = v === 'impressao3d' ? 4 : 2; // impressora 3D: o mesmo modelo tem várias variantes de tensão/vendedor na Amazon (P2S Combo 110 V, 220 V...)
    const todo = [...accepted.slice(0, maxAceitos).map((x) => ({ ...x, kind: 'active' as const })), ...drafts.slice(0, 2).map((x) => ({ ...x, kind: 'draft' as const }))];
    for (const a of todo) {
      // R-69: o preco da serie e o CHEIO; "a vista no Pix" e atributo. Pix sem cheio legivel NAO e gravado (nunca inventa valor).
      const dec = await decidirPrecoAmazon(`amazon-${a.c.a}`, a.c);
      if (!dec.ok) { bump(`preco_${dec.motivo}`); log.push({ id: row.id, asin: a.c.a, resultado: `preco_${dec.motivo}` }); continue; }
      a.price = dec.priceCents;
      const pixAttr = dec.pixCents;
      const low = isImplausiblyLow(a.price, refs), high = isImplausiblyHigh(a.price, refs);
      // R2-12 (dono, 2026-11-14): preço implausível NÃO é descartado: a oferta é registrada e entra em QUARENTENA (quarantined_at), fora de média, selo e vitrines, para revisão.
      const quarentena = low || high;
      if (quarentena) { const mq = low ? 'quarentena_preco_baixo_demais' : 'quarentena_preco_alto_demais'; stats.motivos[mq] = (stats.motivos[mq] ?? 0) + 1; log.push({ id: row.id, master: name, asin: a.c.a, titulo: a.c.t, preco: a.price, resultado: low ? 'preco_baixo_demais_quarentena' : 'preco_alto_demais_quarentena', refs: refs.length }); }
      const ref = `amazon-${a.c.a}`;
      const [existing] = await db.select({ id: affiliateOffers.id, master: affiliateOffers.masterProductId, status: affiliateOffers.status }).from(affiliateOffers).where(and(eq(affiliateOffers.networkId, net.id), eq(affiliateOffers.externalRef, ref))).limit(1);
      if (existing && existing.master !== row.id) { bump('asin_ja_em_outro_master'); log.push({ id: row.id, asin: a.c.a, resultado: 'asin_ja_em_outro_master' }); continue; }
      if (seen.has(a.c.a)) { bump('asin_repetido_no_lote'); continue; }
      seen.add(a.c.a);
      const isDraft = a.kind === 'draft';
      if (isDraft) {
        stats.contadores.draft_identidade++; pv.draft_identidade++;
        if (a.border) stats.fronteira++;
        if (stats.amostra_draft.length < 25) stats.amostra_draft.push({ master: name.slice(0, 80), asin: a.c.a, motivo: a.reason });
        scanResult = scanResult === 'aceito' ? 'aceito' : 'draft';
      } else { stats.aceitos++; stats.contadores.aceito++; pv.aceito++; scanResult = 'aceito'; }
      const listCents = dec.listCents;
      log.push({ id: row.id, master: name, asin: a.c.a, titulo: a.c.t, preco: a.price, score: Number(a.score.toFixed(2)), resultado: (existing ? 'atualizar' : 'criar') + (isDraft ? '_draft' : ''), motivo: a.reason, refs: refs.length });
      if (!opts.apply) { if (isDraft) { existing ? stats.rascunhos_atualizados++ : stats.rascunhos_novos++; } else if (existing) stats.atualizados++; else stats.novos++; continue; }
      // Oferta existente: atualiza preço/checagem, mas NUNCA muda o status (draft só sai por promoção humana; ativa com dúvida fica como está).
      if (existing) {
        if (isDraft && existing.status === 'active') { stats.motivos['ativa_com_duvida_nova'] = (stats.motivos['ativa_com_duvida_nova'] ?? 0) + 1; continue; }
        await recordPriceSnapshot({ offerId: existing.id, priceCents: a.price, listPriceCents: listCents, source: 'scrape', pixCents: pixAttr });
        const img = safeAmazonImage(a.c.i);
        await db.execute(sql`UPDATE affiliate_offers SET last_checked_at = now(), last_price_confirmed_at = now(), image_url = COALESCE(${img}, image_url) WHERE id = ${existing.id}`);
        if (quarentena) await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = COALESCE(quarantined_at, now()), updated_at = now() WHERE id = ${existing.id}`);
        if (existing.status === 'draft') {
          stats.rascunhos_atualizados++;
          if (await enfileirarDuvidaAmazon(db, { offerId: existing.id, masterId: row.id, masterNome: name, vertical: v, asin: a.c.a, titulo: a.c.t, motivo: a.reason, fronteira: Boolean(a.border), score: a.score, covM: a.covM, covC: a.covC })) stats.fila_criados++;
        } else stats.atualizados++;
        continue;
      }
      const [o] = await db.insert(affiliateOffers).values({
        masterProductId: row.id, vertical: v as Vertical, networkId: net.id, title: a.c.t.slice(0, 200),
        slug: slugify(`${a.c.t}-amazon-${randomUUID().slice(0, 6)}`), affiliateUrl: `https://www.amazon.com.br/dp/${a.c.a}?tag=${opts.tag}`, affiliateLinkPending: false,
        imageUrl: safeAmazonImage(a.c.i), storeName: 'Amazon', externalRef: ref, currentPriceCents: 0,
        status: isDraft ? 'draft' : 'active', publishedAt: isDraft ? null : new Date(), lastCheckedAt: new Date(),
      }).returning({ id: affiliateOffers.id });
      await recordPriceSnapshot({ offerId: o.id, priceCents: a.price, listPriceCents: listCents, source: 'scrape', pixCents: pixAttr });
      await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now() WHERE id = ${o.id}`);
      if (quarentena) await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = now(), updated_at = now() WHERE id = ${o.id}`);
      if (isDraft) {
        stats.rascunhos_novos++;
        if (await enfileirarDuvidaAmazon(db, { offerId: o.id, masterId: row.id, masterNome: name, vertical: v, asin: a.c.a, titulo: a.c.t, motivo: a.reason, fronteira: Boolean(a.border), score: a.score, covM: a.covM, covC: a.covC })) stats.fila_criados++;
      } else stats.novos++;
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

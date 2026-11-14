import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateNetworks, affiliateOffers } from '@/db/schema';
import { slugify } from '@/lib/slugify';
import type { Vertical } from '@/lib/catalog/verticais';
import { SEGMENTS } from '@/lib/catalog/vertical/config';
import { NOVOS_SEGMENTOS_TIPOS } from '@/lib/catalog/vertical/config-tipos';
import { decidirMasterNovo, ehLojaPlus, IndiceDedup, type MarcasConhecidas } from '@/lib/affiliate/shopee-master-novo';
import { masterAprovadoSql } from '@/server/queries/departamento';
import { parseBrl, type AmzCand } from '@/lib/affiliate/amazon-identity';
import { ingestAmazonRows, safeAmazonImage, type AmzRow, type AmzStats } from './amazon-assisted';
import { enfileirarDuvidaAmazon } from './amazon-fila';
import { recordPriceSnapshot } from './record-price-snapshot';
import { getMasterReferencePrices, isImplausiblyHigh, isImplausiblyLow } from './price-plausibility';
import { foldTitle } from '@/lib/catalog/dimensions';
import { casarJogo } from './cobertura-shopee';
import { carregarIndiceDedup, carregarMarcasConhecidas, criarMasterGame, criarMasterPlus } from './shopee-master-novo-store';

type Sql = postgres.Sql<{}>;

/**
 * VITRINE DA AMAZON (plano 2 do dono, 2026-11-12): em vez de buscar só o que JÁ existe no catálogo (ML/Shopee), a aba logada lê buscas
 * CARACTERÍSTICAS de cada loja (jogos e consoles por plataforma/editora; cada tipo das lojas Plus) e esta rotina cadastra o ASIN novo.
 * Regras (inegociáveis): só preço lido na busca (sem preço, descarta); patrocinado fora; só novo e em linha (porteiros existentes);
 * dedup ANTES de criar (casarJogo = findExistingMasterProduct; decidirMasterNovo = índice por chave); master novo nasce em REVISÃO
 * (invisível, fora de média/vitrine) e a oferta nasce RASCUNHO (fora de todo indicador) até o dono aprovar na fila. ASIN já conhecido
 * só tem o preço atualizado (isso também alimenta o frescor de 40 min). Tudo reversível: o resumo da execução guarda os ids criados.
 */

export const VITRINE_PREFIX = '00000000-0000-4000-8000-';
export const isVitrineId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(VITRINE_PREFIX);

export interface VitrineQuery { id: string; vertical: Vertical; q: string }

const idDe = (vertical: string, q: string) => VITRINE_PREFIX + createHash('sha1').update(`${vertical}|${q}`).digest('hex').slice(0, 12);

const GAMES_PLATAFORMAS = ['ps5', 'ps4', 'nintendo switch', 'xbox series'];
const GAMES_EDITORAS = ['capcom', 'ea sports', 'ubisoft', 'rockstar', 'warner bros', 'bandai namco', 'square enix', 'sega', 'konami', '2k', 'nintendo', 'sony'];
const GAMES_GERAIS = ['console playstation 5', 'console xbox series', 'console nintendo switch', 'controle ps5', 'controle xbox', 'headset gamer', 'volante gamer', 'cadeira gamer', 'hyperkin', 'retro-bit', '8bitdo', 'analogue'];

/** Lista determinística (ordem estável) das consultas da vitrine: games + um conjunto genérico por tipo de cada loja Plus. */
export function vitrineQueries(): VitrineQuery[] {
  const out: VitrineQuery[] = [];
  const seen = new Set<string>();
  const add = (vertical: Vertical, q: string) => {
    const k = `${vertical}|${q.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ id: idDe(vertical, q), vertical, q });
  };
  for (const p of GAMES_PLATAFORMAS) {
    add('games', `jogo ${p}`);
    for (const e of GAMES_EDITORAS) add('games', `${e} ${p}`);
  }
  for (const g of GAMES_GERAIS) add('games', g);
  for (const s of [...SEGMENTS, ...NOVOS_SEGMENTOS_TIPOS]) {
    const label = s.label.replace(/\s*\([^)]*\)/g, '').trim();
    if (label.length >= 4) add(s.vertical, label);
  }
  return out;
}

/**
 * Consulta FIXA da descoberta por promoção (dono, 2026-11-14): os ASINs da página de uma promoção de games que ainda não são oferta nossa entram pelo MESMO
 * caminho da vitrine (casarJogo + dedup + master novo em REVISÃO + oferta em RASCUNHO), só que sem uma busca por trás. Não entra em vitrineQueries(),
 * então o laço da aba nunca a pede como busca.
 */
export const PROMO_DESCOBERTA_QUERY: VitrineQuery = { id: idDe('games', 'promocao-prime-descoberta'), vertical: 'games', q: 'promoção da Amazon (descoberta)' };

export interface CardPromoNovo { asin: string; titulo: string; priceCents: number; listCents?: number | null }
const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;

/** Monta a linha da vitrine a partir dos cards novos de uma promoção (puro; testado). */
export function linhaDaPromocao(cards: readonly CardPromoNovo[]): AmzRow {
  return { id: PROMO_DESCOBERTA_QUERY.id, q: PROMO_DESCOBERTA_QUERY.q, r: cards.map((c) => ({ a: c.asin, t: c.titulo, p: brl(c.priceCents), l: c.listCents ? brl(c.listCents) : null, s: 0, i: null })) };
}

export function vitrineQueryById(id: string): VitrineQuery | undefined {
  return vitrineQueries().find((x) => x.id === id);
}

export const vitrineCap = (): number => {
  const n = Number(process.env.AMAZON_VITRINE_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
};

/** Fila da vitrine: janela rotativa por hora (todas as consultas passam ao longo do dia). Total já limitado pelo teto do ciclo. */
export function vitrineQueue(offset: number, n: number, now: Date = new Date()): { items: Array<{ id: string; q: string }>; total: number } {
  const all = vitrineQueries();
  const cap = Math.min(vitrineCap(), all.length);
  const start = (now.getUTCHours() * cap) % Math.max(1, all.length);
  const janela = Array.from({ length: cap }, (_, i) => all[(start + i) % all.length]);
  const off = Math.max(0, offset);
  return { total: cap, items: janela.slice(off, off + Math.max(1, n)).map((x) => ({ id: x.id, q: x.q })) };
}

export interface VitrineStats {
  linhas: number; cartoes: number; atualizados: number; ja_fresco: number; delegados: number; rascunhos_novos: number; masters_novos: number;
  descartados: Record<string, number>; erros: number; truncado: boolean;
  criados: { masters: string[]; ofertas: string[] };
  ingest: Pick<AmzStats, 'novos' | 'atualizados' | 'rascunhos_novos' | 'rascunhos_atualizados' | 'aceitos'> | null;
}

const dedupCache = new Map<string, { em: number; indice: IndiceDedup }>();
let marcasCache: { em: number; marcas: MarcasConhecidas } | null = null;
const TTL_MS = 10 * 60_000;

async function indiceDe(client: Sql, vertical: string): Promise<IndiceDedup> {
  const c = dedupCache.get(vertical);
  if (c && Date.now() - c.em < TTL_MS) return c.indice;
  const indice = await carregarIndiceDedup(client, vertical);
  dedupCache.set(vertical, { em: Date.now(), indice });
  return indice;
}
async function marcasConhecidas(client: Sql): Promise<MarcasConhecidas> {
  if (marcasCache && Date.now() - marcasCache.em < TTL_MS) return marcasCache.marcas;
  const marcas = await carregarMarcasConhecidas(client);
  marcasCache = { em: Date.now(), marcas };
  return marcas;
}

/**
 * GUARDA ANTI-DUPLICATA de games (incidente 2026-07-29): `findExistingMasterProduct` já falhou em casar "NBA 2K27 - PlayStation 5" com o master
 * "NBA 2K27 - PS5" (o '2K27' vira marcador). Antes de criar master de jogo pela Amazon, compara a chave simples do título (sem plataforma, formato
 * e ruído comercial) com os masters da MESMA plataforma. Casou: usa o master existente, nunca cria outro.
 */
const RUIDO_GAMES = /\b(?:playstation ?[45]|ps ?[45]|xbox series [xs]?|xbox one|nintendo switch 2|nintendo switch|switch 2|switch|midia fisica|fisico|lacrado|novo|edicao padrao|standard edition|padrao|para|jogo|game)\b/g;
export const chaveSimplesGame = (titulo: string): string => foldTitle(titulo).replace(RUIDO_GAMES, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const gamesCache = new Map<string, { em: number; itens: Array<{ id: string; chave: string; aprovado: boolean }> }>();
async function acharGameMasterPorChave(client: Sql, titulo: string, gen: string): Promise<{ id: string; aprovado: boolean } | null> {
  const k = chaveSimplesGame(titulo);
  if (k.length < 4 || !gen || gen === 'unknown') return null;
  let c = gamesCache.get(gen);
  if (!c || Date.now() - c.em > TTL_MS) {
    const rows = await client<{ id: string; name: string; v: string | null; manual: string | null }[]>`
      select id::text as id, name, attributes->'catalogGate'->>'verdict' as v, attributes->'catalogGate'->>'manual' as manual
      from master_products where vertical = 'games' and game_platform_gen = ${gen} and (attributes ->> 'mergedInto') is null`;
    c = { em: Date.now(), itens: rows.filter((r) => r.v !== 'rejected' && r.manual !== 'rejected').map((r) => ({ id: r.id, chave: chaveSimplesGame(r.name), aprovado: r.manual === 'approved' || !r.v || r.v === 'approved' })) };
    gamesCache.set(gen, c);
  }
  const hit = c.itens.find((x) => x.chave === k);
  return hit ? { id: hit.id, aprovado: hit.aprovado } : null;
}

async function masterAprovado(masterId: string): Promise<boolean> {
  const r = await db.execute<{ ok: boolean }>(sql`SELECT (${masterAprovadoSql('m')}) AS ok FROM master_products m WHERE m.id = ${masterId}::uuid LIMIT 1`);
  return r[0]?.ok === true;
}

/** Marca a origem Amazon no master criado pelos caminhos da Shopee (que gravam `shopeeCriacao`). */
async function marcarOrigemAmazon(masterId: string, asin: string, runTag: string): Promise<void> {
  await db.execute(sql`UPDATE master_products SET attributes = (attributes - 'shopeeCriacao') || jsonb_build_object('amazonCriacao', jsonb_build_object('asin', ${asin}::text, 'run', ${runTag}::text, 'em', now()::text)) WHERE id = ${masterId}::uuid`);
}

async function criarRascunho(netId: string, masterId: string, vertical: Vertical, c: AmzCand, price: number, tag: string): Promise<string> {
  const [o] = await db.insert(affiliateOffers).values({
    masterProductId: masterId, vertical, networkId: netId, title: String(c.t).slice(0, 200),
    slug: slugify(`${c.t}-amazon-${randomUUID().slice(0, 6)}`), affiliateUrl: `https://www.amazon.com.br/dp/${c.a}?tag=${tag}`, affiliateLinkPending: false,
    imageUrl: safeAmazonImage(c.i), storeName: 'Amazon', externalRef: `amazon-${c.a}`, currentPriceCents: 0,
    status: 'draft', publishedAt: null, lastCheckedAt: new Date(),
  }).returning({ id: affiliateOffers.id });
  await recordPriceSnapshot({ offerId: o.id, priceCents: price, listPriceCents: parseBrl(c.l), source: 'scrape' });
  await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now() WHERE id = ${o.id}`);
  return o.id;
}

const bump = (s: VitrineStats, k: string) => { s.descartados[k] = (s.descartados[k] ?? 0) + 1; };

export async function ingestAmazonVitrine(rows: AmzRow[], opts: { tag: string; apply: boolean; deadlineMs?: number; consultaFixa?: VitrineQuery }): Promise<{ stats: VitrineStats }> {
  const [net] = await db.select().from(affiliateNetworks).where(eq(affiliateNetworks.slug, 'amazon')).limit(1);
  if (!net) throw new Error('rede amazon não existe');
  const client = (db as unknown as { $client: Sql }).$client;
  const runTag = `vitrine-${new Date().toISOString().slice(0, 16)}`;
  const s: VitrineStats = { linhas: 0, cartoes: 0, atualizados: 0, ja_fresco: 0, delegados: 0, rascunhos_novos: 0, masters_novos: 0, descartados: {}, erros: 0, truncado: false, criados: { masters: [], ofertas: [] }, ingest: null };
  const delegar: AmzRow[] = [];
  const vistos = new Set<string>();
  const limite = Date.now() + (opts.deadlineMs ?? 50_000);

  for (const row of rows) {
    const consulta = vitrineQueryById(row.id) ?? (opts.consultaFixa && opts.consultaFixa.id === row.id ? opts.consultaFixa : undefined);
    if (!consulta) { bump(s, 'consulta_desconhecida'); continue; }
    s.linhas++;
    for (const raw of (row.r ?? []).slice(0, 10)) {
      if (Date.now() > limite) { s.truncado = true; break; }
      const c = raw && typeof raw === 'object' ? { ...raw, t: String(raw.t ?? '').slice(0, 300) } : null;
      if (!c || typeof c.a !== 'string') { bump(s, 'cartao_invalido'); continue; }
      s.cartoes++;
      if (c.s) { bump(s, 'patrocinado'); continue; }
      const price = parseBrl(c.p);
      if (!price || price <= 0) { bump(s, 'sem_preco'); continue; }
      if (vistos.has(c.a)) { bump(s, 'asin_repetido_no_lote'); continue; }
      vistos.add(c.a);
      try {
        const ref = `amazon-${c.a}`;
        const [ex] = await db.select({ id: affiliateOffers.id, master: affiliateOffers.masterProductId, status: affiliateOffers.status })
          .from(affiliateOffers).where(and(eq(affiliateOffers.networkId, net.id), eq(affiliateOffers.externalRef, ref))).limit(1);
        if (ex) {
          // ASIN conhecido: só atualiza o preço (identidade já julgada). Preço absurdo vs referências fica de fora, como no resto da coleta.
          if (ex.status === 'archived') { bump(s, 'asin_arquivado'); continue; }
          const refs = await getMasterReferencePrices(ex.master, '00000000-0000-0000-0000-000000000000');
          if (isImplausiblyLow(price, refs) || isImplausiblyHigh(price, refs)) { bump(s, 'preco_implausivel'); continue; }
          if (!opts.apply) { s.atualizados++; continue; }
          await recordPriceSnapshot({ offerId: ex.id, priceCents: price, listPriceCents: parseBrl(c.l), source: 'scrape' });
          const img = safeAmazonImage(c.i);
          await db.execute(sql`UPDATE affiliate_offers SET last_checked_at = now(), last_price_confirmed_at = now(), image_url = COALESCE(${img}, image_url) WHERE id = ${ex.id}`);
          s.atualizados++;
          continue;
        }

        // ASIN novo: acha o master equivalente (dedup) ou cria em REVISÃO.
        let masterId: string | null = null;
        let podeAtivar = false;
        let novo = false;
        if (consulta.vertical === 'games') {
          const m = await casarJogo(client, c.t, price, { formatoPadrao: 'physical' });
          if ('motivo' in m) { bump(s, `games:${m.motivo}`); continue; }
          if ('masterId' in m) { masterId = m.masterId; podeAtivar = m.aprovado; }
          else {
            const dup = await acharGameMasterPorChave(client, m.novo.titulo, String(m.novo.classified.gamePlatformGen ?? ''));
            if (dup) { masterId = dup.id; podeAtivar = dup.aprovado; }
          }
          if (!masterId && 'novo' in m) {
            if (!opts.apply) { s.masters_novos++; s.rascunhos_novos++; continue; }
            masterId = await criarMasterGame({ ...m.novo, itemId: c.a, imageUrl: safeAmazonImage(c.i), runId: null });
            await marcarOrigemAmazon(masterId, c.a, runTag);
            podeAtivar = m.novo.aprovado; novo = true;
          }
        } else {
          if (!ehLojaPlus(consulta.vertical)) { bump(s, 'loja_sem_criacao_de_produto'); continue; }
          const indice = await indiceDe(client, consulta.vertical);
          const dec = decidirMasterNovo(consulta.vertical, { titulo: c.t, priceCents: price, hasImage: !!safeAmazonImage(c.i) }, await marcasConhecidas(client), indice);
          if (dec.acao === 'descartar') { bump(s, `novo:${dec.motivo}`); continue; }
          if (dec.acao === 'anexar') { masterId = dec.masterId; podeAtivar = dec.oferta === 'ativa'; }
          else {
            if (!opts.apply) { s.masters_novos++; s.rascunhos_novos++; continue; }
            masterId = await criarMasterPlus(client, dec.proposta, { imageUrl: safeAmazonImage(c.i), itemId: c.a, sugestao: dec.sugestaoPorteiro, motivo: dec.motivo, runId: null });
            indice.adicionar(dec.proposta, masterId);
            await marcarOrigemAmazon(masterId, c.a, runTag);
            podeAtivar = false; novo = true; // master novo: sempre em revisão; a oferta fica em rascunho
          }
        }
        if (!masterId) continue;
        if (novo) { s.masters_novos++; s.criados.masters.push(masterId); }
        // Master aprovado e identidade forte: o julgamento da Amazon (mesmas réguas da busca por master) decide ativa x rascunho.
        if (podeAtivar && !novo && (consulta.vertical === 'games' || (await masterAprovado(masterId).catch(() => false)))) { // games: o veredito do porteiro gamer já veio de casarJogo (sem veredito = aprovado)
          delegar.push({ id: masterId, q: consulta.q, r: [c as AmzCand] });
          s.delegados++;
          continue;
        }
        if (!opts.apply) { s.rascunhos_novos++; continue; }
        const offerId = await criarRascunho(net.id, masterId, consulta.vertical, c as AmzCand, price, opts.tag);
        s.rascunhos_novos++; s.criados.ofertas.push(offerId);
        if (!novo) {
          await enfileirarDuvidaAmazon(db, { offerId, masterId, masterNome: c.t.slice(0, 160), vertical: consulta.vertical, asin: c.a, titulo: c.t, motivo: 'vitrine:master_em_revisao_ou_chave_fraca', fronteira: false, score: 0.5 }).catch(() => false);
        }
      } catch (e) {
        s.erros++;
        console.error('[amazon-vitrine] cartão falhou', c.a, e instanceof Error ? e.message : e);
      }
    }
    if (s.truncado) break;
  }

  if (delegar.length && opts.apply) {
    const { stats } = await ingestAmazonRows(delegar, { tag: opts.tag, apply: true });
    s.ingest = { novos: stats.novos, atualizados: stats.atualizados, rascunhos_novos: stats.rascunhos_novos, rascunhos_atualizados: stats.rascunhos_atualizados, aceitos: stats.aceitos };
  }
  return { stats: s };
}

/**
 * Descoberta por promoção: cards de games sem oferta nossa viram master em revisão + rascunho (mesmas travas da vitrine: preço lido, não patrocinado,
 * porteiro de games, dedup antes de criar). `apply:false` só conta (dry-run).
 */
export async function descobrirPelaPromocao(cards: readonly CardPromoNovo[], opts: { tag: string; apply: boolean }): Promise<VitrineStats> {
  const lote = cards.slice(0, 100);
  if (!lote.length) return { linhas: 0, cartoes: 0, atualizados: 0, ja_fresco: 0, delegados: 0, rascunhos_novos: 0, masters_novos: 0, descartados: {}, erros: 0, truncado: false, criados: { masters: [], ofertas: [] }, ingest: null };
  const { stats } = await ingestAmazonVitrine([linhaDaPromocao(lote)], { tag: opts.tag, apply: opts.apply, consultaFixa: PROMO_DESCOBERTA_QUERY, deadlineMs: 40_000 });
  return stats;
}

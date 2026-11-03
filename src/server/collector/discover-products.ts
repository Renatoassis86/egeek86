import 'server-only';
import { entryGateAttributes, isRejectedByGate } from '@/lib/catalog/gate';
import type { ProductType } from '@/db/schema';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql, TransactionRollbackError } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts, systemConfig } from '@/db/schema';
import type { GamePlatformGen } from '@/db/schema';
import { getValidAccessToken } from './sources/mercado-livre-auth';
import { classifyFromAttributes, resolveMeliCategoryProductType, type MeliAttribute } from './sources/mercado-livre-classify';
import { normalizeGamePlatformGen, resolveGameFormat } from '@/lib/affiliate/game-classification';
import { slugify } from '@/lib/slugify';
import { isPartOrPackagingTitle } from '@/lib/affiliate/product-type-classifier';
import { mapWithConcurrency } from '@/lib/concurrency';
import { recordPriceSnapshot } from './record-price-snapshot';
import { getMasterReferencePrices } from './price-plausibility';
import {
  attachPriceVerdict,
  buildNewMasterAttributes,
  discoveryDoubts,
  medianOf,
  resolveLimits,
  type DiscoveryLimits,
  type KindSource,
} from './discover-policy';

const PLATFORM_TERMS = ['nintendo switch', 'nintendo switch 2', 'ps4', 'ps5', 'xbox one', 'xbox series', 'xbox 360'];

/** '' = termo genérico "jogo {plataforma}" (cobre o buy box mais popular); o resto amplia a cobertura pra além da primeira página de resultado mais óbvia. */
const GENRE_MODIFIERS = [
  '',
  'rpg',
  'aventura',
  'ação',
  'corrida',
  'luta',
  'terror',
  'esporte',
  'plataforma',
  'simulador',
  'indie',
  'multiplayer',
];

interface SearchTerm {
  term: string;
  kind: 'game' | 'console' | 'accessory';
  /** Usado quando kind='console'/'accessory' com plataforma conhecida — já sabemos pelo termo de busca, não precisa inferir de atributo. */
  platform?: GamePlatformGen;
}

/**
 * Matriz plataforma × gênero (6 × 12 = 72 termos) — muito mais cobertura de
 * catálogo que uma lista fixa curta, sem precisar de lista de franquia
 * mantida à mão (que ficaria sempre incompleta/desatualizada).
 */
const GAME_SEARCH_TERMS: SearchTerm[] = PLATFORM_TERMS.flatMap((platform) =>
  GENRE_MODIFIERS.map((genre) => ({
    term: `jogo ${platform}${genre ? ` ${genre}` : ''}`.trim(),
    kind: 'game' as const,
  }))
);

/** Franquias e títulos clássicos/retrô para busca direta garantida no catálogo do Mercado Livre. */
const FRANCHISE_SEARCH_TERMS: SearchTerm[] = [
  { term: 'turok nintendo switch', kind: 'game' },
  { term: 'turok ps4', kind: 'game' },
  { term: 'turok xbox', kind: 'game' },
  { term: 'zelda nintendo switch', kind: 'game' },
  { term: 'mario nintendo switch', kind: 'game' },
  { term: 'pokemon nintendo switch', kind: 'game' },
  { term: 'metroid nintendo switch', kind: 'game' },
  { term: 'castlevania nintendo switch', kind: 'game' },
  { term: 'resident evil ps5', kind: 'game' },
  { term: 'silent hill ps5', kind: 'game' },
  { term: 'final fantasy ps5', kind: 'game' },
  { term: 'god of war ps5', kind: 'game' },
  { term: 'gta 5 ps5', kind: 'game' },
  { term: 'elden ring ps5', kind: 'game' },
  { term: 'cyberpunk ps5', kind: 'game' },
  { term: 'mortal kombat 1 ps5', kind: 'game' },
  { term: 'street fighter 6 ps5', kind: 'game' },
  { term: 'tekken 8 ps5', kind: 'game' },
  { term: 'halo xbox series', kind: 'game' },
  { term: 'forza xbox series', kind: 'game' },
  { term: 'hollow knight nintendo switch', kind: 'game' },
];

/** Console em si (hardware), não jogo — plataforma já é conhecida pelo termo, sem precisar de classifyFromAttributes. */
const CONSOLE_SEARCH_TERMS: SearchTerm[] = [
  { term: 'console playstation 5', kind: 'console', platform: 'ps5' },
  { term: 'console playstation 4', kind: 'console', platform: 'ps4' },
  { term: 'console xbox series x', kind: 'console', platform: 'xbox_series' },
  { term: 'console xbox one', kind: 'console', platform: 'xbox_one' },
  { term: 'console xbox 360', kind: 'console', platform: 'xbox_360' },
  { term: 'console nintendo switch 2', kind: 'console', platform: 'switch_2' },
  { term: 'console nintendo switch', kind: 'console', platform: 'switch_1' },
];

/**
 * Escopo do catálogo pedido pelo usuário (2026-07-17): jogo, console,
 * joystick/controle avulso, e tecnologia ligada à experiência de jogo —
 * nada de acessório genérico de montagem/proteção (suporte de parede, capa,
 * skin etc — ver NON_PRODUCT_KEYWORDS abaixo, que filtra esse ruído).
 */
const ACCESSORY_SEARCH_TERMS: SearchTerm[] = [
  { term: 'controle dualsense ps5', kind: 'accessory', platform: 'ps5' },
  { term: 'controle ps4', kind: 'accessory', platform: 'ps4' },
  { term: 'controle xbox series', kind: 'accessory', platform: 'xbox_series' },
  { term: 'controle xbox one', kind: 'accessory', platform: 'xbox_one' },
  { term: 'joy-con nintendo switch', kind: 'accessory', platform: 'switch_1' },
  { term: 'joystick pc gamer', kind: 'accessory' },
  { term: 'headset gamer', kind: 'accessory' },
  { term: 'cadeira gamer', kind: 'accessory' },
  { term: 'mouse gamer', kind: 'accessory' },
  { term: 'teclado mecanico gamer', kind: 'accessory' },
  { term: 'volante gamer', kind: 'accessory' },
];

/**
 * Ruído recorrente na busca textual do Mercado Livre pra termo de
 * console/acessório: monte/proteção/capa não é o produto em si, é algo QUE
 * VESTE o produto — nunca deve virar item de catálogo aqui.
 */
// `\bpalavra\b` (fronteira de palavra nos dois lados) nunca bate com o
// plural em português — "quadro" != "quadros" pro regex, porque não existe
// fronteira de palavra entre o "o" e o "s". Bug real que deixou "Quadros
// Decorativos..." passar pelo filtro, já que título de anúncio real quase
// sempre vem no plural. Todo termo que plausivelmente aparece no plural usa
// `s?` antes do `\b` final.
const NON_PRODUCT_KEYWORDS = [
  /suporte/i,
  /\bparedes?\b/i,
  /\bcapas?\b/i,
  /\bcases?\b/i,
  /\bskins?\b/i,
  /prote[cç][aã]o/i,
  /pel[ií]cula/i,
  /\badesivos?\b/i,
  /\bbolsas?\b/i,
  /\bmochilas?\b/i,
  /base de carregamento/i,
  // Peça de reposição/troca de aparência do hardware — "veste" o console,
  // não é o console (pedido explícito do cliente, 2026-07-29, após ver uma
  // "Tampa Do Console Playstation 5" listada como se fosse o console em si).
  /\btampas?\b/i,
  /transformador/i,
  /ventilador/i,
  /ac adapter/i,
  /adaptador de (?:energia|tomada|corrente)/i,
  /fonte de alimenta[cç][aã]o/i,
  /carregador de parede/i,
  /porta[\s-]?(?:console|cart[uú]cho)/i,
  // Item de merchandising/novidade que só referencia o produto de jogo, mas
  // não é usado pra jogar (chaveiro, miniatura, réplica de exibição, pelúcia,
  // boneco avulso) — pedido explícito do cliente: só entra item de jogo em
  // si ou que melhore a experiência de jogo, não colecionável decorativo.
  /chaveiro/i,
  /porta.?chaves/i,
  /\bminiatura/i,
  /\br[eé]plicas?\b/i,
  /pel[uú]cia/i,
  /\bbonecos?\b/i,
  /caneca/i,
  /camiseta/i,
  /moletom/i,
  /\bquadros?\b/i,
  /lumin[aá]ria/i,
  /almofada/i,
  /copo/i,
  /garrafa/i,
  /action.?figure/i,
  /funko/i,
  /est[aá]tua/i,
  /busto/i,
  /luminoso/i,
  /poster/i,
  /cartaz/i,
  /caneta/i,
  /caderno/i,
  /agenda/i,
  /estojo/i,
  // Achado real (2026-07-31): "Facas Ka-bar 7511 Jarosz Camp Turok" (faca de
  // merchandising licenciado) entrou no catálogo como se fosse o jogo Turok —
  // faca/canivete/punhal nunca é item de jogo nem acessório que melhora a
  // experiência de jogo, é objeto colecionável licenciado (mesma classe do
  // chaveiro/réplica/estátua acima).
  /\bfacas?\b/i,
  /canivetes?/i,
  /\bpunhal(?:is)?\b/i,
  // Achado real (2026-07-31): 18 amiibo (estatueta NFC colecionável)
  // catalogados como productType='game' — é figura/colecionável, mesma
  // classe de item que chaveiro/miniatura/action-figure/funko acima, mesmo
  // com a função de desbloquear conteúdo via NFC não ser "jogo" em si.
  /amiibo/i,
  // Achado real (2026-08-02): descoberta da Shopee trouxe "Placa decorativa
  // PS5 GTA VI...", "Placa Não Perturbe GTA 6 para Porta..." (placa/quadro
  // de decoração, não o jogo) e "Mouse pad Elden Ring..." (desce de mesa,
  // não melhora a jogabilidade como um mouse de verdade melhora — mesma
  // classe do estojo/almofada acima). `\bpad\b` sozinho pegaria "gamepad"
  // de verdade, por isso o regex exige "mouse" logo antes.
  /\bplacas?\s+(?:decorativ|n[aã]o perturbe)/i,
  /mouse\s*pads?\b/i,
  /decora[çc][aã]o/i,
  /decorativ[oa]s?\b/i,
  /colecion[aá]vel/i,
  /\btric[oô]\b/i,
  // Achado real (2026-08-03): "5 molduras decorativas Zelda...", "Pingente
  // de prata 925... Controle XBox" (joia em formato de controle) e "Febre
  // do tênis de Mario" (tênis licenciado) — mesma classe de merchandising
  // colecionável/decorativo das entradas acima, não é jogo nem acessório
  // que melhora a experiência de jogo.
  /\bmoldura/i,
  /\bpingente/i,
  /\bt[eê]nis\b/i,
  /\bsapat/i,
  // Achado real (2026-08-03): varredura da franquia Zelda achou "Interruptor
  // Nintendo Zelda..." (espelho de tomada decorativo), "Lancheira Zelda
  // Metal...", "Nintendo Estuche Game Traveler...", "Licença Hori Bag
  // (Zelda)", "Guarda-chuva Nintendo Zelda", "Símbolo... Key Ring", "Livro -
  // The Legend Of Zelda..." e "...De Caixas Protetoras" — todos merchandising
  // ou proteção/transporte, mesma classe das entradas acima (capas/estojo/
  // proteção já cobrem o conceito, esses são só variações de palavra que
  // escapavam, inclusive em espanhol/inglês, comuns em anúncio da Shopee).
  /\binterruptor(?:es)?\b/i,
  /\blancheiras?\b/i,
  /\bestuche/i,
  /\bbags?\b/i,
  /guarda.?chuvas?/i,
  /key\s*ring/i,
  /\blivros?\b/i,
  /protetor(?:a|as|es)?\b/i,
  // Achado real (2026-08-03): "King - Tekken 8 - S.h.figuarts - Bandai",
  // "Kazuya Mishima - S.h.figuarts..." — S.H.Figuarts é linha de action
  // figure colecionável da Bandai, mesma classe de "action figure"/"funko"
  // acima. "The Art Of God Of War Ragnarok" é artbook (livro de arte
  // conceitual), sem a palavra "livro" mas mesma classe de merchandising.
  /figuarts/i,
  /\bthe art of\b/i,
  /\bartbook\b/i,
];

/**
 * Marcador de item usado/seminovo NO TÍTULO — pedido explícito do cliente
 * (2026-07-24, reforçando a decisão de 2026-07-18 em mercado-livre.ts):
 * Geek Deals só cataloga item NOVO, nunca usado/seminovo/recondicionado.
 * O Mercado Livre expõe `condition` estruturado (checado à parte, mais
 * confiável), mas a Shopee (busca pública, sem API oficial aprovada ainda)
 * não tem esse campo — o único sinal disponível é o próprio título do
 * anúncio (ex: "Jogo Elden Ring - PS5 (Usado)"), por isso o filtro textual
 * aqui serve tanto de sinal único (Shopee) quanto de reforço (Mercado
 * Livre, caso o campo estruturado venha ausente nalgum resultado).
 */
const USED_CONDITION_PATTERNS = [
  // Open Box é condição própria (decisão do dono, 2026-11-03): fora da cesta de novos.
  /\bopen.?box\b/i,
  /refurbished/i,
  /\busados?\b/i,
  /\busadas?\b/i,
  /semi.?novos?\b/i,
  /semi.?novas?\b/i,
  /recondicionados?\b/i,
  /recondicionadas?\b/i,
  /\bsegunda.?m[aã]o\b/i,
];

export function isUsedCondition(title: string): boolean {
  return USED_CONDITION_PATTERNS.some((re) => re.test(title));
}

const GAME_TITLE_PATTERNS = [
  /\bjogo\b/i,
  /\bgames?\b/i,
  /f[ií]sico/i,
  /m[ií]dia/i,
  /resident evil/i,
  /madden/i,
  /zelda/i,
  /mario/i,
  /gta/i,
  /fifa/i,
  /call of duty/i,
  /god of war/i,
  /cyberpunk/i,
  /elden ring/i,
  /final fantasy/i,
  /red dead/i,
  /pok[eé]mon/i,
  /assassin/i,
  /halo/i,
  /forza/i,
  /gran turismo/i,
  /spider-?man/i,
  /batman/i,
  /the last of us/i,
  /uncharted/i,
];

export function isGameTitleOrMedia(title: string): boolean {
  return GAME_TITLE_PATTERNS.some((re) => re.test(title));
}

export function isNonProductAccessory(title: string): boolean {
  // Porteiro único do catálogo (src/lib/catalog/gate.ts): não original / fora do escopo / usado não entram.
  return NON_PRODUCT_KEYWORDS.some((re) => re.test(title)) || isPartOrPackagingTitle(title) || isRejectedByGate(title);
}

/**
 * Não processamos tudo isso numa execução só (ver TERMS_PER_RUN abaixo) —
 * roda em rotação, um pedaço por vez, ao longo do dia.
 */
const SEARCH_TERMS: SearchTerm[] = [...FRANCHISE_SEARCH_TERMS, ...GAME_SEARCH_TERMS, ...CONSOLE_SEARCH_TERMS, ...ACCESSORY_SEARCH_TERMS];

/**
 * Quantos termos por execução.
 */
const TERMS_PER_RUN = 10;

/**
 * /products/search (API oficial de catálogo): limit máx 100 e offset máx 100,
 * ou seja, no máximo 200 resultados por termo (medido, ver
 * docs/plano-expansao-tecnologia-2026-10-31.md seção 2.2).
 */
const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 2;

/**
 * ~75-85% dos produtos de catálogo não têm oferta ativa (/products/{id}/items
 * responde 404). Cada candidato novo exige uma sonda de preço antes de virar
 * master_product, então o teto de sondas por termo limita o custo de API
 * (cota do app desconhecida; 429 já observado em rajada). Candidatos já
 * cadastrados não gastam sonda.
 */
const MAX_PROBES_PER_TERM = 60;

const CURSOR_CONFIG_KEY = 'discover_products_cursor';

interface MeliSearchResult {
  id: string;
  name: string;
  attributes: MeliAttribute[];
  pictures?: { url: string }[];
  /** "new" | "used" — Mercado Livre retorna isso por resultado de busca. Ausente (undefined) = resultado do catálogo buy-box, que por definição já é sempre item novo. */
  condition?: string | null;
  /** /products/search não devolve category_id (só domain_id); quando ausente, a classificação cai pro título/classificador. */
  category_id?: string | null;
}

/** Item que o dry-run cadastraria (nada é gravado). */
export interface DiscoveryPreviewItem {
  catalogId: string;
  title: string;
  platform: string;
  productType: string;
  /** Cadastraria master_product novo, ou anexaria a um já existente (dedup por título+plataforma). */
  action: 'create_master' | 'attach_to_existing_master';
  existingMasterId?: string;
  sellers: number;
  bestPriceCents: number;
  /** Só para create_master: como o master NASCERIA (approved = visível, review = invisível até conferência). */
  bornAs?: 'approved' | 'review';
  gateReason?: string;
  doubts?: string[];
}

/** Candidato descartado, com o motivo (só preenchido no dry-run, amostra limitada). */
export interface DiscoverySkipSample {
  catalogId: string;
  title: string;
  reason: string;
}

export interface DiscoverProductsSummary {
  termsSearched: number;
  totalTerms: number;
  cursorStart: number;
  found: number;
  alreadyExisted: number;
  created: number;
  /** Candidatos novos sem nenhum vendedor ativo novo em /products/{id}/items — não viram master_product. */
  skippedNoOffers: number;
  /** Candidatos novos que ficaram sem sonda por causa de MAX_PROBES_PER_TERM (reaparecem em rotações futuras). */
  skippedProbeCap: number;
  dryRun: boolean;
  preview: DiscoveryPreviewItem[];
  errors: { term: string; message: string }[];
  /** Contagem de descartes por motivo (sempre preenchido). */
  skipReasons: Record<string, number>;
  /** Amostra de descartes com título (só dry-run). */
  skipSamples: DiscoverySkipSample[];
  /** Masters novos que nasceram em review / aprovados (no dry-run: simulados). */
  bornReview: number;
  bornApproved: number;
  createdMasterIds: string[];
  limits: DiscoveryLimits;
  /** Por que a execução parou antes de percorrer todos os termos (rate limit, tempo). */
  stoppedReason: string | null;
  elapsedMs: number;
}

/** GET autenticado na API oficial com 1 retry em 429 (respeita Retry-After, teto 5s). */
async function meliGet(url: string, accessToken: string): Promise<Response> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  let res = await fetch(url, { headers });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500, 5000);
    await new Promise((r) => setTimeout(r, waitMs + Math.floor(Math.random() * 300)));
    res = await fetch(url, { headers });
  }
  return res;
}

/** Busca no catálogo oficial (/products/search), até 200 resultados, sem repetir id. */
async function searchCatalog(term: string, accessToken: string): Promise<MeliSearchResult[]> {
  const byId = new Map<string, MeliSearchResult>();
  for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
    const res = await meliGet(
      `https://api.mercadolibre.com/products/search?site_id=MLB&status=active&q=${encodeURIComponent(term)}&limit=${SEARCH_PAGE_SIZE}&offset=${page * SEARCH_PAGE_SIZE}`,
      accessToken
    );
    if (!res.ok) {
      // Primeira página falhando = erro real do termo; segunda = só para.
      if (page === 0) throw new Error(`/products/search HTTP ${res.status}`);
      break;
    }
    const data = (await res.json()) as { results?: MeliSearchResult[] };
    const batch = data.results ?? [];
    for (const r of batch) if (r?.id && r.name && !byId.has(r.id)) byId.set(r.id, r);
    if (batch.length < SEARCH_PAGE_SIZE) break;
  }
  return Array.from(byId.values());
}

/**
 * Sonda oficial de preço (/products/{id}/items): vendedores com item NOVO,
 * um preço por vendedor (o anúncio mais barato; desempate pelo item id —
 * mesma regra de collapseBySeller em collect-prices.ts). Lança em falha de
 * API (≠404) para o chamador não confundir "API caiu" com "sem oferta".
 */
async function probeSellerPrices(
  catalogId: string,
  accessToken: string
): Promise<{ sellerId: string; itemId: string; priceCents: number; listPriceCents: number | null }[]> {
  const res = await meliGet(`https://api.mercadolibre.com/products/${catalogId}/items`, accessToken);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`/products/${catalogId}/items HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: { item_id: string; price: number; original_price: number | null; seller_id: number; condition: string | null }[];
  };
  const bySeller = new Map<string, { sellerId: string; itemId: string; priceCents: number; listPriceCents: number | null }>();
  for (const r of data.results ?? []) {
    if (r.seller_id == null || r.item_id == null || r.condition !== 'new' || !(r.price > 0)) continue;
    const priceCents = Math.round(r.price * 100);
    const sellerId = String(r.seller_id);
    const cur = bySeller.get(sellerId);
    if (!cur || priceCents < cur.priceCents || (priceCents === cur.priceCents && r.item_id < cur.itemId)) {
      bySeller.set(sellerId, {
        sellerId,
        itemId: r.item_id,
        priceCents,
        listPriceCents: r.original_price != null ? Math.round(r.original_price * 100) : null,
      });
    }
  }
  return Array.from(bySeller.values());
}

/** Lê de onde a rotação parou da última vez — default 0 na primeira execução. */
async function getCursor(): Promise<number> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, CURSOR_CONFIG_KEY)).limit(1);
  const value = row?.value as { index?: number } | undefined;
  return value?.index ?? 0;
}

async function saveCursor(index: number): Promise<void> {
  await db
    .insert(systemConfig)
    .values({
      key: CURSOR_CONFIG_KEY,
      value: { index },
      description: 'Cursor de rotação da busca de descoberta de produtos (discover-products.ts) — evita repetir sempre os mesmos termos a cada execução do cron.',
    })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value: { index }, updatedAt: new Date() } });
}

const LAST_RUN_CONFIG_KEY = 'discover_products_last_run';

/** Resumo da última execução real (system_config; 1 linha, sobrescrita) para auditoria rápida. */
async function saveLastRun(summary: DiscoverProductsSummary): Promise<void> {
  const value = {
    at: new Date().toISOString(),
    cursorStart: summary.cursorStart,
    termsSearched: summary.termsSearched,
    found: summary.found,
    created: summary.created,
    bornReview: summary.bornReview,
    bornApproved: summary.bornApproved,
    alreadyExisted: summary.alreadyExisted,
    skipReasons: summary.skipReasons,
    errors: summary.errors.length,
    stoppedReason: summary.stoppedReason,
    elapsedMs: summary.elapsedMs,
    createdMasterIds: summary.createdMasterIds,
    limits: summary.limits,
  };
  try {
    await db
      .insert(systemConfig)
      .values({ key: LAST_RUN_CONFIG_KEY, value, description: 'Resumo da última execução real da descoberta (discover-products.ts). Auditoria: ver attributes->discovery nos masters.' })
      .onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });
  } catch (e) {
    console.error('discover-products: falha ao gravar discover_products_last_run', (e as Error).message);
  }
}

/**
 * Descobre produto NOVO no catálogo do Mercado Livre e cadastra sozinho,
 * já publicado (status='active') — decisão explícita do usuário
 * (2026-07-17): a vitrine sempre cheia, atualizada sozinha, importa mais
 * que garantir link de afiliado real em 100% dos itens. O link de afiliado
 * que gera comissão de verdade continua exigindo geração manual no painel
 * do Mercado Livre por produto (não existe fórmula de parâmetro pra aplicar
 * em lote) — até o admin trocar (/admin/ofertas/[id]), o item fica no ar
 * com um link honesto pra página pública do produto, sem rastreio de
 * comissão nesse meio-tempo.
 *
 * Processa só uma fatia de SEARCH_TERMS por execução (rotação por cursor
 * persistido em system_config) — com o cron rodando periodicamente, a lista
 * inteira vai sendo coberta ao longo do dia, em vez de martelar sempre os
 * mesmos ~6 termos genéricos como antes.
 *
 * Dedup por catalog_product_id exato (mesmo campo que o cadastro manual usa
 * via master_products.meliCatalogId) — sem correspondência difusa/NLP
 * necessária aqui, já que Mercado Livre sempre retorna o mesmo ID pro mesmo
 * produto canônico, tanto na busca quanto na consulta individual.
 */
interface TermIngestResult {
  found: number;
  created: number;
  alreadyExisted: number;
  createdTitles: string[];
  skippedNoOffers: number;
  skippedProbeCap: number;
  preview: DiscoveryPreviewItem[];
  errors: { term: string; message: string }[];
  skipReasons: Record<string, number>;
  skipSamples: DiscoverySkipSample[];
  bornReview: number;
  bornApproved: number;
  createdMasterIds: string[];
}

function emptyTermResult(): TermIngestResult {
  return {
    found: 0, created: 0, alreadyExisted: 0, createdTitles: [], skippedNoOffers: 0, skippedProbeCap: 0, preview: [], errors: [],
    skipReasons: {}, skipSamples: [], bornReview: 0, bornApproved: 0, createdMasterIds: [],
  };
}

/** Estado compartilhado entre os termos de UMA execução (JS é single-thread: reservar antes do await basta). */
interface RunState {
  newMasters: number;
  deadline: number;
  /** Preenchido quando a execução deve parar (429 persistente, tempo). */
  stop: string | null;
}

function freshRunState(limits: DiscoveryLimits): RunState {
  return { newMasters: 0, deadline: Date.now() + limits.timeBudgetMs, stop: null };
}

/**
 * Busca um termo no Mercado Livre (catálogo buy-box + anúncios abertos) e
 * cadastra o que for produto novo válido — núcleo compartilhado entre a
 * rotação automática (discoverNewProducts, roda vários termos fixos por
 * execução) e a busca manual do admin (triggerManualMeliExtraction, um
 * termo livre digitado na hora). Extraído pra não duplicar a lógica de
 * classificação/link honesto/dedup em dois lugares.
 */
async function searchAndIngestTerm(
  searchTerm: SearchTerm,
  network: { id: string },
  accessToken: string,
  options: { dryRun?: boolean; limits?: DiscoveryLimits; state?: RunState } = {}
): Promise<TermIngestResult> {
  const dryRun = options.dryRun === true;
  const limits = options.limits ?? resolveLimits();
  const state = options.state ?? freshRunState(limits);
  const result = emptyTermResult();
  let results: MeliSearchResult[] = [];
  let probesUsed = 0;
  let consecutiveProbeErrors = 0;
  const skip = (item: MeliSearchResult, reason: string) => {
    result.skipReasons[reason] = (result.skipReasons[reason] ?? 0) + 1;
    if (dryRun && result.skipSamples.length < 400) result.skipSamples.push({ catalogId: item.id, title: item.name, reason });
  };
  if (state.stop) return result;

  try {
    // Só API oficial de catálogo. /sites/MLB/search (busca aberta) devolve
    // 403 desde 2026-07-29 e foi removida; /items/{id} de terceiros também é
    // bloqueado. Consequência: anúncio sem catalog_product_id não é
    // descobrível (limite conhecido).
    results = await searchCatalog(searchTerm.term, accessToken);
    result.found = results.length;
  } catch (err) {
    result.errors.push({ term: searchTerm.term, message: (err as Error).message });
    // 429 na busca: respeitar a cota e encerrar a execução inteira (o cursor não passa deste trecho).
    if (/HTTP 429/.test((err as Error).message)) state.stop = 'rate_limit_429';
    return result;
  }

  // Try/catch por item: um produto com dado inesperado (ex: hierarquia de
  // variação do catálogo) não deve derrubar o resto dos resultados desse termo.
  // Pré-checagem em LOTE (2 consultas por termo, em vez de 2 por candidato): quem já tem master pelo
  // catalog_product_id ou oferta pelo external_ref sai antes de qualquer outro custo. O índice único e a
  // transação do INSERT continuam sendo a garantia final contra corrida.
  const knownMasterCatalogIds = new Set<string>();
  const knownOfferRefs = new Set<string>();
  if (results.length > 0) {
    try {
      const ids = results.map((r) => r.id);
      const masters = await db.select({ c: masterProducts.meliCatalogId }).from(masterProducts).where(inArray(masterProducts.meliCatalogId, ids));
      for (const m of masters) if (m.c) knownMasterCatalogIds.add(m.c);
      const offers = await db
        .select({ r: affiliateOffers.externalRef })
        .from(affiliateOffers)
        .where(and(eq(affiliateOffers.networkId, network.id), inArray(affiliateOffers.externalRef, ids)));
      for (const o of offers) if (o.r) knownOfferRefs.add(o.r);
    } catch (err) {
      result.errors.push({ term: searchTerm.term, message: `pré-checagem em lote: ${(err as Error).message}` });
      return result;
    }
  }

  // Rotação por hora: sem estado, cada execução começa em um ponto diferente da lista de candidatos. Sem isso, os
  // primeiros ~N candidatos SEM oferta ativa (≈75-85% do catálogo) consumiriam sempre o teto de sondas e os demais
  // nunca seriam alcançados.
  const hourSlot = Math.floor(Date.now() / 3_600_000);
  const pending = results.filter((r) => !knownMasterCatalogIds.has(r.id) && !knownOfferRefs.has(r.id));
  const rot = pending.length ? (hourSlot * 37) % pending.length : 0;
  const ordered = [...pending.slice(rot), ...pending.slice(0, rot)];
  for (const r of results) {
    if (knownMasterCatalogIds.has(r.id)) {
      result.alreadyExisted++;
      skip(r, 'ja_existe_master_por_catalog_id');
    } else if (knownOfferRefs.has(r.id)) {
      result.alreadyExisted++;
      skip(r, 'ja_existe_oferta_por_external_ref');
    }
  }

  for (const item of ordered) {
    if (state.stop) break;
    if (Date.now() > state.deadline) {
      state.stop = 'orcamento_de_tempo';
      break;
    }
    let reservedSlot = false;
    try {
      // Busca textual do Mercado Livre pra termo de console/acessório não é
      // filtro exato — às vezes devolve jogo junto ("Jogo X Para Console
      // Switch"), ou acessório de montagem/proteção que não é o produto em
      // si (suporte de parede, capa, skin). Descarta os dois casos aqui —
      // fora do escopo pedido: jogo, console, joystick/controle avulso,
      // tecnologia de experiência de jogo.
      if (searchTerm.kind !== 'game' && /^jogo\b/i.test(item.name)) {
        skip(item, 'jogo_em_busca_de_console_ou_acessorio');
        continue;
      }
      if (isNonProductAccessory(item.name)) {
        skip(item, 'filtro_titulo_nao_produto_ou_porteiro');
        continue;
      }
      // Só item NOVO — decisão explícita do cliente (2026-07-18, ver
      // mercado-livre.ts), reforçada (2026-07-24): Geek Deals nunca cataloga
      // usado/seminovo, isso fica pra um módulo de segunda-mão futuro à
      // parte. O filtro em mercado-livre.ts só cobre o ciclo de preço de
      // produtos JÁ catalogados — aqui é onde o produto entra no catálogo
      // pela primeira vez, então precisa do mesmo corte. `condition`
      // ausente (resultado do catálogo buy-box) passa — catálogo buy-box é
      // por definição sempre item novo.
      if (item.condition === 'used' || isUsedCondition(item.name)) {
        skip(item, 'usado_ou_open_box');
        continue;
      }

      // (já existe master/oferta: tratado em lote acima; o índice único garante contra corrida)

      const detectedPlatform = normalizeGamePlatformGen(null, item.name);
      const isGameMedia = isGameTitleOrMedia(item.name);

      // Sinal primário: a categoria REAL que o Mercado Livre já atribuiu ao
      // anúncio (ground truth do próprio marketplace) — resolve de forma
      // objetiva casos que uma whitelist de título nunca cobre (ex: "Company
      // of Heroes 3 Edição Console" é jogo, não hardware, mas nenhuma lista
      // de franquia prevê esse nome). Título só entra como reforço quando a
      // categoria não veio ou não deu pra reconhecer.
      const categoryKind = await resolveMeliCategoryProductType(item.category_id);
      // Achado real (2026-07-31): termo de franquia (kind='game', ex: "turok
      // ps4") nunca passava por essa checagem — sem categoria resolvida
      // (categoryKind null, ex: uma categoria de "Facas/Ferramentas" que não
      // bate nem "jogo" nem "acessório" nem "console"), o item virava 'game'
      // só por ter vindo de um termo de busca de jogo, sem NENHUM sinal
      // positivo de que era jogo de verdade. Foi assim que uma faca Ka-Bar
      // de merchandising ("Facas Ka-bar 7511 Jarosz Camp Turok") entrou no
      // catálogo como productType='game'. Agora exige pelo menos um sinal
      // positivo (categoria OU título) antes de assumir 'game' — sem sinal
      // nenhum, `resolvedKind` fica null e o item é descartado abaixo.
      let kindSource: KindSource = 'category';
      let resolvedKind: 'game' | 'console' | 'accessory' | null = categoryKind;
      if (!resolvedKind) {
        if (searchTerm.kind !== 'game') {
          resolvedKind = !isGameMedia ? searchTerm.kind : 'game';
          kindSource = !isGameMedia ? 'term' : 'title';
        } else if (isGameMedia) {
          resolvedKind = 'game';
          kindSource = 'title';
        }
      }

      // Terceiro sinal, só consultado quando os dois primeiros (categoria
      // real do Mercado Livre + heurística de título) ficaram em silêncio —
      // nunca sobrepõe um sinal que já resolveu. Classificador Naive Bayes
      // treinado no próprio catálogo (`npm run train:classifier`,
      // src/lib/affiliate/product-type-classifier.ts) — 91.9% de acurácia
      // real medida em holdout (2026-07-31). Só aceita a previsão acima de
      // 65% de confiança; abaixo disso, mantém o descarte (mais seguro que
      // adivinhar — mesmo espírito da regra "nunca cair em platform=unknown").
      if (!resolvedKind) {
        const { classify: classifyProductType, getProductTypeClassifierModel } = await import('@/lib/affiliate/product-type-classifier');
        const model = await getProductTypeClassifierModel();
        const [topPrediction] = classifyProductType(item.name, model);
        if (topPrediction && topPrediction.probability >= 0.65) {
          resolvedKind = topPrediction.label;
          kindSource = 'classifier';
        }
      }

      if (!resolvedKind) {
        skip(item, 'sem_categoria_titulo_nem_classificador');
        if (!dryRun) result.errors.push({ term: searchTerm.term, message: `${item.id}: descartado — sem categoria reconhecida, título de jogo nem confiança do classificador ("${item.name}")` });
        continue;
      }

      const baseClassification =
        resolvedKind === 'game'
          ? { productType: 'game' as const, ...classifyFromAttributes(item.attributes, item.name) }
          : {
              productType: resolvedKind,
              gameFormat: 'unknown' as const,
              // Busca textual do Mercado Livre pra "console nintendo switch 2"
              // também retorna Switch/Lite (busca solta, não filtro exato) —
              // não dá pra confiar cegamente no termo de busca. Deriva a
              // plataforma de verdade a partir do título de cada resultado;
              // só cai pro termo de busca se o título não deixar claro.
              // Console: SÓ a plataforma do título (a busca "console nintendo switch" traz Wii/DS/3DS/Game Boy; herdar
              // o termo cadastrava console legado como switch_1 — visto no dry-run de 2026-11-03). Acessório pode
              // herdar do termo, mas isso gera dúvida (platformFromTerm) e o master nasce em review.
              gamePlatformGen: detectedPlatform !== 'unknown' ? detectedPlatform : resolvedKind === 'accessory' ? (searchTerm.platform ?? 'unknown') : 'unknown',
              gameEditionType: 'unknown' as const,
              gameEditionSource: null,
              gameCollection: null,
            };

      // Nunca 'unknown' por padrão: se a classificação estruturada não trouxe
      // a plataforma, deriva do título antes de desistir (regra de negócio).
      const classification = {
        ...baseClassification,
        // Formato do JOGO (físico x digital): o título prova; sem prova, o atributo FORMAT do catálogo; nunca chuta.
        gameFormat: resolvedKind === 'game' ? resolveGameFormat(item.name, baseClassification.gameFormat) : baseClassification.gameFormat,
        gamePlatformGen:
          baseClassification.gamePlatformGen !== 'unknown' ? baseClassification.gamePlatformGen : detectedPlatform,
      };

      // Sonda oficial de preço antes de cadastrar: sem vendedor ativo novo
      // não há cotação real, e criar o produto só geraria master morto.
      if (probesUsed >= Math.min(MAX_PROBES_PER_TERM, limits.probesPerTerm)) {
        result.skippedProbeCap++;
        skip(item, 'teto_de_sondas_do_termo');
        continue;
      }
      // Teto de masters novos atingido: encerra a execução (poupa cota da API; o resto fica para a próxima rotação).
      if (state.newMasters >= limits.maxNewMasters) {
        state.stop = state.stop ?? 'teto_de_masters_novos_da_execucao';
        break;
      }
      probesUsed++;
      let sellerPrices: Awaited<ReturnType<typeof probeSellerPrices>>;
      try {
        sellerPrices = await probeSellerPrices(item.id, accessToken);
        consecutiveProbeErrors = 0;
      } catch (probeErr) {
        consecutiveProbeErrors++;
        const msg = (probeErr as Error).message;
        // 429 persistente (já houve 1 retry em meliGet): respeitar a cota e parar a execução inteira.
        if (/HTTP 429/.test(msg)) state.stop = 'rate_limit_429';
        else if (consecutiveProbeErrors >= limits.maxConsecutiveProbeErrors) state.stop = 'erros_consecutivos_de_sonda';
        throw probeErr;
      }
      if (sellerPrices.length === 0) {
        result.skippedNoOffers++;
        skip(item, 'sem_vendedor_novo_ativo');
        continue;
      }
      const bestSeller = sellerPrices.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
      const sellerCents = sellerPrices.map((s) => s.priceCents);

      // Dedup por título+plataforma normalizados (OBRIGATÓRIO antes de cadastrar qualquer master_product).
      // Roda depois da sonda só por custo (varre todos os masters da plataforma); a sonda não depende dele,
      // então o número de chamadas à API é o mesmo de antes.
      const { findExistingMasterProduct } = await import('@/lib/affiliate/dedup');
      const existingBySimilarity = await findExistingMasterProduct(item.name, classification.gamePlatformGen, {
        gameFormat: classification.gameFormat,
        productType: classification.productType,
      });

      // Preço absurdo / isca: ao anexar a master existente, o menor preço precisa caber na faixa real do master
      // (mesma régua do ADR 0002 e da quarentena); sem 2+ referências, aceita.
      if (existingBySimilarity) {
        const refs = await getMasterReferencePrices(existingBySimilarity.id);
        const verdict = attachPriceVerdict(bestSeller.priceCents, refs);
        if (verdict !== 'ok') {
          skip(item, verdict === 'low' ? 'preco_isca_vs_master_existente' : 'preco_absurdo_alto_vs_master_existente');
          continue;
        }
      }

      // Veredito do porteiro com TUDO que a descoberta sabe (tipo resolvido, formato, plataforma, mediana dos
      // vendedores para o piso de plausibilidade). rejected = não cadastra; review = nasce invisível.
      const gateAttrs = entryGateAttributes(item.name, classification.productType, {
        gameFormat: classification.gameFormat,
        gamePlatformGen: classification.gamePlatformGen,
        medianPriceCents: medianOf(sellerCents),
      });
      const gateInfo = gateAttrs.catalogGate as { verdict?: string; reason?: string } | undefined;
      if (gateInfo?.verdict === 'rejected') {
        skip(item, `porteiro_rejeita:${gateInfo.reason ?? 'sem_motivo'}`);
        continue;
      }
      const doubts = existingBySimilarity
        ? []
        : discoveryDoubts({
            kindSource,
            productType: classification.productType as 'game' | 'console' | 'accessory',
            platform: classification.gamePlatformGen,
            gameFormat: classification.gameFormat,
            sellerPricesCents: sellerCents,
            // Plataforma que veio SÓ do termo de busca (o título não a revela): a busca textual do ML não é filtro
            // exato (um "console nintendo switch" traz Wii/DS/3DS), então esse valor não é confiável.
            platformFromTerm: detectedPlatform === 'unknown' && resolvedKind === 'accessory' && !!searchTerm.platform,
          });
      const newAttributes = buildNewMasterAttributes(gateAttrs, doubts, limits.mode, new Date().toISOString());
      const bornAs = (newAttributes.discovery as { bornAs: 'approved' | 'review' }).bornAs;

      if (!existingBySimilarity) {
        // Reserva a vaga ANTES de qualquer await seguinte (os termos rodam em paralelo).
        if (state.newMasters >= limits.maxNewMasters) {
          skip(item, 'teto_de_masters_novos_da_execucao');
          continue;
        }
        state.newMasters++;
        reservedSlot = true;
      }

      if (dryRun) {
        result.preview.push({
          catalogId: item.id,
          title: item.name,
          platform: classification.gamePlatformGen,
          productType: classification.productType,
          action: existingBySimilarity ? 'attach_to_existing_master' : 'create_master',
          existingMasterId: existingBySimilarity?.id,
          sellers: sellerPrices.length,
          bestPriceCents: bestSeller.priceCents,
          ...(existingBySimilarity
            ? {}
            : { bornAs, gateReason: (newAttributes.catalogGate as { reason?: string } | undefined)?.reason ?? 'sem_sinal_de_risco', doubts }),
        });
        continue;
      }

      const offerSlug = slugify(`${item.name}-${item.id.slice(-6)}-${randomUUID().slice(0, 6)}`);

      // Só marca link como definitivo (não pendente) quando MELI_TOOL_ID
      // está de fato configurado com o ID real de afiliado do usuário —
      // "32740986" era um valor fixo no código, nunca configurado via env,
      // e NÃO é o ID de afiliado do usuário (confirmado 2026-07-24). Usar
      // esse ID em todo link publicado arriscava rastrear a comissão pra
      // conta de outra pessoa, não gerar zero comissão. Sem ID real
      // configurado, publica a página normal do produto (sem matt_tool)
      // e marca pendente — mesmo padrão honesto já usado pra Shopee/Magalu
      // e pela extração manual do admin.
      // Achado real (2026-08-02): o parâmetro certo é `matt_tool`, não
      // `matt_tool_id` — confirmado contra um link gerado de verdade no
      // Gerador de Links do Mercado Livre (resolve pra
      // .../p/MLB.../?matt_tool=NUMERO, sem "_id").
      const realToolId = process.env.MELI_TOOL_ID;
      const meliUrl = `https://www.mercadolivre.com.br/p/${item.id}`;
      const offerValues = {
        networkId: network.id,
        title: item.name,
        slug: offerSlug,
        affiliateUrl: realToolId ? `${meliUrl}?matt_tool=${realToolId}` : meliUrl,
        affiliateLinkPending: !realToolId,
        imageUrl: item.pictures?.[0]?.url ?? null,
        externalRef: item.id,
        // Ainda sem preço coletado — o próximo ciclo do coletor de preço preenche o real.
        currentPriceCents: 0,
        status: 'active' as const,
        publishedAt: new Date(),
      };
      // onConflictDoNothing (não só o SELECT acima) é o que de fato impede a
      // duplicata quando dois termos de busca em paralelo (TERM_CONCURRENCY)
      // processam o mesmo item.id ao mesmo tempo — os dois passam pelo SELECT
      // antes de qualquer um commitar o INSERT; só o índice único do banco
      // resolve essa corrida.
      const offerConflict = {
        target: [affiliateOffers.networkId, affiliateOffers.externalRef],
        // Precisa bater exatamente com o predicado do índice parcial
        // (affiliate_offers_network_external_ref_uq) — sem isso o Postgres
        // não reconhece o alvo do conflito. seller_id sempre nulo aqui
        // (placeholder de catálogo, nunca vendedor específico).
        where: sql`${affiliateOffers.externalRef} IS NOT NULL AND ${affiliateOffers.sellerId} IS NULL`,
      };

      let masterProduct;
      let insertedOffer;
      if (existingBySimilarity) {
        masterProduct = existingBySimilarity;
        [insertedOffer] = await db
          .insert(affiliateOffers)
          .values({ ...offerValues, masterProductId: masterProduct.id })
          .onConflictDoNothing(offerConflict)
          .returning({ id: affiliateOffers.id });
      } else {
        // Achado real (2026-07-31): sem transação, uma corrida entre dois
        // termos em paralelo processando o MESMO item.id pela primeira vez
        // podia fazer os dois criarem um master_product novo cada um
        // (nenhum via a inserção do outro ainda) — só o segundo INSERT de
        // oferta perdia pro índice único (onConflictDoNothing devolvia 0
        // linhas), deixando o master_product do "perdedor" órfão pra sempre
        // (zero ofertas, zero preço, zero histórico). 1.086 órfãos assim
        // encontrados no catálogo existente (achado real 2026-07-31, maior
        // parte concentrada num único dia — 753 num só lote). Envolve os
        // dois INSERTs numa transação: se a oferta perder a corrida, a
        // criação do master_product é desfeita junto (tx.rollback()).
        const baseSlug = slugify(item.name);
        const [collision] = await db
          .select({ id: masterProducts.id })
          .from(masterProducts)
          .where(eq(masterProducts.slug, baseSlug))
          .limit(1);
        const productSlug = collision ? slugify(`${item.name}-${item.id.slice(-6)}`) : baseSlug;

        const txResult = await db
          .transaction(async (tx) => {
            const [created] = await tx
              .insert(masterProducts)
              .values({
                name: item.name,
                slug: productSlug,
                meliCatalogId: item.id,
                defaultImages: item.pictures?.map((p) => p.url) ?? [],
                ...classification,
                attributes: newAttributes,
                classifiedAt: new Date(),
              })
              .returning();
            const [offer] = await tx
              .insert(affiliateOffers)
              .values({ ...offerValues, masterProductId: created.id })
              .onConflictDoNothing(offerConflict)
              .returning({ id: affiliateOffers.id });
            if (!offer) tx.rollback();
            return { masterProduct: created, offer };
          })
          .catch((e) => {
            if (e instanceof TransactionRollbackError) return null;
            throw e;
          });

        if (!txResult) {
          // Perdemos a corrida — o item já está catalogado pela iteração
          // concorrente que venceu; nada a criar aqui.
          state.newMasters--; // devolve a vaga reservada
          reservedSlot = false;
          result.alreadyExisted++;
          continue;
        }
        reservedSlot = false;
        result.createdMasterIds.push(txResult.masterProduct.id);
        if (bornAs === 'review') result.bornReview++;
        else result.bornApproved++;
        masterProduct = txResult.masterProduct;
        insertedOffer = txResult.offer;
      }

      if (insertedOffer) {
        // Cotação inicial real do placeholder = menor preço entre os
        // vendedores. recordPriceSnapshot só grava se o preço mudou (ou é o
        // primeiro). As ofertas por vendedor (uma por vendedor, anúncio mais
        // barato) são criadas pelo collect-prices no próximo ciclo.
        await recordPriceSnapshot({
          offerId: insertedOffer.id,
          priceCents: bestSeller.priceCents,
          listPriceCents: bestSeller.listPriceCents,
          source: 'api',
        });
        result.created++;
        result.createdTitles.push(item.name);
      } else {
        result.alreadyExisted++;
      }
    } catch (err) {
      if (reservedSlot) state.newMasters--; // erro depois da reserva: devolve a vaga
      result.errors.push({ term: searchTerm.term, message: `${item.id}: ${(err as Error).message}` });
    }
  }

  return result;
}

/**
 * Busca um termo livre digitado pelo admin (não precisa ser MLB ID/URL) —
 * mesma lógica de classificação/dedup/link honesto de discoverNewProducts,
 * só que pra um termo só, sob demanda, em vez da rotação automática.
 */
export async function searchAndIngestMeliTerm(term: string): Promise<TermIngestResult> {
  const [network] = await db
    .select()
    .from(affiliateNetworks)
    .where(eq(affiliateNetworks.slug, 'mercado-livre'))
    .limit(1);

  if (!network) {
    return { ...emptyTermResult(), errors: [{ term, message: 'Rede mercado-livre não cadastrada em affiliate_networks' }] };
  }

  const accessToken = await getValidAccessToken();
  return searchAndIngestTerm({ term, kind: 'game' }, network, accessToken);
}

/**
 * dryRun: só leitura no banco e GETs na API oficial — não cadastra nada e
 * não avança o cursor de rotação. `termsLimit` restringe quantos termos o
 * dry-run percorre (default: TERMS_PER_RUN).
 */
export async function discoverNewProducts(
  options: { dryRun?: boolean; termsLimit?: number; limits?: Partial<DiscoveryLimits>; cursorStart?: number } = {}
): Promise<DiscoverProductsSummary> {
  const dryRun = options.dryRun === true;
  const startedAt = Date.now();
  const limits = resolveLimits({
    termsPerRun: options.termsLimit ?? options.limits?.termsPerRun,
    ...options.limits,
    // env: ajuste operacional sem deploy de código (DISCOVER_MODE=review_all força tudo novo em review)
    mode: options.limits?.mode ?? process.env.DISCOVER_MODE,
  });
  const termsPerRun = limits.termsPerRun;
  const state = freshRunState(limits);
  // cursorStart explícito só para dry-run/diagnóstico (amostrar outro trecho da lista); o cron usa o cursor salvo.
  const cursorStart = dryRun && options.cursorStart != null ? options.cursorStart : await getCursor();
  const terms = Array.from(
    { length: termsPerRun },
    (_, i) => SEARCH_TERMS[(cursorStart + i) % SEARCH_TERMS.length]
  );

  const summary: DiscoverProductsSummary = {
    termsSearched: 0,
    totalTerms: SEARCH_TERMS.length,
    cursorStart,
    found: 0,
    alreadyExisted: 0,
    created: 0,
    skippedNoOffers: 0,
    skippedProbeCap: 0,
    dryRun,
    preview: [],
    errors: [],
    skipReasons: {},
    skipSamples: [],
    bornReview: 0,
    bornApproved: 0,
    createdMasterIds: [],
    limits,
    stoppedReason: null,
    elapsedMs: 0,
  };

  const [network] = await db
    .select()
    .from(affiliateNetworks)
    .where(eq(affiliateNetworks.slug, 'mercado-livre'))
    .limit(1);

  if (!network) {
    summary.errors.push({ term: '*', message: 'Rede mercado-livre não cadastrada em affiliate_networks' });
    return summary;
  }

  const accessToken = await getValidAccessToken();

  // Cada termo = 1 chamada de API externa (I/O, não CPU) — processar em
  // paralelo (não um de cada vez) é o que faz a rota caber no maxDuration
  // com mais termos por execução. Concorrência 4: deixa folga no pool de
  // conexão do banco (max:5) pro trabalho de escrita de cada termo.
  // Concorrência 2 (era 4): cada termo agora faz até 2 buscas + até
  // MAX_PROBES_PER_TERM sondas, e a cota do app é desconhecida (429 já visto).
  // 1 (sequencial) desde 2026-11-03: dois termos criando em paralelo podiam cadastrar o mesmo jogo sob dois
  // catalog_product_id 'gêmeos' antes de qualquer um commitar (o dedup por título só enxerga o que já foi gravado).
  const TERM_CONCURRENCY = 1;
  await mapWithConcurrency(terms, TERM_CONCURRENCY, async (searchTerm) => {
    if (state.stop) return;
    summary.termsSearched++;
    const termResult = await searchAndIngestTerm(searchTerm, network, accessToken, { dryRun, limits, state });
    for (const [k, v] of Object.entries(termResult.skipReasons)) summary.skipReasons[k] = (summary.skipReasons[k] ?? 0) + v;
    summary.skipSamples.push(...termResult.skipSamples);
    summary.bornReview += termResult.bornReview;
    summary.bornApproved += termResult.bornApproved;
    summary.createdMasterIds.push(...termResult.createdMasterIds);
    summary.found += termResult.found;
    summary.created += termResult.created;
    summary.alreadyExisted += termResult.alreadyExisted;
    summary.skippedNoOffers += termResult.skippedNoOffers;
    summary.skippedProbeCap += termResult.skippedProbeCap;
    summary.preview.push(...termResult.preview);
    summary.errors.push(...termResult.errors);
  });

  summary.stoppedReason = state.stop;
  summary.elapsedMs = Date.now() - startedAt;
  if (!dryRun) {
    // Em 429/erros em série o cursor NÃO avança para o trecho não percorrido? Simples e seguro: avança só o
    // que foi efetivamente buscado (termsSearched), para reprocessar o resto na próxima rodada.
    const advanced = summary.stoppedReason ? Math.max(1, summary.termsSearched) : termsPerRun;
    await saveCursor((cursorStart + advanced) % SEARCH_TERMS.length);
    await saveLastRun(summary);
  }
  // Log estruturado (uma linha JSON por execução) para o log da Vercel; sem amostras longas.
  console.log(
    JSON.stringify({
      event: 'discover-products',
      dryRun,
      at: new Date().toISOString(),
      cursorStart,
      termsSearched: summary.termsSearched,
      found: summary.found,
      created: summary.created,
      bornReview: summary.bornReview,
      bornApproved: summary.bornApproved,
      alreadyExisted: summary.alreadyExisted,
      skipReasons: summary.skipReasons,
      errors: summary.errors.length,
      stoppedReason: summary.stoppedReason,
      elapsedMs: summary.elapsedMs,
      createdMasterIds: summary.createdMasterIds,
      limits: summary.limits,
    })
  );

  return summary;
}

/**
 * Poda/limpa do banco de dados itens legados que não sejam jogos em si
 * nem melhorem a experiência de jogo (ex: chaveiros, porta-chaves, copos, camisetas, etc.)
 */
export async function pruneMerchandiseProducts(): Promise<{ prunedCount: number }> {
  const keywords = [
    'chaveiro', 'porta-chave', 'porta chave', 'porta_chave',
    'caneca', 'camiseta', 'moletom', 'quadro', 'luminaria', 'luminária',
    'almofada', 'copo', 'garrafa', 'action figure', 'action_figure',
    'funko', 'estatua', 'estátua', 'busto', 'luminoso', 'poster',
    'cartaz', 'caneta', 'caderno', 'agenda', 'estojo', 'miniatura',
    'replica', 'réplica', 'pelucia', 'pelúcia', 'boneco'
  ];

  let prunedCount = 0;
  for (const kw of keywords) {
    try {
      // 1. Apaga snapshots das ofertas que pertencem a produtos contendo o termo
      await db.execute(sql`
        DELETE FROM affiliate_price_snapshots
        WHERE offer_id IN (
          SELECT id FROM affiliate_offers
          WHERE master_product_id IN (
            SELECT id FROM master_products
            WHERE name ILIKE ${'%' + kw + '%'}
          )
        )
      `);

      // 2. Apaga ofertas vinculadas aos produtos contendo o termo
      await db.execute(sql`
        DELETE FROM affiliate_offers
        WHERE master_product_id IN (
          SELECT id FROM master_products
          WHERE name ILIKE ${'%' + kw + '%'}
        )
      `);

      // 3. Apaga os produtos master que contêm o termo no nome
      const res = await db.execute(sql`
        DELETE FROM master_products
        WHERE name ILIKE ${'%' + kw + '%'}
      `);
      
      prunedCount += (res as any).count ?? (res as any).rowCount ?? (Array.isArray(res) ? res.length : 0);
    } catch (e) {
      console.error(`Erro ao podar produtos com termo ${kw}:`, e);
    }
  }

  return { prunedCount };
}

/**
 * Varredura por categoria DESATIVADA (2026-10-31). Dependia só de
 * /sites/MLB/search?category=..., que responde 403, e a API oficial de
 * catálogo (/products/search) ignora filtro de categoria. A cobertura agora
 * vem da rotação de termos em discoverNewProducts. Mantida como no-op para
 * não quebrar os chamadores (cron e ação do admin).
 */
export async function discoverAllCategoryProducts(_maxPagesPerCategory = 5): Promise<{ totalIngested: number }> {
  return { totalIngested: 0 };
}

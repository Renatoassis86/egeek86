import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts, systemConfig } from '@/db/schema';
import type { GamePlatformGen } from '@/db/schema';
import { getValidAccessToken } from './sources/mercado-livre-auth';
import { classifyFromAttributes, type MeliAttribute } from './sources/mercado-livre-classify';
import { normalizeGamePlatformGen } from '@/lib/affiliate/game-classification';
import { slugify } from '@/lib/slugify';
import { mapWithConcurrency } from '@/lib/concurrency';
import { recordPriceSnapshot } from './record-price-snapshot';

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
  return NON_PRODUCT_KEYWORDS.some((re) => re.test(title));
}

/**
 * Não processamos tudo isso numa execução só (ver TERMS_PER_RUN abaixo) —
 * roda em rotação, um pedaço por vez, ao longo do dia.
 */
const SEARCH_TERMS: SearchTerm[] = [...FRANCHISE_SEARCH_TERMS, ...GAME_SEARCH_TERMS, ...CONSOLE_SEARCH_TERMS, ...ACCESSORY_SEARCH_TERMS];

/**
 * Quantos termos por execução.
 */
const TERMS_PER_RUN = 20;

/** Cap por termo — busca até 50 resultados por termo para máxima profundidade de cobertura. */
const MAX_RESULTS_PER_TERM = 50;

const CURSOR_CONFIG_KEY = 'discover_products_cursor';

interface MeliSearchResult {
  id: string;
  name: string;
  attributes: MeliAttribute[];
  pictures?: { url: string }[];
  /** "new" | "used" — Mercado Livre retorna isso por resultado de busca. Ausente (undefined) = resultado do catálogo buy-box, que por definição já é sempre item novo. */
  condition?: string | null;
}

export interface DiscoverProductsSummary {
  termsSearched: number;
  totalTerms: number;
  cursorStart: number;
  found: number;
  alreadyExisted: number;
  created: number;
  errors: { term: string; message: string }[];
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
  errors: { term: string; message: string }[];
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
  accessToken: string
): Promise<TermIngestResult> {
  const result: TermIngestResult = { found: 0, created: 0, alreadyExisted: 0, createdTitles: [], errors: [] };
  let results: MeliSearchResult[] = [];

  try {
    // 1. Busca no Catálogo Buy-Box (/products/search)
    const catalogRes = await fetch(
      `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(searchTerm.term)}&limit=${MAX_RESULTS_PER_TERM}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (catalogRes.ok) {
      const catalogData = (await catalogRes.json()) as { results: MeliSearchResult[] };
      results.push(...(catalogData.results || []));
    }

    // 2. Busca Aberta nos Anúncios de Todos os Vendedores (/sites/MLB/search) — Garante capturar TUDO (Turok, raridades, etc.)
    const siteRes = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm.term)}&limit=${MAX_RESULTS_PER_TERM}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (siteRes.ok) {
      const siteData = (await siteRes.json()) as { results: any[] };
      const siteItems: MeliSearchResult[] = (siteData.results || []).map((item) => ({
        id: item.catalog_product_id || item.id,
        name: item.title,
        attributes: item.attributes || [],
        pictures: item.thumbnail ? [{ url: item.thumbnail.replace('-I.jpg', '-O.jpg') }] : [],
        condition: item.condition ?? null,
      }));
      results.push(...siteItems);
    }

    result.found = results.length;
  } catch (err) {
    result.errors.push({ term: searchTerm.term, message: (err as Error).message });
    return result;
  }

  // Try/catch por item: um produto com dado inesperado (ex: hierarquia de
  // variação do catálogo) não deve derrubar o resto dos resultados desse termo.
  for (const item of results) {
    try {
      // Busca textual do Mercado Livre pra termo de console/acessório não é
      // filtro exato — às vezes devolve jogo junto ("Jogo X Para Console
      // Switch"), ou acessório de montagem/proteção que não é o produto em
      // si (suporte de parede, capa, skin). Descarta os dois casos aqui —
      // fora do escopo pedido: jogo, console, joystick/controle avulso,
      // tecnologia de experiência de jogo.
      if (searchTerm.kind !== 'game' && /^jogo\b/i.test(item.name)) {
        continue;
      }
      if (isNonProductAccessory(item.name)) {
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
        continue;
      }

      const [existing] = await db
        .select({ id: masterProducts.id })
        .from(masterProducts)
        .where(eq(masterProducts.meliCatalogId, item.id))
        .limit(1);

      if (existing) {
        result.alreadyExisted++;
        continue;
      }

      const detectedPlatform = normalizeGamePlatformGen(null, item.name);
      const isGameMedia = isGameTitleOrMedia(item.name);
      const classification =
        searchTerm.kind === 'console' && !isGameMedia
          ? {
              productType: 'console' as const,
              gameFormat: 'unknown' as const,
              // Busca textual do Mercado Livre pra "console nintendo switch 2"
              // também retorna Switch/Lite (busca solta, não filtro exato) —
              // não dá pra confiar cegamente no termo de busca. Deriva a
              // plataforma de verdade a partir do título de cada resultado;
              // só cai pro termo de busca se o título não deixar claro.
              gamePlatformGen: detectedPlatform !== 'unknown' ? detectedPlatform : searchTerm.platform!,
              gameEditionType: 'unknown' as const,
              gameEditionSource: null,
              gameCollection: null,
            }
          : { productType: 'game' as const, ...classifyFromAttributes(item.attributes, item.name) };
      const baseSlug = slugify(item.name);
      const [collision] = await db
        .select({ id: masterProducts.id })
        .from(masterProducts)
        .where(eq(masterProducts.slug, baseSlug))
        .limit(1);
      const productSlug = collision ? slugify(`${item.name}-${item.id.slice(-6)}`) : baseSlug;

      const [masterProduct] = await db
        .insert(masterProducts)
        .values({
          name: item.name,
          slug: productSlug,
          meliCatalogId: item.id,
          defaultImages: item.pictures?.map((p) => p.url) ?? [],
          ...classification,
          classifiedAt: new Date(),
        })
        .returning();

      const offerSlug = slugify(`${item.name}-${item.id.slice(-6)}-${randomUUID().slice(0, 6)}`);

      // Só marca link como definitivo (não pendente) quando MELI_TOOL_ID
      // está de fato configurado com o ID real de afiliado do usuário —
      // "32740986" era um valor fixo no código, nunca configurado via env,
      // e NÃO é o ID de afiliado do usuário (confirmado 2026-07-24). Usar
      // esse ID em todo link publicado arriscava rastrear a comissão pra
      // conta de outra pessoa, não gerar zero comissão. Sem ID real
      // configurado, publica a página normal do produto (sem matt_tool_id)
      // e marca pendente — mesmo padrão honesto já usado pra Shopee/Magalu
      // e pela extração manual do admin.
      const realToolId = process.env.MELI_TOOL_ID;
      const meliUrl = `https://www.mercadolivre.com.br/p/${item.id}`;

      await db.insert(affiliateOffers).values({
        masterProductId: masterProduct.id,
        networkId: network.id,
        title: item.name,
        slug: offerSlug,
        affiliateUrl: realToolId ? `${meliUrl}?matt_tool_id=${realToolId}` : meliUrl,
        affiliateLinkPending: !realToolId,
        imageUrl: item.pictures?.[0]?.url ?? null,
        externalRef: item.id,
        // Ainda sem preço coletado — o próximo ciclo do coletor de preço preenche o real.
        currentPriceCents: 0,
        status: 'active',
        publishedAt: new Date(),
      });

      result.created++;
      result.createdTitles.push(item.name);
    } catch (err) {
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
    return { found: 0, created: 0, alreadyExisted: 0, createdTitles: [], errors: [{ term, message: 'Rede mercado-livre não cadastrada em affiliate_networks' }] };
  }

  const accessToken = await getValidAccessToken();
  return searchAndIngestTerm({ term, kind: 'game' }, network, accessToken);
}

export async function discoverNewProducts(): Promise<DiscoverProductsSummary> {
  const cursorStart = await getCursor();
  const terms = Array.from(
    { length: TERMS_PER_RUN },
    (_, i) => SEARCH_TERMS[(cursorStart + i) % SEARCH_TERMS.length]
  );

  const summary: DiscoverProductsSummary = {
    termsSearched: 0,
    totalTerms: SEARCH_TERMS.length,
    cursorStart,
    found: 0,
    alreadyExisted: 0,
    created: 0,
    errors: [],
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
  const TERM_CONCURRENCY = 4;
  await mapWithConcurrency(terms, TERM_CONCURRENCY, async (searchTerm) => {
    summary.termsSearched++;
    const termResult = await searchAndIngestTerm(searchTerm, network, accessToken);
    summary.found += termResult.found;
    summary.created += termResult.created;
    summary.alreadyExisted += termResult.alreadyExisted;
    summary.errors.push(...termResult.errors);
  });

  await saveCursor((cursorStart + TERMS_PER_RUN) % SEARCH_TERMS.length);

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

/** Categorias oficiais de jogos no Mercado Livre (MLB) */
const MELI_GAME_CATEGORIES = [
  { id: 'MLB437701', name: 'Nintendo Switch' },
  { id: 'MLB437702', name: 'PlayStation 5' },
  { id: 'MLB186456', name: 'PlayStation 4' },
  { id: 'MLB437703', name: 'Xbox Series X/S' },
  { id: 'MLB186457', name: 'Xbox One' },
  { id: 'MLB1144', name: 'Video Games Geral' },
];

/**
 * Varre exaustivamente as categorias de video games do Mercado Livre página por página,
 * garantindo a ingestão de 100% dos jogos postados na plataforma.
 */
export async function discoverAllCategoryProducts(maxPagesPerCategory = 5): Promise<{ totalIngested: number }> {
  let totalIngested = 0;

  const [network] = await db
    .select()
    .from(affiliateNetworks)
    .where(eq(affiliateNetworks.slug, 'mercado-livre'))
    .limit(1);

  if (!network) return { totalIngested: 0 };

  const accessToken = await getValidAccessToken();

  for (const cat of MELI_GAME_CATEGORIES) {
    for (let page = 0; page < maxPagesPerCategory; page++) {
      const offset = page * 50;
      try {
        const response = await fetch(
          `https://api.mercadolibre.com/sites/MLB/search?category=${cat.id}&offset=${offset}&limit=50`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!response.ok) break;

        const data = await response.json();
        const results = data.results || [];
        if (results.length === 0) break;

        for (const item of results) {
          if (isNonProductAccessory(item.title)) continue;
          // Ver nota em searchAndIngestTerm — nunca cataloga usado/seminovo.
          if (item.condition === 'used' || isUsedCondition(item.title)) continue;

          const meliCatalogId = item.catalog_product_id || item.id;
          const [existing] = await db
            .select({ id: masterProducts.id })
            .from(masterProducts)
            .where(eq(masterProducts.meliCatalogId, meliCatalogId))
            .limit(1);

          if (existing) continue;

          const classification = classifyFromAttributes(item.attributes || [], item.title);
          const baseSlug = slugify(item.title);
          const productSlug = slugify(`${item.title}-${meliCatalogId.slice(-6)}`);

          const [masterProduct] = await db
            .insert(masterProducts)
            .values({
              name: item.title,
              slug: productSlug,
              meliCatalogId,
              defaultImages: item.thumbnail ? [item.thumbnail.replace('-I.jpg', '-O.jpg')] : [],
              ...classification,
              classifiedAt: new Date(),
            })
            .returning();

          const offerSlug = slugify(`${item.title}-${meliCatalogId.slice(-6)}-${randomUUID().slice(0, 6)}`);
          const priceCents = item.price ? Math.round(Number(item.price) * 100) : 0;

          // Ver nota em discoverNewProducts: só usa matt_tool_id quando
          // MELI_TOOL_ID é o ID real do usuário, configurado via env — nunca
          // um valor fixo no código.
          const rawPermalink = item.permalink || `https://www.mercadolivre.com.br/p/${meliCatalogId}`;
          const realToolId = process.env.MELI_TOOL_ID;
          const trackedUrl = realToolId
            ? rawPermalink.includes('?')
              ? `${rawPermalink}&matt_tool_id=${realToolId}`
              : `${rawPermalink}?matt_tool_id=${realToolId}`
            : rawPermalink;

          const [newOffer] = await db
            .insert(affiliateOffers)
            .values({
              masterProductId: masterProduct.id,
              networkId: network.id,
              title: item.title,
              slug: offerSlug,
              affiliateUrl: trackedUrl,
              affiliateLinkPending: !realToolId,
              imageUrl: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
              externalRef: item.id,
              // Sem preço ainda no INSERT (mesmo padrão de searchAndIngestTerm)
              // — recordPriceSnapshot logo abaixo é quem grava o snapshot
              // inicial E atualiza o cache. Inserir já com o preço real aqui
              // e nunca chamar recordPriceSnapshot deixava a oferta com
              // current_price_cents preenchido mas ZERO linha em
              // affiliate_price_snapshots (bug real, achado 2026-07-24:
              // gráfico/cotações concorrentes nunca mostravam esse preço,
              // já que os dois só leem de affiliate_price_snapshots — 403
              // ofertas afetadas até aqui).
              currentPriceCents: 0,
              status: 'active',
              publishedAt: new Date(),
            })
            .returning({ id: affiliateOffers.id });

          if (priceCents > 0) {
            await recordPriceSnapshot({ offerId: newOffer.id, priceCents, source: 'api' });
          }

          totalIngested++;
        }
      } catch (e) {
        console.error(`Erro ao varrer categoria ${cat.name} página ${page}:`, e);
      }
    }
  }

  return { totalIngested };
}

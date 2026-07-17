import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts, systemConfig } from '@/db/schema';
import type { GamePlatformGen } from '@/db/schema';
import { getValidAccessToken } from './sources/mercado-livre-auth';
import { classifyFromAttributes, type MeliAttribute } from './sources/mercado-livre-classify';
import { normalizeGamePlatformGen } from '@/lib/affiliate/game-classification';
import { slugify } from '@/lib/slugify';

const PLATFORM_TERMS = ['nintendo switch', 'nintendo switch 2', 'ps4', 'ps5', 'xbox one', 'xbox series'];

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
  kind: 'game' | 'console';
  /** Só usado quando kind='console' — já sabemos a plataforma pelo termo de busca, não precisa inferir de atributo. */
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

/** Console em si (hardware), não jogo — plataforma já é conhecida pelo termo, sem precisar de classifyFromAttributes. */
const CONSOLE_SEARCH_TERMS: SearchTerm[] = [
  { term: 'console playstation 5', kind: 'console', platform: 'ps5' },
  { term: 'console playstation 4', kind: 'console', platform: 'ps4' },
  { term: 'console xbox series x', kind: 'console', platform: 'xbox_series' },
  { term: 'console xbox one', kind: 'console', platform: 'xbox_one' },
  { term: 'console nintendo switch 2', kind: 'console', platform: 'switch_2' },
  { term: 'console nintendo switch', kind: 'console', platform: 'switch_1' },
];

/**
 * Não processamos tudo isso numa execução só (ver TERMS_PER_RUN abaixo) —
 * roda em rotação, um pedaço por vez, ao longo do dia.
 */
const SEARCH_TERMS: SearchTerm[] = [...GAME_SEARCH_TERMS, ...CONSOLE_SEARCH_TERMS];

/** Quantos termos por execução — ajustado pra caber com folga no limite de 60s do Vercel mesmo com latência real de rede. */
const TERMS_PER_RUN = 10;

/** Cap por termo — defensivo, rate limit da API do Mercado Livre não é documentado publicamente. */
const MAX_RESULTS_PER_TERM = 20;

const CURSOR_CONFIG_KEY = 'discover_products_cursor';

interface MeliSearchResult {
  id: string;
  name: string;
  attributes: MeliAttribute[];
  pictures?: { url: string }[];
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

  for (const searchTerm of terms) {
    summary.termsSearched++;
    let results: MeliSearchResult[];
    try {
      const response = await fetch(
        `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(searchTerm.term)}&limit=${MAX_RESULTS_PER_TERM}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        summary.errors.push({ term: searchTerm.term, message: `HTTP ${response.status}: ${await response.text()}` });
        continue;
      }

      const data = (await response.json()) as { results: MeliSearchResult[] };
      results = data.results;
      summary.found += results.length;
    } catch (err) {
      summary.errors.push({ term: searchTerm.term, message: (err as Error).message });
      continue;
    }

    // Try/catch por item: um produto com dado inesperado (ex: hierarquia de
    // variação do catálogo) não deve derrubar o resto dos resultados desse termo.
    for (const result of results) {
      try {
        // Busca textual do Mercado Livre pra termo de console não é filtro
        // exato — às vezes devolve jogo ("Jogo X Para Console Switch") junto
        // com hardware de verdade. Descarta o caso mais óbvio; o resto do
        // ruído (acessório, capa etc) fica pra revisão manual em
        // /admin/ofertas?status=draft, igual qualquer outro item descoberto.
        if (searchTerm.kind === 'console' && /^jogo\b/i.test(result.name)) {
          continue;
        }

        const [existing] = await db
          .select({ id: masterProducts.id })
          .from(masterProducts)
          .where(eq(masterProducts.meliCatalogId, result.id))
          .limit(1);

        if (existing) {
          summary.alreadyExisted++;
          continue;
        }

        const detectedPlatform = normalizeGamePlatformGen(null, result.name);
        const classification =
          searchTerm.kind === 'console'
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
            : { productType: 'game' as const, ...classifyFromAttributes(result.attributes, result.name) };
        const baseSlug = slugify(result.name);
        const [collision] = await db
          .select({ id: masterProducts.id })
          .from(masterProducts)
          .where(eq(masterProducts.slug, baseSlug))
          .limit(1);
        const productSlug = collision ? slugify(`${result.name}-${result.id.slice(-6)}`) : baseSlug;

        const [masterProduct] = await db
          .insert(masterProducts)
          .values({
            name: result.name,
            slug: productSlug,
            meliCatalogId: result.id,
            defaultImages: result.pictures?.map((p) => p.url) ?? [],
            ...classification,
            classifiedAt: new Date(),
          })
          .returning();

        const offerSlug = slugify(`${result.name}-${result.id.slice(-6)}-${randomUUID().slice(0, 6)}`);

        await db.insert(affiliateOffers).values({
          masterProductId: masterProduct.id,
          networkId: network.id,
          title: result.name,
          slug: offerSlug,
          // Placeholder honesto (página pública real do produto, sem
          // rastreio de comissão) — decisão explícita do usuário (2026-07-17):
          // publica direto em vez de esperar o admin colar o link de afiliado
          // de verdade, priorizando vitrine sempre cheia sobre garantir
          // comissão em 100% dos cliques. Admin ainda pode trocar pelo link
          // real a qualquer momento em /admin/ofertas/[id].
          affiliateUrl: `https://www.mercadolivre.com.br/p/${result.id}`,
          imageUrl: result.pictures?.[0]?.url ?? null,
          externalRef: result.id,
          // Ainda sem preço coletado — o próximo ciclo do coletor de preço preenche o real.
          currentPriceCents: 0,
          status: 'active',
          publishedAt: new Date(),
        });

        summary.created++;
      } catch (err) {
        summary.errors.push({ term: searchTerm.term, message: `${result.id}: ${(err as Error).message}` });
      }
    }
  }

  await saveCursor((cursorStart + TERMS_PER_RUN) % SEARCH_TERMS.length);

  return summary;
}

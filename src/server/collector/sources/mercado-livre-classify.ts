import 'server-only';
import { getValidAccessToken } from './mercado-livre-auth';
import { normalizeGameFormat, normalizeGamePlatformGen, classifyGameEdition } from '@/lib/affiliate/game-classification';
import type { GameFormat, GamePlatformGen, GameEditionType, GameEditionSource } from '@/db/schema';

export interface MeliClassificationResult {
  gameFormat: GameFormat;
  gamePlatformGen: GamePlatformGen;
  gameEditionType: GameEditionType;
  gameEditionSource: GameEditionSource;
  gameCollection: string | null;
}

export interface MeliAttribute {
  id: string;
  value_name: string | null;
}

function getAttr(attributes: MeliAttribute[], id: string): string | null {
  return attributes.find((a) => a.id === id)?.value_name ?? null;
}

export type MeliProductKind = 'game' | 'console' | 'accessory';

/**
 * Cache em memória de category_id -> tipo de produto — a mesma categoria se
 * repete em centenas de itens (todo jogo de PS5 cai na mesma categoria
 * "Jogos para PS5", por exemplo), então não faz sentido perguntar de novo
 * pro Mercado Livre a cada item.
 */
const categoryKindCache = new Map<string, MeliProductKind | null>();

/**
 * Classifica jogo/console/acessório a partir da categoria REAL que o próprio
 * Mercado Livre atribuiu ao anúncio (`GET /categories/{id}`, endpoint
 * público, não precisa de token) — em vez de adivinhar pelo título contra
 * uma lista de franquias mantida à mão (frágil: título de jogo que não está
 * na lista, tipo "Company of Heroes 3 Edição Console", acaba caindo no
 * `productType` do termo de busca por padrão, e vira "console" errado).
 * A árvore de categoria do Mercado Livre já resolve isso de forma objetiva:
 * "Jogos para Console e PC" nunca é a mesma categoria de "Consoles" nem de
 * "Acessórios para Videogame". Usa o path_from_root inteiro (não só o nome
 * da folha) porque a palavra decisiva às vezes está num nó pai.
 */
export async function resolveMeliCategoryProductType(categoryId: string | null | undefined): Promise<MeliProductKind | null> {
  if (!categoryId) return null;
  if (categoryKindCache.has(categoryId)) return categoryKindCache.get(categoryId)!;

  let kind: MeliProductKind | null = null;
  try {
    const response = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
    if (response.ok) {
      const data = (await response.json()) as { name?: string; path_from_root?: { id: string; name: string }[] };
      const fullPath = [...(data.path_from_root ?? []).map((n) => n.name), data.name ?? ''].join(' > ');
      // Ordem importa: "Jogos para Console" contém a palavra "console", por
      // isso "jogo" é checado primeiro pra não cair no ramo errado.
      if (/jogos?\b/i.test(fullPath) && !/acess[oó]rios?/i.test(fullPath)) {
        kind = 'game';
      } else if (/acess[oó]rios?/i.test(fullPath)) {
        kind = 'accessory';
      } else if (/consoles?\b/i.test(fullPath)) {
        kind = 'console';
      }
    }
  } catch {
    // Falha de rede/categoria — devolve null e deixa o chamador cair no
    // heurístico de título como reforço, não trava a descoberta por isso.
  }

  categoryKindCache.set(categoryId, kind);
  return kind;
}

/**
 * Núcleo puro da classificação — recebe o array `attributes` no mesmo
 * formato usado tanto por GET /products/{id} quanto pelos resultados de
 * GET /products/search (mesmo shape). Extraído pra reuso: importação em
 * massa via busca já tem os atributos na mão e não precisa de uma chamada
 * extra por produto só pra classificar.
 *
 * `fallbackName` (opcional) é o nome/título bruto do catálogo — descoberto
 * ao rodar a importação em massa (2026-07-14) que CONSOLE_VERSION falta na
 * maioria dos catálogos de jogo antigos, e o texto de EDITION sozinho não
 * cobre a lacuna: o nome do catálogo quase sempre menciona "Switch"/"Switch 2"
 * mesmo quando os atributos estruturados não têm essa informação.
 */
export function classifyFromAttributes(attributes: MeliAttribute[], fallbackName?: string | null): MeliClassificationResult {
  const collection = getAttr(attributes, 'COLLECTION');
  const title = getAttr(attributes, 'VIDEO_GAME_TITLE');
  // EDITION às vezes carrega texto livre tipo "Nintendo Switch 2 (capa
  // japonesa)" — único fallback disponível quando CONSOLE_VERSION não existe
  // (catálogo novo/incompleto, visto em "Mario Kart World" ao testar ao vivo).
  const edition = classifyGameEdition({ title });
  const platformFallback = [getAttr(attributes, 'EDITION'), fallbackName].filter(Boolean).join(' ') || null;

  return {
    gameFormat: normalizeGameFormat(getAttr(attributes, 'FORMAT')),
    gamePlatformGen: normalizeGamePlatformGen(getAttr(attributes, 'CONSOLE_VERSION'), platformFallback),
    gameEditionType: edition.gameEditionType,
    gameEditionSource: edition.source,
    gameCollection: collection,
  };
}

/**
 * GET /products/{catalog_product_id} — NÃO confundir com /products/{id}/items
 * (usado em mercado-livre.ts pra preço). Aqui 404 é anomalia real (produto
 * não existe), diferente de lá (onde 404 em /items só significa "sem oferta
 * ativa agora").
 */
export async function classifyMeliCatalogProduct(
  catalogProductId: string
): Promise<MeliClassificationResult & { productType: MeliProductKind | null }> {
  const accessToken = await getValidAccessToken();

  const response = await fetch(`https://api.mercadolibre.com/products/${catalogProductId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Mercado Livre: falha ao classificar ${catalogProductId} (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as { attributes: MeliAttribute[]; name?: string; category_id?: string };
  const productType = await resolveMeliCategoryProductType(data.category_id);
  return { ...classifyFromAttributes(data.attributes, data.name), productType };
}

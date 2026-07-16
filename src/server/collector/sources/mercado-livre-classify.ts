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
export async function classifyMeliCatalogProduct(catalogProductId: string): Promise<MeliClassificationResult> {
  const accessToken = await getValidAccessToken();

  const response = await fetch(`https://api.mercadolibre.com/products/${catalogProductId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Mercado Livre: falha ao classificar ${catalogProductId} (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as { attributes: MeliAttribute[]; name?: string };
  return classifyFromAttributes(data.attributes, data.name);
}

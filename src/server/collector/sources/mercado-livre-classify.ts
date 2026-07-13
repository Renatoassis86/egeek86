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

interface MeliAttribute {
  id: string;
  value_name: string | null;
}

function getAttr(attributes: MeliAttribute[], id: string): string | null {
  return attributes.find((a) => a.id === id)?.value_name ?? null;
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

  const data = (await response.json()) as { attributes: MeliAttribute[] };
  const collection = getAttr(data.attributes, 'COLLECTION');
  const title = getAttr(data.attributes, 'VIDEO_GAME_TITLE');
  // EDITION às vezes carrega texto livre tipo "Nintendo Switch 2 (capa
  // japonesa)" — único fallback disponível quando CONSOLE_VERSION não existe
  // (catálogo novo/incompleto, visto em "Mario Kart World" ao testar ao vivo).
  const edition = classifyGameEdition({ title });

  return {
    gameFormat: normalizeGameFormat(getAttr(data.attributes, 'FORMAT')),
    gamePlatformGen: normalizeGamePlatformGen(getAttr(data.attributes, 'CONSOLE_VERSION'), getAttr(data.attributes, 'EDITION')),
    gameEditionType: edition.gameEditionType,
    gameEditionSource: edition.source,
    gameCollection: collection,
  };
}

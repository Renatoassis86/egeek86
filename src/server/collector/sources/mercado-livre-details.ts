import 'server-only';
import { getValidAccessToken } from './mercado-livre-auth';

export interface MeliCatalogDetails {
  pictures: string[];
  /** Bullets reais escritos pela Mercado Livre/fabricante (main_features) — não é sinopse de enredo, é descrição factual do produto. Nunca fabricado aqui, só repassado como veio da API. */
  features: string[];
  /** short_description.content quando não vazio — às vezes preenchido, às vezes não, depende do produto no catálogo ML. */
  shortDescription: string | null;
}

/**
 * Busca ao vivo (sem cache/tabela própria) os detalhes ricos do produto no
 * catálogo do Mercado Livre — usado só na página de detalhe do admin, que
 * não é hot path, então uma chamada extra por carregamento é aceitável.
 * Retorna null em qualquer falha (produto sem catálogo, API fora do ar,
 * etc) — o chamador decide o que mostrar nesse caso, nunca inventa dado.
 */
export async function getMeliCatalogDetails(meliCatalogId: string): Promise<MeliCatalogDetails | null> {
  try {
    const accessToken = await getValidAccessToken();
    const res = await fetch(`https://api.mercadolibre.com/products/${meliCatalogId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      pictures?: { url: string }[];
      main_features?: { text: string; type: string }[];
      short_description?: { content: string } | null;
    };

    return {
      pictures: (data.pictures ?? []).map((p) => p.url).filter(Boolean),
      features: (data.main_features ?? []).map((f) => f.text).filter(Boolean),
      shortDescription: data.short_description?.content?.trim() || null,
    };
  } catch {
    return null;
  }
}

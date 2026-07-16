import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
import { getValidAccessToken } from './sources/mercado-livre-auth';
import { classifyFromAttributes, type MeliAttribute } from './sources/mercado-livre-classify';
import { slugify } from '@/lib/slugify';

/**
 * Termos fixos de busca no catálogo do Mercado Livre — cobre as gerações que
 * o catálogo já classifica (ver gamePlatformGen em src/db/schema/_enums.ts).
 * Lista fixa no código de propósito (sem tabela nova): poucos termos, editar
 * aqui é suficiente pra v1.
 */
const SEARCH_TERMS = [
  'jogo nintendo switch',
  'jogo nintendo switch 2',
  'jogo ps4',
  'jogo ps5',
  'jogo xbox one',
  'jogo xbox series',
];

/** Cap por termo — defensivo, rate limit da API do Mercado Livre não é documentado publicamente. */
const MAX_RESULTS_PER_TERM = 20;

interface MeliSearchResult {
  id: string;
  name: string;
  attributes: MeliAttribute[];
  pictures?: { url: string }[];
}

export interface DiscoverProductsSummary {
  termsSearched: number;
  found: number;
  alreadyExisted: number;
  created: number;
  errors: { term: string; message: string }[];
}

/**
 * Descobre produto NOVO no catálogo do Mercado Livre e cadastra sozinho —
 * mas sempre como oferta 'draft' (nunca 'active'): o link de afiliado que
 * gera comissão precisa ser gerado manualmente no painel do Mercado Livre
 * por produto (confirmado em investigação anterior — não existe fórmula de
 * parâmetro pra aplicar em lote), então a descoberta automática só alimenta
 * o catálogo/histórico de preço, nunca publica uma oferta monetizada sozinha.
 *
 * Dedup por catalog_product_id exato (mesmo campo que o cadastro manual usa
 * via master_products.meliCatalogId) — sem correspondência difusa/NLP
 * necessária aqui, já que Mercado Livre sempre retorna o mesmo ID pro mesmo
 * produto canônico, tanto na busca quanto na consulta individual.
 */
export async function discoverNewProducts(): Promise<DiscoverProductsSummary> {
  const summary: DiscoverProductsSummary = {
    termsSearched: 0,
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

  for (const term of SEARCH_TERMS) {
    summary.termsSearched++;
    let results: MeliSearchResult[];
    try {
      const response = await fetch(
        `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(term)}&limit=${MAX_RESULTS_PER_TERM}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        summary.errors.push({ term, message: `HTTP ${response.status}: ${await response.text()}` });
        continue;
      }

      const data = (await response.json()) as { results: MeliSearchResult[] };
      results = data.results;
      summary.found += results.length;
    } catch (err) {
      summary.errors.push({ term, message: (err as Error).message });
      continue;
    }

    // Try/catch por item: um produto com dado inesperado (ex: hierarquia de
    // variação do catálogo) não deve derrubar o resto dos resultados desse termo.
    for (const result of results) {
      try {
        const [existing] = await db
          .select({ id: masterProducts.id })
          .from(masterProducts)
          .where(eq(masterProducts.meliCatalogId, result.id))
          .limit(1);

        if (existing) {
          summary.alreadyExisted++;
          continue;
        }

        const classification = classifyFromAttributes(result.attributes, result.name);
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
          // Placeholder honesto (página pública real do produto) — nunca é
          // exposto publicamente enquanto status='draft' (/go/[slug] só serve
          // oferta 'active'). Admin troca pelo link de afiliado de verdade
          // antes de publicar.
          affiliateUrl: `https://www.mercadolivre.com.br/p/${result.id}`,
          imageUrl: result.pictures?.[0]?.url ?? null,
          externalRef: result.id,
          // Ainda sem preço coletado — o próximo ciclo do coletor de preço
          // (que já processa 'draft', ver collect-prices.ts) preenche o real.
          currentPriceCents: 0,
          status: 'draft',
          highlightNote: 'Descoberto automaticamente, aguardando link de afiliado',
        });

        summary.created++;
      } catch (err) {
        summary.errors.push({ term, message: `${result.id}: ${(err as Error).message}` });
      }
    }
  }

  return summary;
}

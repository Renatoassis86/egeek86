import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts, systemConfig } from '@/db/schema';
import { fetchShopeeGraphQL, generateShopeeAffiliateLink } from './sources/shopee-auth';
import { classifyFromAttributes } from './sources/mercado-livre-classify';
import { normalizeGamePlatformGen } from '@/lib/affiliate/game-classification';
import { slugify } from '@/lib/slugify';
import { isNonProductAccessory } from './discover-products';

const SHOPEE_SEARCH_TERMS = [
  'turok nintendo switch',
  'jogo nintendo switch',
  'jogo ps5',
  'jogo ps4',
  'jogo xbox series',
  'console playstation 5',
  'console nintendo switch',
  'zelda nintendo switch',
  'mario nintendo switch',
  'resident evil ps5',
  'silent hill ps5',
  'final fantasy ps5',
  'elden ring ps5',
  'gta 5 ps5',
  'hollow knight nintendo switch',
  'controle dualsense ps5',
  'controle xbox series',
];

interface ShopeeItemNode {
  itemId: string | number;
  productName: string;
  price: number | string;
  offerLink?: string;
  imageUrl?: string;
  productLink?: string;
}

export async function ensureShopeeNetwork() {
  const [existing] = await db
    .select()
    .from(affiliateNetworks)
    .where(eq(affiliateNetworks.slug, 'shopee'))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(affiliateNetworks)
    .values({
      name: 'Shopee',
      slug: 'shopee',
      websiteUrl: 'https://shopee.com.br',
      colorHex: '#EE4D2D',
      isActive: true,
    })
    .returning();

  return created;
}

export async function discoverShopeeProducts(): Promise<{
  termsSearched: number;
  found: number;
  created: number;
  alreadyExisted: number;
  errors: string[];
}> {
  const summary = {
    termsSearched: 0,
    found: 0,
    created: 0,
    alreadyExisted: 0,
    errors: [] as string[],
  };

  try {
    const network = await ensureShopeeNetwork();

    for (const term of SHOPEE_SEARCH_TERMS) {
      summary.termsSearched++;
      let items: ShopeeItemNode[] = [];

      // 1. Tenta via API GraphQL Oficial da Shopee
      try {
        const gqlQuery = `
          query ProductOffer($keyword: String, $page: Int, $limit: Int) {
            productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
              nodes {
                itemId
                productName
                price
                offerLink
                imageUrl
                productLink
              }
            }
          }
        `;
        const gqlData = await fetchShopeeGraphQL(gqlQuery, { keyword: term, page: 1, limit: 30 });
        items = gqlData?.productOfferV2?.nodes || [];
      } catch (err) {
        // Fallback: Busca via Endpoint Público de Busca Shopee Brasil
        try {
          const publicRes = await fetch(
            `https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(term)}&limit=30&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
              },
            }
          );
          if (publicRes.ok) {
            const publicData = await publicRes.json();
            const rawItems = publicData?.items || [];
            items = rawItems.map((ri: any) => {
              const b = ri.item_basic || {};
              return {
                itemId: String(b.itemid || b.item_id || Math.random()),
                productName: b.name || term,
                price: b.price ? b.price / 100000 : 0,
                imageUrl: b.image ? `https://down-br.img.susercontent.com/file/${b.image}` : null,
                productLink: `https://shopee.com.br/product/${b.shopid || '0'}/${b.itemid || '0'}`,
              };
            });
          }
        } catch (fallbackErr) {
          summary.errors.push(`Erro ao buscar Shopee (${term}): ${(err as Error).message}`);
        }
      }

      summary.found += items.length;

      for (const item of items) {
        try {
          if (!item.productName || isNonProductAccessory(item.productName)) continue;

          const shopeeRef = `shopee-${item.itemId}`;
          const [existingOffer] = await db
            .select({ id: affiliateOffers.id })
            .from(affiliateOffers)
            .where(eq(affiliateOffers.externalRef, shopeeRef))
            .limit(1);

          if (existingOffer) {
            summary.alreadyExisted++;
            continue;
          }

          const classification = classifyFromAttributes([], item.productName);
          const baseSlug = slugify(item.productName);
          const productSlug = slugify(`${item.productName}-shopee-${String(item.itemId).slice(-6)}`);

          const [masterProduct] = await db
            .insert(masterProducts)
            .values({
              name: item.productName,
              slug: productSlug,
              defaultImages: item.imageUrl ? [item.imageUrl] : [],
              ...classification,
              classifiedAt: new Date(),
            })
            .returning();

          const offerSlug = slugify(`${item.productName}-shopee-${randomUUID().slice(0, 6)}`);
          const priceCents = item.price ? Math.round(Number(item.price) * 100) : 0;
          const rawUrl = item.offerLink || item.productLink || `https://shopee.com.br`;
          const finalAffiliateUrl = item.offerLink || (await generateShopeeAffiliateLink(rawUrl));

          await db.insert(affiliateOffers).values({
            masterProductId: masterProduct.id,
            networkId: network.id,
            title: item.productName,
            slug: offerSlug,
            affiliateUrl: finalAffiliateUrl,
            affiliateLinkPending: false, // Ativo automaticamente com link de comissão
            imageUrl: item.imageUrl || null,
            externalRef: shopeeRef,
            currentPriceCents: priceCents,
            status: 'active',
            publishedAt: new Date(),
          });

          summary.created++;
        } catch (e) {
          summary.errors.push(`Erro item Shopee: ${(e as Error).message}`);
        }
      }
    }
  } catch (globalErr) {
    summary.errors.push(`Erro global Shopee: ${(globalErr as Error).message}`);
  }

  return summary;
}

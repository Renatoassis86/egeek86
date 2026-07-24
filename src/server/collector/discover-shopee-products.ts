import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
import { fetchShopeeGraphQL, generateShopeeAffiliateLink, hasShopeeAffiliateCredentials } from './sources/shopee-auth';
import { classifyFromAttributes } from './sources/mercado-livre-classify';
import { slugify } from '@/lib/slugify';
import { isNonProductAccessory, isUsedCondition } from './discover-products';
import { recordPriceSnapshot } from './record-price-snapshot';

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

interface ShopeeItem {
  itemId: string;
  productName: string;
  price: number;
  imageUrl: string | null;
  productLink: string;
  /** Só vem preenchido quando a API oficial de afiliados (com credencial aprovada) devolveu link de comissão de verdade. */
  offerLink?: string | null;
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

/** Só chamada quando hasShopeeAffiliateCredentials() — evita gastar uma chamada de rede fadada a falhar sem credencial real. */
async function fetchViaOfficialGraphQL(term: string): Promise<ShopeeItem[]> {
  const gqlQuery = `
    query ProductOffer($keyword: String, $page: Int, $limit: Int) {
      productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
        nodes { itemId productName price offerLink imageUrl productLink }
      }
    }
  `;
  const gqlData = await fetchShopeeGraphQL(gqlQuery, { keyword: term, page: 1, limit: 30 });
  const nodes = gqlData?.productOfferV2?.nodes || [];

  const items: ShopeeItem[] = [];
  for (const n of nodes) {
    const price = Number(n?.price ?? NaN);
    if (!n?.itemId || !n?.productName || !n?.offerLink || !Number.isFinite(price) || price <= 0) continue;
    items.push({
      itemId: String(n.itemId),
      productName: n.productName,
      price,
      imageUrl: n.imageUrl || null,
      productLink: n.productLink || n.offerLink,
      offerLink: n.offerLink,
    });
  }
  return items;
}

/** Endpoint público de busca (sem autenticação) — plano B enquanto não há aprovação de afiliado Shopee. */
async function fetchViaPublicSearch(term: string): Promise<ShopeeItem[]> {
  const res = await fetch(
    `https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(term)}&limit=30&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': `https://shopee.com.br/search?keyword=${encodeURIComponent(term)}`,
      },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    throw new Error(`endpoint público HTTP ${res.status} — provável bloqueio anti-bot`);
  }

  const data = await res.json();
  const rawItems = data?.items || [];

  const items: ShopeeItem[] = [];
  for (const ri of rawItems) {
    const b = ri?.item_basic;
    const id = b?.itemid ?? b?.item_id;
    const shopId = b?.shopid;
    const price = typeof b?.price === 'number' ? b.price / 100000 : NaN;
    if (!id || !shopId || !b?.name || !Number.isFinite(price) || price <= 0) continue;

    items.push({
      itemId: String(id),
      productName: b.name,
      price,
      imageUrl: b.image ? `https://down-br.img.susercontent.com/file/${b.image}` : null,
      productLink: `https://shopee.com.br/product/${shopId}/${id}`,
      offerLink: null,
    });
  }
  return items;
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

  const useOfficialApi = hasShopeeAffiliateCredentials();

  try {
    const network = await ensureShopeeNetwork();

    for (const term of SHOPEE_SEARCH_TERMS) {
      summary.termsSearched++;
      let items: ShopeeItem[] = [];

      try {
        items = useOfficialApi ? await fetchViaOfficialGraphQL(term) : await fetchViaPublicSearch(term);
      } catch (err) {
        summary.errors.push(`Erro ao buscar Shopee (${term}): ${(err as Error).message}`);
      }

      summary.found += items.length;

      for (const item of items) {
        try {
          if (!item.productName || isNonProductAccessory(item.productName)) continue;
          // Shopee (busca pública) não expõe condition estruturado — o
          // título é o único sinal disponível pra excluir usado/seminovo.
          if (isUsedCondition(item.productName)) continue;

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
          const priceCents = Math.round(item.price * 100);

          // offerLink real só existe quando veio da API oficial com credencial
          // aprovada; caso contrário usa a URL pública genuína e marca como
          // pendente — mesma convenção usada no resto do coletor (ver
          // affiliateLinkPending em src/server/actions/affiliate.ts).
          const realAffiliateUrl = item.offerLink || (await generateShopeeAffiliateLink(item.productLink));

          const [newOffer] = await db
            .insert(affiliateOffers)
            .values({
              masterProductId: masterProduct.id,
              networkId: network.id,
              title: item.productName,
              slug: offerSlug,
              affiliateUrl: realAffiliateUrl || item.productLink,
              affiliateLinkPending: !realAffiliateUrl,
              imageUrl: item.imageUrl,
              externalRef: shopeeRef,
              // Sem preço no INSERT — recordPriceSnapshot logo abaixo grava o
              // snapshot inicial de verdade (ver nota em discover-products.ts:
              // inserir já com o preço real e nunca chamar recordPriceSnapshot
              // deixava a oferta sem NENHUMA linha em affiliate_price_snapshots).
              currentPriceCents: 0,
              status: 'active',
              publishedAt: new Date(),
            })
            .returning({ id: affiliateOffers.id });

          if (priceCents > 0) {
            await recordPriceSnapshot({ offerId: newOffer.id, priceCents, source: 'api' });
          }

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

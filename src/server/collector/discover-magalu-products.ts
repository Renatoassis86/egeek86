import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
import { getMagaluHeaders } from './sources/magalu-auth';
import { classifyFromAttributes } from './sources/mercado-livre-classify';
import { slugify } from '@/lib/slugify';
import { isNonProductAccessory } from './discover-products';

const MAGALU_SEARCH_TERMS = [
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
  'elden ring ps5',
];

interface MagaluItem {
  id: string;
  title: string;
  price: number;
  imageUrl: string | null;
  permalink: string;
}

export async function ensureMagaluNetwork() {
  const [existing] = await db
    .select()
    .from(affiliateNetworks)
    .where(eq(affiliateNetworks.slug, 'magalu'))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(affiliateNetworks)
    .values({
      name: 'Magazine Luiza',
      slug: 'magalu',
      websiteUrl: 'https://www.magazineluiza.com.br',
      colorHex: '#0086FF',
      isActive: true,
    })
    .returning();

  return created;
}

export async function discoverMagaluProducts(): Promise<{
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
    const network = await ensureMagaluNetwork();

    for (const term of MAGALU_SEARCH_TERMS) {
      summary.termsSearched++;
      let items: MagaluItem[] = [];

      try {
        // Consulta API / Busca Aberta Magalu
        const searchUrl = `https://www.magazineluiza.com.br/busca/${encodeURIComponent(term)}/`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          },
        });

        if (res.ok) {
          const html = await res.text();
          // Extrai os dados embutidos no script __NEXT_DATA__ ou JSON-LD do Magalu
          const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
          if (nextDataMatch && nextDataMatch[1]) {
            try {
              const parsed = JSON.parse(nextDataMatch[1]);
              const rawProducts = parsed?.props?.pageProps?.data?.search?.products || [];
              items = rawProducts.map((p: any) => ({
                id: String(p.id || p.sku || Math.random()),
                title: p.title || p.name || term,
                price: Number(p.price?.bestPrice || p.price?.price || p.price || 0),
                imageUrl: p.image?.url || p.imageUrl || null,
                permalink: `https://www.magazineluiza.com.br/${p.path || ''}`,
              }));
            } catch (jsonErr) {}
          }
        }
      } catch (err) {
        summary.errors.push(`Erro ao buscar Magalu (${term}): ${(err as Error).message}`);
      }

      summary.found += items.length;

      for (const item of items) {
        try {
          if (!item.title || isNonProductAccessory(item.title)) continue;

          const magaluRef = `magalu-${item.id}`;
          const [existingOffer] = await db
            .select({ id: affiliateOffers.id })
            .from(affiliateOffers)
            .where(eq(affiliateOffers.externalRef, magaluRef))
            .limit(1);

          if (existingOffer) {
            summary.alreadyExisted++;
            continue;
          }

          const classification = classifyFromAttributes([], item.title);
          const productSlug = slugify(`${item.title}-magalu-${String(item.id).slice(-6)}`);

          const [masterProduct] = await db
            .insert(masterProducts)
            .values({
              name: item.title,
              slug: productSlug,
              defaultImages: item.imageUrl ? [item.imageUrl] : [],
              ...classification,
              classifiedAt: new Date(),
            })
            .returning();

          const offerSlug = slugify(`${item.title}-magalu-${randomUUID().slice(0, 6)}`);
          const priceCents = item.price ? Math.round(Number(item.price) * 100) : 0;
          const trackedUrl = `${item.permalink}?parceiro=egeek86&subid=marketplace`;

          await db.insert(affiliateOffers).values({
            masterProductId: masterProduct.id,
            networkId: network.id,
            title: item.title,
            slug: offerSlug,
            affiliateUrl: trackedUrl,
            affiliateLinkPending: false,
            imageUrl: item.imageUrl,
            externalRef: magaluRef,
            currentPriceCents: priceCents,
            status: 'active',
            publishedAt: new Date(),
          });

          summary.created++;
        } catch (e) {
          summary.errors.push(`Erro item Magalu: ${(e as Error).message}`);
        }
      }
    }
  } catch (globalErr) {
    summary.errors.push(`Erro global Magalu: ${(globalErr as Error).message}`);
  }

  return summary;
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
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

function itemsFromNextData(html: string, term: string): MagaluItem[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match || !match[1]) return [];

  const parsed = JSON.parse(match[1]);
  const rawProducts = parsed?.props?.pageProps?.data?.search?.products || [];

  const items: MagaluItem[] = [];
  for (const p of rawProducts) {
    const id = p?.id || p?.sku;
    const path = p?.path;
    const price = Number(p?.price?.bestPrice ?? p?.price?.price ?? p?.price ?? NaN);
    if (!id || !path || !Number.isFinite(price) || price <= 0) continue;

    items.push({
      id: String(id),
      title: p.title || p.name || term,
      price,
      imageUrl: p.image?.url || p.imageUrl || null,
      permalink: `https://www.magazineluiza.com.br/${path}`,
    });
  }
  return items;
}

/** Fallback pro schema.org ItemList (`application/ld+json`) — usado quando o payload do __NEXT_DATA__ vem vazio ou muda de formato. */
function itemsFromJsonLd(html: string, term: string): MagaluItem[] {
  const items: MagaluItem[] = [];
  const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html))) {
    let parsed: any;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }

    for (const block of Array.isArray(parsed) ? parsed : [parsed]) {
      const listElements = block?.itemListElement;
      if (!Array.isArray(listElements)) continue;

      for (const el of listElements) {
        const product = el?.item ?? el;
        const id = product?.sku || product?.productID;
        const url = product?.url;
        const price = Number(product?.offers?.price ?? NaN);
        if (!id || !url || !Number.isFinite(price) || price <= 0) continue;

        items.push({
          id: String(id),
          title: product?.name || term,
          price,
          imageUrl: (Array.isArray(product?.image) ? product.image[0] : product?.image) || null,
          permalink: url,
        });
      }
    }
  }
  return items;
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
        // Busca aberta Magalu — a Developers API é seller-only via OAuth
        // (ver relatorio-api-magalu-developers.md), então não serve pra
        // descoberta de catálogo de mercado. Único caminho viável é ler a
        // página pública de busca.
        const searchUrl = `https://www.magazineluiza.com.br/busca/${encodeURIComponent(term)}/`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const html = await res.text();
          try {
            items = itemsFromNextData(html, term);
          } catch (jsonErr) {
            summary.errors.push(`Magalu (${term}): __NEXT_DATA__ malformado — ${(jsonErr as Error).message}`);
          }
          if (items.length === 0) {
            items = itemsFromJsonLd(html, term);
          }
        } else {
          summary.errors.push(`Magalu (${term}): HTTP ${res.status} na busca — provável bloqueio de bot/WAF (Akamai costuma barrar IP de datacenter)`);
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

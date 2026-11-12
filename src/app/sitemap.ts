import type { MetadataRoute } from 'next';
import { getDimensionOverrides } from '@/server/queries/catalog-dimensions';
import { and, desc, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, masterProducts, newsArticles } from '@/db/schema';
import { siteBaseUrl } from '@/lib/site-url';
import { GAMES } from '@/lib/catalog/verticais';

// Cache de 1 hora: o sitemap não precisa refletir cada coleta de preço.
export const revalidate = 3600;

const MAX_OFFERS = 5000;
const MAX_ARTICLES = 500;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/ofertas`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/black-friday`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/tabela-de-precos`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/noticias`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/plus`, changeFrequency: 'daily', priority: 0.6 },
  ];

  // Falha de consulta NÃO vira sitemap parcial/vazio: o erro sobe, o Next mantém o último sitemap
  // bom (ISR) em vez de cachear uma versão degradada.
  // Só ofertas públicas: ativas, com preço coletado e com cartela (imagem), de master aprovado
  // pelo porteiro. Veredito gravado 'review'/'rejected' fica de fora (salvo aprovação manual);
  // sem veredito gravado, vale o porteiro em leitura (getDimensionOverrides().hidden).
  const offers = await db
    .select({
      slug: affiliateOffers.slug,
      masterProductId: affiliateOffers.masterProductId,
      updatedAt: affiliateOffers.updatedAt,
    })
    .from(affiliateOffers)
    .innerJoin(masterProducts, eq(masterProducts.id, affiliateOffers.masterProductId))
    .where(
      and(
        // Allow-list do departamento (ADR 0008): oferta e master precisam ser Games.
        eq(affiliateOffers.vertical, GAMES),
        eq(masterProducts.vertical, GAMES),
        eq(affiliateOffers.status, 'active'),
        gt(affiliateOffers.currentPriceCents, 0),
        isNull(affiliateOffers.quarantinedAt), // preço absurdo em quarentena (migration 0023)
        isNotNull(affiliateOffers.imageUrl),
        ne(affiliateOffers.imageUrl, ''),
        sql`NOT (${masterProducts.attributes} ? 'mergedInto')`,
        sql`(COALESCE(${masterProducts.attributes} -> 'catalogGate' ->> 'verdict', 'approved') = 'approved'
             OR ${masterProducts.attributes} -> 'catalogGate' ->> 'manual' = 'approved')`,
      ),
    )
    .orderBy(desc(affiliateOffers.updatedAt))
    .limit(MAX_OFFERS);

  // Um produto, uma URL: várias ofertas do mesmo produto não viram várias entradas.
  const hidden = new Set((await getDimensionOverrides()).hidden);
  const seen = new Set<string>();
  for (const o of offers) {
    if (seen.has(o.masterProductId) || hidden.has(o.masterProductId)) continue;
    seen.add(o.masterProductId);
    entries.push({
      url: `${base}/ofertas/${encodeURIComponent(o.slug)}`,
      lastModified: o.updatedAt,
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }

  const articles = await db
    .select({ slug: newsArticles.slug, updatedAt: newsArticles.updatedAt })
    .from(newsArticles)
    .where(and(eq(newsArticles.status, 'published'), eq(newsArticles.kind, 'original')))
    .orderBy(desc(newsArticles.publishedAt))
    .limit(MAX_ARTICLES);
  for (const a of articles) {
    entries.push({
      url: `${base}/noticias/${encodeURIComponent(a.slug)}`,
      lastModified: a.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  return entries;
}

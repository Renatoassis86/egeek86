import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateCoupons, type AffiliateCoupon } from '@/db/schema';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { getProductStores, type ProductStoreRow } from '@/server/queries/product-stores';
import { getGameSynopsis, type GameSynopsis } from '@/server/queries/synopsis';
import { getMeliCatalogDetails, type MeliCatalogDetails } from '@/server/collector/sources/mercado-livre-details';
import { getMasterProductPriceHistory, type PriceHistoryResult } from '@/server/queries/price-history';

/**
 * Leituras da página de produto (/ofertas/[slug]) protegidas por cache SWR (src/lib/cache/swr.ts):
 * visita morna lê da memória; vencido serve o último valor bom e recalcula por trás; a frio ninguém espera
 * mais que `coldTimeoutSeconds` (a página trata falha com bloco omitido, nunca com dado inventado).
 * Só leitura: nada é gravado.
 */

export interface OfferPageCoupon {
  code: string;
  description: string | null;
  discountType: AffiliateCoupon['discountType'];
  discountValue: string;
}

async function loadCoupons(networkId: string): Promise<OfferPageCoupon[]> {
  const rows = await db
    .select({
      code: affiliateCoupons.code,
      description: affiliateCoupons.description,
      discountType: affiliateCoupons.discountType,
      discountValue: affiliateCoupons.discountValue,
    })
    .from(affiliateCoupons)
    .where(and(eq(affiliateCoupons.networkId, networkId), eq(affiliateCoupons.status, 'active')))
    .orderBy(desc(affiliateCoupons.createdAt));
  return rows;
}

/** Cupons ativos da rede (só os campos que a página mostra; sem Date, que não sobrevive ao cache JSON). */
export const getOfferPageCoupons = createCachedQuery(loadCoupons, ['offer-page-coupons-v1'], {
  revalidate: 120,
  coldTimeoutSeconds: 5,
  live: true,
  hardTimeoutSeconds: 20,
});

/** Lojas do produto (menor preço público por loja). */
export const getOfferPageStores: (masterProductId: string) => Promise<ProductStoreRow[]> = createCachedQuery(
  getProductStores,
  ['offer-page-stores-v1'],
  { revalidate: 60, coldTimeoutSeconds: 6, live: true, hardTimeoutSeconds: 20 }
);

/** Sinopse importada (muda raramente). */
export const getOfferPageSynopsis: (masterProductId: string) => Promise<GameSynopsis | null> = createCachedQuery(
  getGameSynopsis,
  ['offer-page-synopsis-v1'],
  { revalidate: 900, coldTimeoutSeconds: 4, live: true, hardTimeoutSeconds: 20 }
);

/** Galeria do catálogo do Mercado Livre (API externa, até 8 s): cache longo, a frio espera pouco. */
export const getOfferPageMeliDetails: (meliCatalogId: string) => Promise<MeliCatalogDetails | null> = createCachedQuery(
  getMeliCatalogDetails,
  ['offer-page-meli-details-v1'],
  { revalidate: 1800, maxStaleSeconds: 24 * 3600, coldTimeoutSeconds: 3 }
);

/** Histórico de 3 meses do gráfico (agregação pesada no banco): 5 min fresco. */
export const getOfferPageHistory3M: (masterProductId: string) => Promise<PriceHistoryResult> = createCachedQuery(
  (masterProductId: string) => getMasterProductPriceHistory(masterProductId, '3M'),
  ['offer-page-history-3m-v1'],
  { revalidate: 300, coldTimeoutSeconds: 2 }
);

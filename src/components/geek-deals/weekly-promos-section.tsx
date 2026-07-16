import { listRankedOffers, getOfferListingMetrics } from '@/server/queries/affiliate';
import { WeeklyPromosCarousel, type CarouselSlide } from './weekly-promos-carousel';

/**
 * Busca as ofertas reais pro carrossel — componente servidor, sem dado
 * mockado. Só físico (mesma decisão do SalesHighlights) — digital fica só
 * no filtro de /ofertas, não disputa destaque na home.
 */
export async function WeeklyPromosSection() {
  // Múltiplo de 3 (itens por slide do carrossel) — evita um último grupo capenga com 1-2 cards.
  const pool = await listRankedOffers({ sortBy: 'price_asc', limit: 9, gameFormat: 'physical' });
  if (pool.length === 0) return null;

  const metricsMap = await getOfferListingMetrics(pool.map((o) => o.id));

  const slides: CarouselSlide[] = pool.map((offer) => {
    const m = metricsMap.get(offer.id);
    return {
      slug: offer.slug,
      title: offer.title,
      imageUrl: offer.imageUrl,
      networkName: offer.network.name,
      currentPriceCents: offer.currentPriceCents,
      avgDiscountPercent: m?.avgDiscountPercent ?? null,
      isLowestEver: m?.isLowestEver ?? false,
    };
  });

  return <WeeklyPromosCarousel slides={slides} />;
}

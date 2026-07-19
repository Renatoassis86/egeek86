import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { listRankedOffers, getOfferListingMetrics } from '@/server/queries/affiliate';
import { WeeklyPromosCarousel, type CarouselSlide } from './weekly-promos-carousel';

/**
 * Busca as ofertas reais pro carrossel — componente servidor, sem dado
 * mockado. Só físico (mesma decisão do SalesHighlights) — digital fica só
 * no filtro de /ofertas, não disputa destaque na home.
 */
export async function WeeklyPromosSection() {
  try {
    const pool = await listRankedOffers({ sortBy: 'price_asc', limit: 9, gameFormat: 'physical' });
    if (pool.length === 0) return null;

    const metricsMap = await getOfferListingMetrics(pool.map((o) => o.id));
    const lowestEverCount = pool.filter((o) => metricsMap.get(o.id)?.isLowestEver).length;

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

    return (
      <div>
        <div className="mx-auto max-w-7xl px-4 pt-10 lg:px-8 lg:pt-14">
          <Text variant="label" color="hype">
            Geek Deals · Ofertas da semana
          </Text>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <Text as="h2" variant="display-lg" className="max-w-[20ch]">
              Preço em queda essa semana.
            </Text>
            {lowestEverCount > 0 && (
              <Badge variant="hype" size="lg">
                <Flame className="size-3.5" />
                {lowestEverCount} no menor preço já visto
              </Badge>
            )}
          </div>
        </div>
        <WeeklyPromosCarousel slides={slides} />
      </div>
    );
  } catch (e) {
    console.error('Erro em WeeklyPromosSection:', e);
    return null;
  }
}

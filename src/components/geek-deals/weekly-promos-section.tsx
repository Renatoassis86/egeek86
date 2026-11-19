import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { isHighlightEligibleSeller, sellerTier } from '@/lib/affiliate/price-verdict';
import { listRankedOffers, getOfferListingMetrics } from '@/server/queries/affiliate';
import { hierarquiaLigada } from '@/lib/vitrine/hierarquia';
import { hierarquizarOfertas } from '@/lib/vitrine/hierarquia-ofertas';
import { carregarPopularidade } from '@/server/vitrine-popularidade';

const SLIDES = 9;
import { WeeklyPromosCarousel, type CarouselSlide } from './weekly-promos-carousel';

/**
 * Busca as ofertas reais pro carrossel — componente servidor, sem dado
 * mockado. Só físico (mesma decisão do SalesHighlights) — digital fica só
 * no filtro de /ofertas, não disputa destaque na home.
 */
export async function WeeklyPromosSection() {
  try {
    // Hierarquia da vitrine (VITRINE_HIERARQUIA): le um pool maior (mesma lista em cache) e a hierarquia escolhe os 9; off = os 9 mais baratos como antes.
    const ligada = hierarquiaLigada();
    const tam = ligada ? 30 : SLIDES;
    let pool = await listRankedOffers({ sortBy: 'price_asc', limit: tam, gameFormat: 'physical' });
    if (pool.length === 0) {
      pool = await listRankedOffers({ sortBy: 'price_asc', limit: tam });
    }
    // Destaque não promove vendedor de reputação baixa (F-24).
    pool = pool.filter((o) => isHighlightEligibleSeller(o.seller));
    if (pool.length === 0) return null;

    const [metricsMap, popMap] = await Promise.all([getOfferListingMetrics(pool.map((o) => o.id)), ligada ? carregarPopularidade() : Promise.resolve(new Map<string, number>())]);
    if (ligada) pool = hierarquizarOfertas(pool, metricsMap, popMap).slice(0, SLIDES);
    const lowestEverCount = pool.filter((o) => metricsMap.get(o.id)?.isLowestEver && sellerTier(o.seller) !== 'low').length;

    const slides: CarouselSlide[] = pool.map((offer) => {
      const m = metricsMap.get(offer.id);
      return {
        slug: offer.slug,
        title: offer.title,
        imageUrl: offer.imageUrl,
        networkName: offer.network.name,
        currentPriceCents: offer.currentPriceCents,
        // só "abaixo do normal" (fora da faixa ±5%) carrega percentual
        avgDiscountPercent: m?.verdict?.kind === 'below' && m.verdict.deltaPercent != null ? Math.round(-m.verdict.deltaPercent) : null,
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

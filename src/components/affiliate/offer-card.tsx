import Link from 'next/link';
import { Flame, ShieldCheck, Tag, TrendingDown, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import {
  GAME_FORMAT_LABELS,
  GAME_PLATFORM_GEN_LABELS,
  getSellerTrustInfo,
  sellerTrustTextColor,
} from '@/lib/affiliate/labels';
import type { OfferListingMetrics, OfferWithRelations } from '@/server/queries/affiliate';

export function OfferCard({
  offer,
  metrics,
  variant = 'grid',
}: {
  offer: OfferWithRelations;
  /** Métricas em lote (menor histórico, desconto) — opcional, card degrada bem sem elas. */
  metrics?: OfferListingMetrics;
  /**
   * 'feature' = card horizontal maior, reservado pra seção "Melhores ofertas
   * agora" — dá hierarquia visual real ao diferencial do produto (menor
   * preço/desconto) em vez de todo card competir igual numa grade uniforme.
   * 'grid' = card padrão vertical da vitrine.
   */
  variant?: 'grid' | 'feature';
}) {
  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  const trust = getSellerTrustInfo(offer.seller);
  const isFeature = variant === 'feature';

  const specLine = [
    offer.masterProduct.gameFormat !== 'unknown' ? GAME_FORMAT_LABELS[offer.masterProduct.gameFormat] : null,
    offer.masterProduct.gamePlatformGen !== 'unknown' ? GAME_PLATFORM_GEN_LABELS[offer.masterProduct.gamePlatformGen] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link href={`/ofertas/${offer.slug}`} className="group block h-full">
      <Card
        interactive
        className={cn('h-full overflow-hidden', isFeature ? 'flex flex-col sm:flex-row' : 'flex flex-col')}
      >
        <div
          className={cn(
            'relative shrink-0 bg-[var(--color-bg-inset)] overflow-hidden',
            isFeature ? 'aspect-[4/3] sm:aspect-square sm:w-[42%]' : 'aspect-[4/5]'
          )}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={offer.title}
              className="h-full w-full object-contain p-3 transition-transform duration-[var(--duration-medium)] group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Tag className="size-10 text-[var(--color-text-tertiary)]" aria-hidden />
            </div>
          )}

          {metrics?.avgDiscountPercent ? (
            <span
              className="absolute left-2 top-2 z-10 inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-accent-danger)] px-2 py-1 text-[13px] font-bold leading-none text-white shadow-[var(--shadow-md)]"
              title="Desconto em relação à média de preço dos últimos 30 dias"
            >
              -{metrics.avgDiscountPercent}%
            </span>
          ) : null}

          <Badge
            variant="outline"
            size="sm"
            className="absolute right-2 top-2 z-10 max-w-[55%] truncate bg-[var(--color-bg-canvas)]/80 backdrop-blur-sm"
            style={offer.network.colorHex ? { borderColor: offer.network.colorHex } : undefined}
          >
            {offer.network.name}
          </Badge>

        </div>

        <CardContent className={cn('flex flex-1 flex-col gap-2', isFeature ? 'p-4 sm:p-5 sm:justify-center' : 'p-4')}>
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            {specLine && (
              <Text variant="caption" color="tertiary" className="flex-1 min-w-0 truncate uppercase tracking-[0.04em]">
                {specLine}
              </Text>
            )}
            {metrics?.isLowestEver && (
              <Badge variant="hype" size="sm" className="flex-shrink-0 shrink-0 whitespace-nowrap">
                <Flame className="size-3" />
                Menor já visto
              </Badge>
            )}
          </div>

          <Text
            variant={isFeature ? 'body-md' : 'body-sm'}
            className={cn('line-clamp-2 overflow-hidden text-ellipsis font-medium', isFeature ? 'min-h-11' : 'min-h-10')}
          >
            {offer.title}
          </Text>

          <div className="mt-auto flex flex-col gap-1">
            {offer.currentPriceCents > 0 ? (
              <>
                {metrics?.avgPriceCents30d != null && (
                  <Text
                    variant="caption"
                    color="tertiary"
                    className={cn(metrics.avgPriceCents30d > offer.currentPriceCents && 'line-through')}
                  >
                    Preço médio: {formatBRL(metrics.avgPriceCents30d)}
                  </Text>
                )}
                <Text
                  variant="mono-lg"
                  color="primary"
                  className={cn('leading-none', isFeature ? 'text-[26px] sm:text-[30px]' : 'text-[21px]')}
                >
                  {formatBRL(offer.currentPriceCents)}
                </Text>

                {metrics && !metrics.isLowestEver && (
                  <Text variant="caption" color="secondary" className="inline-flex items-center gap-1">
                    <TrendingDown className="size-3" aria-hidden />
                    Menor já visto: {formatBRL(metrics.lowestPriceCents)}
                  </Text>
                )}
              </>
            ) : (
              // Item descoberto automaticamente, ainda sem nenhuma coleta de
              // preço concluída — nunca mostrar "R$ 0,00" (parece grátis/quebrado).
              <Text variant="body-sm" color="tertiary" className="italic">
                Coletando preço...
              </Text>
            )}
          </div>

          {trust && (
            <Text
              variant="caption"
              color={sellerTrustTextColor(trust.variant)}
              className="inline-flex items-center gap-1"
            >
              <ShieldCheck className="size-3" aria-hidden />
              {trust.label}
            </Text>
          )}

          {offer.highlightNote && (
            <Text variant="caption" color="hype" className="block">
              {offer.highlightNote}
            </Text>
          )}

          {isFeature && (
            <span className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-[var(--color-accent-primary)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100">
              Ver oferta <ArrowUpRight className="size-3.5" aria-hidden />
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

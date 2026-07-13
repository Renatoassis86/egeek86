import Link from 'next/link';
import { Flame, ShieldCheck, Tag, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
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
}: {
  offer: OfferWithRelations;
  /** Métricas em lote (menor histórico, desconto) — opcional, card degrada bem sem elas. */
  metrics?: OfferListingMetrics;
}) {
  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  const trust = getSellerTrustInfo(offer.seller);

  const showFormatBadge = offer.masterProduct.gameFormat !== 'unknown';
  const showGenBadge = offer.masterProduct.gamePlatformGen !== 'unknown';

  return (
    <Link href={`/ofertas/${offer.slug}`} className="group block h-full">
      <Card interactive className="h-full overflow-hidden flex flex-col">
        <div className="relative aspect-square bg-[var(--color-bg-inset)] flex items-center justify-center overflow-hidden">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={offer.title}
              className="h-full w-full object-cover transition-transform duration-[var(--duration-medium)] group-hover:scale-[1.04]"
            />
          ) : (
            <Tag className="size-10 text-[var(--color-text-tertiary)]" aria-hidden />
          )}

          <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
            {metrics?.discountPercent ? (
              <Badge variant="danger" size="sm">
                -{metrics.discountPercent}%
              </Badge>
            ) : (
              <span />
            )}
            <Badge
              variant="outline"
              size="sm"
              className="bg-[var(--color-bg-canvas)]/80 backdrop-blur-sm"
              style={offer.network.colorHex ? { borderColor: offer.network.colorHex } : undefined}
            >
              {offer.network.name}
            </Badge>
          </div>

          {metrics?.isLowestEver && (
            <div className="absolute inset-x-2 bottom-2">
              <Badge variant="hype" size="sm" className="w-fit">
                <Flame className="size-3" />
                Menor preço já visto
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-4 flex flex-col gap-2 flex-1">
          {(showFormatBadge || showGenBadge) && (
            <div className="flex flex-wrap gap-1.5">
              {showFormatBadge && (
                <Badge variant="outline" size="sm">
                  {GAME_FORMAT_LABELS[offer.masterProduct.gameFormat]}
                </Badge>
              )}
              {showGenBadge && (
                <Badge variant="outline" size="sm">
                  {GAME_PLATFORM_GEN_LABELS[offer.masterProduct.gamePlatformGen]}
                </Badge>
              )}
            </div>
          )}

          <Text variant="body-sm" className="line-clamp-2 min-h-10">
            {offer.title}
          </Text>

          <div className="mt-auto flex flex-col gap-1">
            {metrics?.listPriceCents && metrics.listPriceCents > offer.currentPriceCents && (
              <Text variant="caption" color="tertiary" className="line-through">
                {formatBRL(metrics.listPriceCents)}
              </Text>
            )}
            <Text variant="mono-md" className="tabular block">
              {formatBRL(offer.currentPriceCents)}
            </Text>

            {metrics && !metrics.isLowestEver && (
              <Text variant="caption" color="secondary" className="inline-flex items-center gap-1">
                <TrendingDown className="size-3" aria-hidden />
                Menor já visto: {formatBRL(metrics.lowestPriceCents)}
              </Text>
            )}
          </div>

          {trust && (
            <Text variant="caption" color={sellerTrustTextColor(trust.variant)} className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3" aria-hidden />
              {trust.label}
            </Text>
          )}

          {offer.highlightNote && (
            <Text variant="caption" color="hype" className="block">
              {offer.highlightNote}
            </Text>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

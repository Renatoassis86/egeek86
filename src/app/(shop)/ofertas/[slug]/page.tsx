import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Flame,
  ShieldCheck,
  Tag,
  TrendingDown,
  TrendingUp,
  Minus,
  Star,
  BadgeCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { Reveal } from '@/components/motion/reveal';
import { formatBRL, formatDiscountLabel } from '@/lib/format';
import { isLowestPrice } from '@/lib/affiliate/message-template';
import {
  GAME_FORMAT_LABELS,
  GAME_PLATFORM_GEN_LABELS,
  GAME_EDITION_TYPE_LABELS,
  getSellerTrustInfo,
  sellerTrustTextColor,
} from '@/lib/affiliate/labels';
import { getOfferBySlug, getOfferMetrics, listActiveCouponsByNetwork } from '@/server/queries/affiliate';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) return {};

  return {
    title: offer.title,
    description: `${offer.title} por ${formatBRL(offer.currentPriceCents)} na ${offer.network.name}. Confira histórico de preço e cupons no Espaço Geek 86.`,
  };
}

const TREND_META = {
  down: { label: 'Preço em queda', Icon: TrendingDown, color: 'success' as const },
  up: { label: 'Preço subindo', Icon: TrendingUp, color: 'danger' as const },
  stable: { label: 'Preço estável', Icon: Minus, color: 'secondary' as const },
};

export default async function OfferDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  const [metrics, coupons] = await Promise.all([
    getOfferMetrics(offer.id),
    listActiveCouponsByNetwork(offer.networkId),
  ]);

  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  const isLowest = metrics ? isLowestPrice(offer.currentPriceCents, metrics.lowestPriceCents) : false;
  const trend = metrics ? TREND_META[metrics.trend] : null;
  const trustInfo = getSellerTrustInfo(offer.seller);

  const hasClassification =
    offer.masterProduct.gameFormat !== 'unknown' ||
    offer.masterProduct.gamePlatformGen !== 'unknown' ||
    offer.masterProduct.gameEditionType !== 'unknown';

  return (
    <section className="mx-auto max-w-5xl px-4 lg:px-8 py-10 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-2">
        <Reveal>
          <div className="aspect-square rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] flex items-center justify-center overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={offer.title} className="h-full w-full object-cover" />
            ) : (
              <Tag className="size-16 text-[var(--color-text-tertiary)]" aria-hidden />
            )}
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" size="md">
                {offer.network.name}
              </Badge>
              {hasClassification && (
                <>
                  {offer.masterProduct.gameFormat !== 'unknown' && (
                    <Badge variant="outline" size="md">
                      {GAME_FORMAT_LABELS[offer.masterProduct.gameFormat]}
                    </Badge>
                  )}
                  {offer.masterProduct.gamePlatformGen !== 'unknown' && (
                    <Badge variant="outline" size="md">
                      {GAME_PLATFORM_GEN_LABELS[offer.masterProduct.gamePlatformGen]}
                    </Badge>
                  )}
                  {offer.masterProduct.gameEditionType !== 'unknown' && (
                    <Badge variant="outline" size="md">
                      {GAME_EDITION_TYPE_LABELS[offer.masterProduct.gameEditionType]}
                    </Badge>
                  )}
                </>
              )}
            </div>

            <Text as="h1" variant="heading-xl">
              {offer.title}
            </Text>

            {isLowest && (
              <Badge variant="hype" size="lg" className="w-fit">
                <Flame className="size-3.5" />
                Menor preço já registrado
              </Badge>
            )}

            <Text variant="display-md" className="tabular">
              {formatBRL(offer.currentPriceCents)}
            </Text>

            {metrics && (
              <div className="flex flex-wrap items-center gap-2">
                {trend && (
                  <Badge variant={trend.color === 'secondary' ? 'default' : trend.color} size="md">
                    <trend.Icon className="size-3.5" />
                    {trend.label}
                  </Badge>
                )}
                <Text variant="body-sm" color="secondary">
                  Menor histórico: {formatBRL(metrics.lowestPriceCents)} (em{' '}
                  {metrics.lowestPriceAt.toLocaleDateString('pt-BR')})
                  {metrics.avgPriceCents30d != null && <> · Média 30d: {formatBRL(metrics.avgPriceCents30d)}</>}
                </Text>
              </div>
            )}

            {metrics && <PriceRangeBar currentPriceCents={offer.currentPriceCents} metrics={metrics} />}

            {coupons.length > 0 && (
              <Card variant="outline">
                <CardContent className="p-4">
                  <Text variant="label" color="tertiary">
                    Cupom disponível
                  </Text>
                  <Text variant="body-md" className="font-mono mt-1">
                    {coupons[0].code} — {formatDiscountLabel(coupons[0].discountType, coupons[0].discountValue)}
                  </Text>
                  {coupons[0].description && (
                    <Text variant="caption" color="secondary">
                      {coupons[0].description}
                    </Text>
                  )}
                </CardContent>
              </Card>
            )}

            <Button asChild size="lg" leftIcon={<ShieldCheck className="size-4" />}>
              <a href={`/go/${offer.slug}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                Ver oferta na {offer.network.name}
              </a>
            </Button>

            {offer.highlightNote && (
              <Text variant="caption" color="hype">
                {offer.highlightNote}
              </Text>
            )}

            {offer.seller && (
              <>
                <Separator className="my-1" />
                <Card variant="ghost" className="border border-[var(--color-border-subtle)]">
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="size-4 text-[var(--color-text-tertiary)]" aria-hidden />
                      <Text variant="heading-sm">Vendedor</Text>
                    </div>
                    <Text variant="body-sm">{offer.seller.nickname ?? 'Vendedor não identificado'}</Text>
                    {trustInfo && (
                      <Text
                        variant="caption"
                        color={sellerTrustTextColor(trustInfo.variant)}
                        className="inline-flex items-center gap-1"
                      >
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {trustInfo.label}
                      </Text>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      {offer.seller.totalSales != null && (
                        <Text variant="caption" color="tertiary">
                          {offer.seller.totalSales.toLocaleString('pt-BR')} vendas
                        </Text>
                      )}
                      {offer.seller.positiveRatingPercent != null && (
                        <Text variant="caption" color="tertiary" className="inline-flex items-center gap-1">
                          <Star className="size-3" aria-hidden />
                          {offer.seller.positiveRatingPercent}% avaliações positivas
                        </Text>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Barra visual leve (sem lib de gráfico) posicionando o preço atual e a
 * média de 30d entre o menor histórico e o teto conhecido — dá noção de
 * "onde" o preço de hoje está sem precisar ler 3 números separados.
 */
function PriceRangeBar({
  currentPriceCents,
  metrics,
}: {
  currentPriceCents: number;
  metrics: { lowestPriceCents: number; avgPriceCents30d: number | null };
}) {
  const low = metrics.lowestPriceCents;
  const high = Math.max(currentPriceCents, metrics.avgPriceCents30d ?? low, low);
  const range = high - low;
  if (range <= 0) return null;

  const currentPct = Math.min(100, Math.max(0, ((currentPriceCents - low) / range) * 100));
  const avgPct =
    metrics.avgPriceCents30d != null
      ? Math.min(100, Math.max(0, ((metrics.avgPriceCents30d - low) / range) * 100))
      : null;

  return (
    <div className="mt-1">
      <div className="relative h-2 rounded-[var(--radius-full)] bg-[var(--color-bg-elevated)]">
        <div
          className="absolute inset-y-0 left-0 rounded-[var(--radius-full)] bg-[var(--color-accent-success)]/40"
          style={{ width: `${currentPct}%` }}
          aria-hidden
        />
        {avgPct != null && (
          <div
            className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-[var(--color-text-tertiary)]"
            style={{ left: `${avgPct}%` }}
            aria-hidden
            title="Média 30 dias"
          />
        )}
        <div
          className="absolute top-1/2 size-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--color-bg-canvas)] bg-[var(--color-accent-primary)]"
          style={{ left: `${currentPct}%` }}
          aria-hidden
          title="Preço atual"
        />
      </div>
      <div className="mt-1.5 flex justify-between">
        <Text variant="caption" color="tertiary">
          {formatBRL(low)} (menor já visto)
        </Text>
        <Text variant="caption" color="tertiary">
          {formatBRL(high)}
        </Text>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Flame,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Star,
  BadgeCheck,
  LineChart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage } from '@/components/motion/scene-image';
import { PriceRangeBar } from '@/components/geek-deals/price-range-bar';
import { WatchToggleButton } from '@/components/geek-deals/watch-toggle-button';
import { CartToggleButton } from '@/components/affiliate/cart-toggle-button';
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
import { getWatchedMasterProductIds } from '@/server/queries/price-watches';
import { getCartOfferIds } from '@/server/queries/cart';
import { getCurrentProfile } from '@/lib/auth/require-admin';

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

  const [metrics, coupons, profile] = await Promise.all([
    getOfferMetrics(offer.id),
    listActiveCouponsByNetwork(offer.networkId),
    getCurrentProfile(),
  ]);
  const isWatching = profile
    ? (await getWatchedMasterProductIds(profile.id)).has(offer.masterProductId)
    : false;
  const isInCart = profile ? (await getCartOfferIds(profile.id)).has(offer.id) : false;

  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  const isLowest = metrics ? isLowestPrice(offer.currentPriceCents, metrics.lowestPriceCents) : false;
  const trend = metrics ? TREND_META[metrics.trend] : null;
  const trustInfo = getSellerTrustInfo(offer.seller);

  const hasClassification =
    offer.masterProduct.gameFormat !== 'unknown' ||
    offer.masterProduct.gamePlatformGen !== 'unknown' ||
    offer.masterProduct.gameEditionType !== 'unknown';

  const specLine = [
    offer.masterProduct.gameFormat !== 'unknown' ? GAME_FORMAT_LABELS[offer.masterProduct.gameFormat] : null,
    offer.masterProduct.gamePlatformGen !== 'unknown' ? GAME_PLATFORM_GEN_LABELS[offer.masterProduct.gamePlatformGen] : null,
    offer.masterProduct.gameEditionType !== 'unknown' ? GAME_EDITION_TYPE_LABELS[offer.masterProduct.gameEditionType] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="mx-auto max-w-6xl px-4 lg:px-8 py-8 lg:py-14">
      <Link
        href="/ofertas"
        className="inline-flex items-center gap-1.5 text-body-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Ofertas
      </Link>

      <div className="mt-5 grid gap-8 lg:gap-14 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] aspect-square lg:sticky lg:top-24">
          <Glow color="gold" size="md" className="-top-16 -right-16" intensity={0.22} />
          <SceneImage src={image} alt={offer.title} tone="gold" fit="contain" className="relative" priority />

          <div className="absolute left-3 top-3">
            <Badge
              variant="outline"
              size="md"
              className="bg-[var(--color-bg-canvas)]/85 backdrop-blur-sm"
              style={offer.network.colorHex ? { borderColor: offer.network.colorHex } : undefined}
            >
              {offer.network.name}
            </Badge>
          </div>

          {isLowest && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-[var(--color-accent-hype)]/95 py-2.5">
              <Flame className="size-4 text-[var(--color-text-inverse)]" aria-hidden />
              <Text variant="body-sm" color="inverse" className="font-semibold">
                Menor preço já registrado
              </Text>
            </div>
          )}
        </div>

        <Reveal delay={0.06}>
          <div className="flex flex-col gap-5">
            {hasClassification && (
              <Text variant="label" color="tertiary" className="uppercase tracking-[0.04em]">
                {specLine}
              </Text>
            )}

            <Text as="h1" variant="heading-xl" className="lg:text-display-md">
              {offer.title}
            </Text>

            <div className="flex flex-col gap-1">
              {offer.currentPriceCents > 0 ? (
                <>
                  <Text variant="display-lg" color="primary" className="tabular leading-none">
                    {formatBRL(offer.currentPriceCents)}
                  </Text>
                  {metrics?.avgPriceCents30d != null && (
                    <Text variant="body-sm" color="secondary">
                      Média dos últimos 30 dias: {formatBRL(metrics.avgPriceCents30d)}
                    </Text>
                  )}
                </>
              ) : (
                <Text variant="heading-lg" color="tertiary" className="italic">
                  Coletando preço...
                </Text>
              )}
            </div>

            {metrics && (
              <Card variant="outline" className="border-[var(--color-border-default)]">
                <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text variant="label" color="tertiary" className="inline-flex items-center gap-1.5">
                      <LineChart className="size-3.5" aria-hidden />
                      Histórico de preço
                    </Text>
                    {trend && (
                      <Badge variant={trend.color === 'secondary' ? 'default' : trend.color} size="sm">
                        <trend.Icon className="size-3.5" />
                        {trend.label}
                      </Badge>
                    )}
                  </div>

                  <PriceRangeBar currentPriceCents={offer.currentPriceCents} metrics={metrics} />

                  <Text variant="caption" color="tertiary">
                    Menor preço em {metrics.lowestPriceAt.toLocaleDateString('pt-BR')} · {metrics.snapshotCount}{' '}
                    coletas registradas
                  </Text>
                </CardContent>
              </Card>
            )}

            {coupons.length > 0 && (
              <Card variant="outline" className="border-dashed border-[var(--color-accent-primary)]/40">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Text variant="label" color="tertiary">
                      Cupom disponível
                    </Text>
                    <Text variant="body-md" className="font-mono mt-1 text-[var(--color-accent-primary)] truncate">
                      {coupons[0].code}
                    </Text>
                    {coupons[0].description && (
                      <Text variant="caption" color="secondary" className="mt-0.5">
                        {coupons[0].description}
                      </Text>
                    )}
                  </div>
                  <Badge variant="primary" size="md" className="shrink-0">
                    {formatDiscountLabel(coupons[0].discountType, coupons[0].discountValue)}
                  </Badge>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-2">
              {offer.affiliateLinkPending ? (
                <Button
                  size="lg"
                  disabled
                  className="flex-1 sm:flex-none"
                  title="Esse item ainda está sendo preparado — o link de compra libera em breve."
                >
                  <ShieldCheck className="size-4" />
                  Link de compra em preparação
                </Button>
              ) : (
                <Button asChild size="lg" className="flex-1 sm:flex-none">
                  <a href={`/go/${offer.slug}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                    <ShieldCheck className="size-4" />
                    {`Ver oferta na ${offer.network.name}`}
                  </a>
                </Button>
              )}
              {profile ? (
                <>
                  <WatchToggleButton masterProductId={offer.masterProductId} initialWatching={isWatching} />
                  <CartToggleButton offerId={offer.id} initialInCart={isInCart} />
                </>
              ) : (
                <Button asChild variant="outline" size="lg">
                  <a href={`/entrar?next=/ofertas/${offer.slug}`}>Acompanhar preço</a>
                </Button>
              )}
            </div>

            {offer.highlightNote && (
              <Text variant="caption" color="hype">
                {offer.highlightNote}
              </Text>
            )}

            {offer.seller && (
              <>
                <Separator className="my-1" />
                <Card variant="ghost" className="border border-[var(--color-border-subtle)]">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="size-4 text-[var(--color-text-tertiary)]" aria-hidden />
                      <Text variant="heading-sm">Vendedor</Text>
                    </div>
                    <Text variant="body-sm">{offer.seller.nickname ?? 'Vendedor não identificado'}</Text>
                    {trustInfo && (
                      <Text
                        variant="caption"
                        color={sellerTrustTextColor(trustInfo.variant)}
                        className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-bg-elevated)] px-2.5 py-1"
                      >
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {trustInfo.label}
                      </Text>
                    )}
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
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

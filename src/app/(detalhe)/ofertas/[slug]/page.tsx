import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Flame,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Star,
  BadgeCheck,
  LineChart,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { Reveal } from '@/components/motion/reveal';
import { isBundleTitle } from '@/lib/affiliate/product-type-classifier';
import { ProductImage } from '@/components/ui/product-image';
import { PriceRangeBar } from '@/components/geek-deals/price-range-bar';
import { WatchToggleButton } from '@/components/geek-deals/watch-toggle-button';
import { ProductStoresTable } from '@/components/search/product-stores-table';
import { CartToggleButton } from '@/components/affiliate/cart-toggle-button';
import { GameAboutSection } from '@/components/affiliate/game-about-section';
import { formatBRL, formatDiscountLabel } from '@/lib/format';
import { isLowestPrice } from '@/lib/affiliate/message-template';
import {
  GAME_FORMAT_LABELS,
  GAME_PLATFORM_GEN_LABELS,
  GAME_EDITION_TYPE_LABELS,
  getSellerTrustInfo,
  sellerTrustTextColor,
} from '@/lib/affiliate/labels';
import { computeVerdict } from '@/lib/affiliate/price-verdict';
import { getMasterProductPriceStats } from '@/server/queries/product-price-stats';
import { isPriceMetricsV2Enabled, isProductCardV1Enabled } from '@/lib/pricing/price-metrics-config';
import { getPriceMetricsV2 } from '@/server/pricing/price-metrics-v2';
import { PriceMetricsV2Block } from '@/components/affiliate/price-metrics-v2-block';
import { ProductCardV1, AvisoTransicaoSelo } from '@/components/affiliate/product-card-v1';
import { buildParecerProduto } from '@/lib/pricing/parecer-produto';
import { ProductPriceChartSection, ProductPriceChartFallback } from './product-price-chart-section';
import { getOfferBySlug, getMasterProductMetrics } from '@/server/queries/affiliate';
import {
  getOfferPageCoupons,
  getOfferPageStores,
  getOfferPageSynopsis,
  getOfferPageMeliDetails,
  getOfferPageHistory3M,
} from '@/server/queries/offer-page-data';
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
};

const VERDICT_LABEL = {
  below: 'Abaixo do normal',
  inline: 'Em linha com o normal',
  above: 'Acima do normal',
} as const;

export default async function OfferDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  // Tudo em paralelo e protegido por cache SWR/timeout (src/server/queries/offer-page-data.ts); bloco que falha
  // some ou cai no vazio honesto, nunca vira dado inventado. Observação do usuário e carrinho dependem só do perfil.
  // Histórico do gráfico (Suspense mais abaixo) começa AGORA, em paralelo; a seção só reaproveita a mesma leitura em cache.
  void getOfferPageHistory3M(offer.masterProductId).catch(() => null);
  const profileP = getCurrentProfile();
  const watchingP = profileP.then((p) =>
    p ? getWatchedMasterProductIds(p.id).then((ids) => ids.has(offer.masterProductId)).catch(() => false) : false
  );
  const inCartP = profileP.then((p) =>
    p ? getCartOfferIds(p.id).then((ids) => ids.has(offer.id)).catch(() => false) : false
  );
  // Métricas V2 (fase 2, ata 2026-11-05) atrás da flag PRICE_METRICS_V2 (desligada por padrão). Falha ou flag desligada => null => comportamento anterior.
  const v2P = isPriceMetricsV2Enabled() ? getPriceMetricsV2(offer.masterProductId).catch(() => null) : Promise.resolve(null);
  const [metrics, coupons, profile, meliDetails, stores, synopsis, stats, isWatching, isInCart, v2] = await Promise.all([
    getMasterProductMetrics(offer.masterProductId).catch(() => null),
    getOfferPageCoupons(offer.networkId).catch(() => []),
    profileP,
    offer.masterProduct.meliCatalogId ? getOfferPageMeliDetails(offer.masterProduct.meliCatalogId).catch(() => null) : Promise.resolve(null),
    getOfferPageStores(offer.masterProductId).catch(() => []),
    getOfferPageSynopsis(offer.masterProductId).catch(() => null),
    getMasterProductPriceStats(offer.masterProductId, { coldTimeoutMs: 6_000, direct: true }).catch(() => null),
    watchingP,
    inCartP,
    v2P,
  ]);

  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  // Galeria/sinopse real do catálogo do Mercado Livre (nunca fabricada) — só
  // aparece quando meliDetails traz conteúdo de verdade; sem isso, a seção
  // inteira fica oculta em vez de mostrar um "sem descrição" pro cliente.
  const galleryImages = (meliDetails?.pictures.length ? meliDetails.pictures : images ?? []).filter((url) => url !== image);
  const hasAboutSection = Boolean(synopsis) || galleryImages.length > 0;
  // Selo só com histórico elegível (>= 5 cotações e >= 14 dias, ADR 0001/0002): com 1 cotação, atual <= menor é verdade por definição.
  const isLowestLegacy = metrics?.isLowestEver === true && isLowestPrice(offer.currentPriceCents, metrics.lowestPriceCents);
  // V2: o selo "Menor preço do período" só existe com o juízo ligado (VERDICT_JUDGEMENT_ENABLED) e corroborado.
  const isLowest = v2 ? v2.judgement?.lowestPeriod === true : isLowestLegacy;
  // Aviso de transição: o selo novo difere do antigo.
  const sealTransition = v2 != null && isLowest !== isLowestLegacy;
  // Só queda/alta com histórico elegível; sem movimento confirmado, nenhum rótulo (nunca "estável" fixo).
  // Com PRICE_METRICS_V2 ligada o selo antigo de tendência não existe (histórico curto não sustenta "subindo/em queda"; D3).
  const trend = !isPriceMetricsV2Enabled() && metrics && metrics.trend !== 'stable' ? TREND_META[metrics.trend] : null;
  const verdict = stats
    ? computeVerdict({
        currentCents: offer.currentPriceCents,
        avgCents: stats.avgCents,
        quoteCount: stats.quoteCount,
        historyDays: stats.historyDays,
      })
    : null;
  // "Menor já visto" nunca fica acima do preço de hoje.
  const lowestSeenCents =
    stats?.lowAll && offer.currentPriceCents > 0
      ? Math.min(stats.lowAll.priceCents, offer.currentPriceCents)
      : (stats?.lowAll?.priceCents ?? null);
  const lowestIsToday = stats?.lowAll != null && offer.currentPriceCents > 0 && offer.currentPriceCents < stats.lowAll.priceCents;
  // medianCents entra na estatística canônica pela frente de preços; opcional até lá.
  const medianCents = (stats as { medianCents?: number | null } | null)?.medianCents ?? null;
  // Cartão-pai (Fase 1) atrás de PRODUCT_CARD_V1 (desligada por padrão): só com a leitura V2 disponível; senão o bloco atual.
  const parecer = v2 && isProductCardV1Enabled() ? buildParecerProduto(v2) : null;
  const trustInfo = getSellerTrustInfo(offer.seller);
  // Com PRICE_METRICS_V2 ligada a seção do gráfico sempre existe (sem dado medido ela mostra o cartão "sem histórico medido").
  const chartNode =
    isPriceMetricsV2Enabled() || (stats && stats.quoteCount >= 2) ? (
      <Suspense fallback={<ProductPriceChartFallback />}>
        <ProductPriceChartSection
          masterProductId={offer.masterProductId}
          canonical={
            stats
              ? {
                  avgCents: stats.avgCents,
                  quoteCount: stats.quoteCount,
                  historyDays: stats.historyDays,
                  lowAll: stats.lowAll ? { priceCents: stats.lowAll.priceCents } : null,
                  currentLowestActive: stats.currentLowestActive ? { priceCents: stats.currentLowestActive.priceCents } : null,
                }
              : null
          }
          currentPriceCents={stats?.currentLowestActive?.priceCents ?? offer.currentPriceCents}
        />
      </Suspense>
    ) : null;


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
        <div className="flex min-w-0 flex-col lg:sticky lg:top-24">
          <ProductImage src={image} alt={offer.title} dimension={offer.masterProduct.productType} bundle={isBundleTitle(offer.title)} priority padding="sm" className="w-full" />

          {/* Loja e selo ficam numa faixa abaixo do quadro, nunca sobre a foto */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 border border-t-0 border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-2.5">
            <Badge
              variant="outline"
              size="md"
              className="max-w-full truncate"
              style={offer.network.colorHex ? { borderColor: offer.network.colorHex } : undefined}
            >
              {offer.network.name}
            </Badge>
            {isLowest && (
              <span className="inline-flex items-center gap-1.5 bg-[var(--color-accent-hype)] px-2.5 py-1.5">
                <Flame className="size-4 text-[var(--color-text-inverse)]" aria-hidden />
                <Text variant="body-sm" color="inverse" className="font-semibold">
                  Menor preço já registrado
                </Text>
              </span>
            )}
          </div>
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
                  {v2 ? (
                    <>
                      <Text variant="caption" color="tertiary">
                        Preço desta oferta ({offer.network.name})
                        {v2.now && v2.now.cents < offer.currentPriceCents
                          ? `. O menor preço agora entre as lojas é ${formatBRL(v2.now.cents)}, no quadro abaixo.`
                          : ''}
                      </Text>
                    </>
                  ) : (
                    metrics?.avgPriceCents != null && (
                      <Text variant="body-sm" color="secondary">
                        Média do produto (todas as lojas): {formatBRL(metrics.avgPriceCents)}
                      </Text>
                    )
                  )}
                </>
              ) : (
                <Text variant="heading-lg" color="tertiary" className="italic">
                  Coletando preço...
                </Text>
              )}
            </div>

            {v2 && parecer ? (
              // Cartão-pai (PRODUCT_CARD_V1): o cartão tem a própria borda (guia visual); sem Card em volta para não duplicar a moldura.
              <div className="flex flex-col gap-3">
                <ProductCardV1
                  parecer={parecer}
                  produtoNome={offer.title}
                  identidade={hasClassification ? specLine : null}
                  produtoId={offer.masterProductId}
                  compraHref={/^https?:\/\//i.test(offer.affiliateUrl) ? `/go/${offer.slug}` : null}
                />
                {sealTransition && <AvisoTransicaoSelo />}
                {chartNode}
              </div>
            ) : v2 ? (
              <Card variant="outline" className="rounded-none border-[var(--color-border-default)]">
                <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
                  <PriceMetricsV2Block data={v2} sealTransition={sealTransition} />
                  {chartNode}
                </CardContent>
              </Card>
            ) : (
              stats && stats.quoteCount > 0 && (
              <Card variant="outline" className="rounded-none border-[var(--color-border-default)]">
                <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text variant="label" color="tertiary" className="inline-flex items-center gap-1.5">
                      <LineChart className="size-3.5" aria-hidden />
                      Histórico de preço
                    </Text>
                    {trend && (
                      <Badge variant={trend.color} size="sm">
                        <trend.Icon className="size-3.5" />
                        {trend.label}
                      </Badge>
                    )}
                  </div>

                  {verdict && verdict.kind !== 'insufficient' && verdict.deltaCents != null && verdict.deltaPercent != null ? (
                    <div className="flex flex-col gap-0.5">
                      <Text
                        variant="heading-sm"
                        color={verdict.kind === 'below' ? 'success' : verdict.kind === 'above' ? 'danger' : 'primary'}
                      >
                        {VERDICT_LABEL[verdict.kind]}
                      </Text>
                      <Text variant="body-sm" color="secondary">
                        {verdict.kind === 'inline'
                          ? `Dentro de 5% da média do produto (${verdict.deltaPercent > 0 ? '+' : ''}${verdict.deltaPercent.toLocaleString('pt-BR')}%).`
                          : `${formatBRL(Math.abs(verdict.deltaCents))} (${Math.abs(verdict.deltaPercent).toLocaleString('pt-BR')}%) ${verdict.kind === 'below' ? 'abaixo' : 'acima'} da média do produto.`}
                      </Text>
                    </div>
                  ) : (
                    <Text variant="caption" color="tertiary">
                      Histórico ainda curto para comparar com a média (precisa de 5 cotações em 14 dias).
                    </Text>
                  )}

                  {verdict?.eligibility.eligible && lowestSeenCents != null && (
                    <PriceRangeBar
                      currentPriceCents={offer.currentPriceCents}
                      metrics={{ lowestPriceCents: lowestSeenCents, avgPriceCents30d: stats.avgCents }}
                    />
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {verdict?.eligibility.eligible && stats.avgCents != null && (
                      <div>
                        <dt className="text-caption text-[var(--color-text-tertiary)]">Média do produto</dt>
                        <dd className="tabular text-body-sm text-[var(--color-text-primary)]">{formatBRL(stats.avgCents)}</dd>
                      </div>
                    )}
                    {verdict?.eligibility.eligible && medianCents != null && (
                      <div>
                        <dt className="text-caption text-[var(--color-text-tertiary)]">Preço típico (mediana)</dt>
                        <dd className="tabular text-body-sm text-[var(--color-text-primary)]">{formatBRL(Math.round(medianCents))}</dd>
                      </div>
                    )}
                    {lowestSeenCents != null && (
                      <div>
                        <dt className="text-caption text-[var(--color-text-tertiary)]">Menor já visto</dt>
                        <dd className="tabular text-body-sm text-[var(--color-text-primary)]">
                          {formatBRL(lowestSeenCents)}
                          <span className="block text-caption text-[var(--color-text-tertiary)]">
                            {lowestIsToday || !stats.lowAll ? 'hoje' : `em ${new Date(stats.lowAll.at).toLocaleDateString('pt-BR')}`}
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>

                  <Text variant="caption" color="tertiary">
                    {stats.quoteCount.toLocaleString('pt-BR')} cotações no histórico (todas as lojas)
                  </Text>

                  {chartNode}
                </CardContent>
              </Card>
              )
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

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {/^https?:\/\//i.test(offer.affiliateUrl) && (
                <Button asChild size="lg" className="col-span-2 sm:col-auto sm:flex-none">
                  <a href={`/go/${offer.slug}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                    <ShieldCheck className="size-4" />
                    Ir à loja
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

            <ProductStoresTable
              stores={stores}
              avgPriceCents={v2 ? v2.stores.medianCents : metrics?.eligibility?.eligible ? metrics.avgPriceCents ?? null : null}
              referenceLabel={v2 ? 'Vs. mediana das lojas hoje' : undefined}
            />

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

      {hasAboutSection && (
        <Reveal delay={0.1}>
          <div className="mt-12 lg:mt-16 border-t border-[var(--color-border-subtle)] pt-10">
            <Text as="h2" variant="heading-lg" className="mb-6 flex items-center gap-2">
              <Info className="size-5 text-[var(--color-accent-primary)]" aria-hidden />
              Sobre o jogo
            </Text>

            <GameAboutSection
              synopsis={synopsis}
              galleryImages={galleryImages}
            />
          </div>
        </Reveal>
      )}
    </section>
  );
}

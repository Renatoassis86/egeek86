import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, ArrowRight, Flame, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { SceneImage } from '@/components/motion/scene-image';
import { WatchToggleButton } from '@/components/geek-deals/watch-toggle-button';
import { formatBRL } from '@/lib/format';
import { getSellerTrustInfo, sellerTrustTextColor } from '@/lib/affiliate/labels';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getMasterProductSummary, getOfferComparisonForMasterProduct } from '@/server/queries/price-history';
import { getWatchedMasterProductIds } from '@/server/queries/price-watches';

const PRICE_CHANGE_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** "há 3h" / "há 2 dias" — só usado nessa tela, não vale virar util compartilhado ainda. */
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'há poucos minutos';
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days > 1 ? 's' : ''}`;
}

function PriceChangeTag({
  lastPriceChangeAt,
  previousPriceCents,
  currentPriceCents,
}: {
  lastPriceChangeAt: Date | null;
  previousPriceCents: number | null;
  currentPriceCents: number;
}) {
  if (!lastPriceChangeAt || previousPriceCents == null) return null;
  if (Date.now() - lastPriceChangeAt.getTime() > PRICE_CHANGE_RECENT_MS) return null;

  const direction = currentPriceCents < previousPriceCents ? 'success' : 'danger';

  return (
    <Text
      variant="caption"
      color={direction}
      className="inline-flex items-center gap-1"
      title={`Preço anterior: ${formatBRL(previousPriceCents)}`}
    >
      <History className="size-3" />
      Vendedor alterou o preço {formatRelativeTime(lastPriceChangeAt)}
    </Text>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ masterProductId: string }>;
}) {
  const { masterProductId } = await params;
  const summary = await getMasterProductSummary(masterProductId);
  return { title: summary ? `Comparar preços: ${summary.name}` : 'Comparar preços' };
}

/**
 * Tela de comparação de preço entre vendedores/plataformas de um mesmo
 * produto, aberta ao clicar no preço do gráfico de monitoramento — mesmo
 * espírito de busca de passagem aérea: menor preço em destaque primeiro,
 * outras opções (mais caras) listadas abaixo, com a plataforma/vendedor
 * sempre identificado.
 */
export default async function CompararPrecosPage({
  params,
}: {
  params: Promise<{ masterProductId: string }>;
}) {
  const { masterProductId } = await params;

  const [summary, offers, profile] = await Promise.all([
    getMasterProductSummary(masterProductId),
    getOfferComparisonForMasterProduct(masterProductId),
    getCurrentProfile(),
  ]);

  if (!summary || offers.length === 0) {
    notFound();
  }

  const watchedIds = profile ? await getWatchedMasterProductIds(profile.id) : new Set<string>();
  const isWatching = watchedIds.has(masterProductId);
  const cheapest = offers[0];
  const alternatives = offers.slice(1);

  return (
    <section className="mx-auto max-w-4xl px-4 lg:px-8 py-10 lg:py-14">
      <Link
        href="/monitoramento"
        className="mb-6 inline-flex items-center gap-1 text-body-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        Voltar pro monitoramento
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text variant="label" color="tertiary">
            Comparação de preços
          </Text>
          <Text as="h1" variant="heading-xl" className="mt-1">
            {summary.name}
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-1">
            {offers.length === 1 ? '1 vendedor ativo agora' : `${offers.length} vendedores ativos agora`}, ordenados
            do menor pro maior preço.
          </Text>
        </div>
        {profile && <WatchToggleButton masterProductId={masterProductId} initialWatching={isWatching} />}
      </div>

      <Card className="mb-6 border-[var(--color-accent-primary)]/40">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] sm:w-24">
            <SceneImage src={cheapest.imageUrl} alt={cheapest.title} tone="gold" fit="contain" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="hype" size="sm" className="mb-2">
              <Flame className="size-3" />
              Menor preço agora
            </Badge>
            <Text variant="body-md" className="font-medium">
              {cheapest.title}
            </Text>
            <Text variant="caption" color="tertiary">
              {cheapest.networkName}
            </Text>
            <PriceChangeTag
              lastPriceChangeAt={cheapest.lastPriceChangeAt}
              previousPriceCents={cheapest.previousPriceCents}
              currentPriceCents={cheapest.currentPriceCents}
            />
          </div>
          <div className="flex flex-col items-end gap-2 sm:text-right">
            <Text variant="mono-lg" color="primary">
              {formatBRL(cheapest.currentPriceCents)}
            </Text>
            {cheapest.affiliateLinkPending ? (
              <Text
                variant="body-sm"
                color="tertiary"
                title="Esse item ainda está sendo preparado — o link de compra libera em breve."
              >
                Link em preparação
              </Text>
            ) : (
              <Link
                href={`/go/${cheapest.slug}`}
                className="inline-flex items-center gap-1 text-body-sm font-medium text-[var(--color-accent-primary)]"
              >
                Ver oferta
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {alternatives.length > 0 && (
        <div>
          <Text variant="label" color="tertiary" className="mb-3">
            Outras opções
          </Text>
          <div className="flex flex-col divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
            {alternatives.map((offer) => {
              const trust = getSellerTrustInfo({
                reputationLevel: offer.sellerReputationLevel,
                powerSellerStatus: offer.sellerPowerSellerStatus,
                totalSales: offer.sellerTotalSales,
              });
              const diffPercent = Math.round(
                ((offer.currentPriceCents - cheapest.currentPriceCents) / cheapest.currentPriceCents) * 100
              );

              const rowClassName = cn(
                'flex items-center gap-4 px-4 py-3 transition-colors',
                offer.affiliateLinkPending ? 'opacity-60' : 'hover:bg-[var(--color-bg-surface)]'
              );

              const rowContent = (
                <>
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" className="truncate font-medium">
                      {offer.title}
                    </Text>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        size="sm"
                        style={offer.networkColorHex ? { borderColor: offer.networkColorHex } : undefined}
                      >
                        {offer.networkName}
                      </Badge>
                      {trust && (
                        <Text
                          variant="caption"
                          color={sellerTrustTextColor(trust.variant)}
                          className="inline-flex items-center gap-1"
                        >
                          <ShieldCheck className="size-3" />
                          {trust.label}
                        </Text>
                      )}
                      {offer.affiliateLinkPending && (
                        <Text variant="caption" color="tertiary">
                          Link em preparação
                        </Text>
                      )}
                    </div>
                    <PriceChangeTag
                      lastPriceChangeAt={offer.lastPriceChangeAt}
                      previousPriceCents={offer.previousPriceCents}
                      currentPriceCents={offer.currentPriceCents}
                    />
                  </div>
                  <div className="shrink-0 text-right">
                    <Text variant="mono-md">{formatBRL(offer.currentPriceCents)}</Text>
                    <Text variant="caption" color="tertiary">
                      +{diffPercent}%
                    </Text>
                  </div>
                </>
              );

              if (offer.affiliateLinkPending) {
                return (
                  <div key={offer.offerId} className={rowClassName}>
                    {rowContent}
                  </div>
                );
              }

              return (
                <Link key={offer.offerId} href={`/go/${offer.slug}`} className={rowClassName}>
                  {rowContent}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

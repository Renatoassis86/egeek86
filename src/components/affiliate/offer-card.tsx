import Link from 'next/link';
import { Flame, ShieldCheck, TrendingDown, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { isBundleTitle } from '@/lib/affiliate/product-type-classifier';
import { ProductImage } from '@/components/ui/product-image';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import { classifyCatalogItem, dimensionToProductType } from '@/lib/catalog/dimensions';
import { sellerTier, verdictLabel } from '@/lib/affiliate/price-verdict';
import {
  GAME_FORMAT_LABELS,
  GAME_PLATFORM_GEN_LABELS,
  getSellerTrustInfo,
  sellerTrustTextColor,
} from '@/lib/affiliate/labels';
import type { OfferListingMetrics, OfferWithRelations } from '@/server/queries/affiliate';
import { ReguaEtiqueta, ReguaMarcadores, reguaDoFront } from '@/components/regua/regua-oferta';

/** Tipo efetivo (cartela) do item da oferta; cai no tipo gravado se a cartela o esconder. */
export function effectiveOfferType(offer: OfferWithRelations) {
  const mp = offer.masterProduct;
  const dim = classifyCatalogItem(mp.name, mp.productType, mp.gameFormat);
  return dimensionToProductType(dim.dimension) ?? mp.productType;
}

export function OfferCard({
  offer,
  metrics,
  variant = 'grid',
}: {
  offer: OfferWithRelations;
  /** Métricas em lote (menor histórico, desconto). Opcional, o card degrada bem sem elas. */
  metrics?: OfferListingMetrics;
  /**
   * 'feature' = horizontal a partir de sm (no celular é igual ao grid, para
   * não ocupar uma tela inteira com uma foto 4:5).
   */
  variant?: 'grid' | 'feature';
}) {
  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  const trust = getSellerTrustInfo(offer.seller);
  const isFeature = variant === 'feature';
  const type = effectiveOfferType(offer);
  // Veredito único de 3 faixas (±5% da média única do produto); selo de recorde
  // não vale para vendedor de reputação baixa (F-24).
  const verdict = metrics?.verdict ?? null;
  // Régua de destaque (mesmos degraus das mensagens): só com média elegível; sem ela, o veredito de 3 faixas de sempre.
  const regua = offer.currentPriceCents > 0 ? reguaDoFront(offer.currentPriceCents, metrics) : null;
  const showLowBadge = metrics?.isLowestEver === true && sellerTier(offer.seller) !== 'low';

  const specLine = [
    offer.masterProduct.gameFormat !== 'unknown' ? GAME_FORMAT_LABELS[offer.masterProduct.gameFormat] : null,
    offer.masterProduct.gamePlatformGen !== 'unknown' ? GAME_PLATFORM_GEN_LABELS[offer.masterProduct.gamePlatformGen] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const showDelta =
    offer.currentPriceCents > 0 &&
    verdict != null &&
    verdict.deltaPercent != null &&
    (verdict.kind === 'below' || verdict.kind === 'above');

  return (
    <Link href={`/ofertas/${offer.slug}`} className="group block h-full min-w-0">
      <Card
        interactive
        className={cn('h-full min-w-0 overflow-hidden', isFeature ? 'flex flex-col sm:flex-row' : 'flex flex-col')}
      >
        <ProductImage
          src={image}
          alt={offer.title}
          hoverZoom
          dimension={type}
          bundle={isBundleTitle(offer.title)}
          className={cn('border-0 border-b', isFeature ? 'w-full sm:w-[42%] sm:border-b-0 sm:border-r' : 'w-full')}
        >
          {/* Desconto: canto superior direito do quadro, sem cobrir o centro da foto */}
          {showDelta && verdict && verdict.deltaPercent != null && (
            <span
              className={cn(
                'absolute right-0 top-0 z-10 inline-flex items-center px-2 py-1 text-[12px] font-black leading-none text-white',
                verdict.kind === 'above' ? 'bg-red-600' : 'bg-emerald-600'
              )}
              title={verdictLabel(verdict.kind).label}
            >
              {verdict.kind === 'above' ? `+${Math.round(verdict.deltaPercent)}%` : `${Math.round(verdict.deltaPercent)}%`}
            </span>
          )}
        </ProductImage>

        <CardContent className={cn('flex min-w-0 flex-1 flex-col gap-2', isFeature ? 'p-3 sm:p-5 sm:justify-center' : 'p-3 sm:p-4')}>
          {/* Loja e especificação ficam no corpo, nunca sobre a foto */}
          <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
            <Text variant="caption" color="tertiary" className="min-w-0 flex-1 truncate font-semibold uppercase tracking-[0.04em] text-[12px]">
              <span style={offer.network.colorHex ? { color: offer.network.colorHex } : undefined}>{offer.network.name}</span>
              {specLine ? ` · ${specLine}` : ''}
            </Text>
          </div>

          <Text
            variant={isFeature ? 'body-md' : 'body-sm'}
            className={cn('line-clamp-2 min-w-0 overflow-hidden break-words font-medium', isFeature ? 'min-h-11' : 'min-h-10')}
          >
            {offer.title}
          </Text>

          {showLowBadge && (
            <Badge variant="hype" size="sm" className="w-fit max-w-full shrink-0 whitespace-nowrap px-1.5 py-0 text-[12px]">
              <Flame className="size-3 shrink-0" />
              <span>Menor já visto</span>
            </Badge>
          )}

          <div className="mt-auto flex flex-col gap-1">
            {offer.currentPriceCents > 0 ? (
              <>
                {metrics?.avgPriceCents30d != null && (
                  <Text variant="caption" color="tertiary">
                    Preço médio: {formatBRL(metrics.avgPriceCents30d)}
                  </Text>
                )}
                <Text
                  variant="mono-lg"
                  color="primary"
                  className={cn('leading-none', isFeature ? 'text-[22px] sm:text-[30px]' : 'text-[20px] sm:text-[21px]')}
                >
                  {formatBRL(offer.currentPriceCents)}
                </Text>

                {regua?.veredito ? (
                  <ReguaEtiqueta regua={regua} />
                ) : regua?.espere ? (
                  <Text variant="caption" color="danger">
                    {regua.frase}
                  </Text>
                ) : (
                  verdict && (
                    <Text
                      variant="caption"
                      color={verdict.kind === 'below' ? 'success' : verdict.kind === 'above' ? 'danger' : 'tertiary'}
                    >
                      {verdictLabel(verdict.kind).label}
                    </Text>
                  )
                )}
                {regua?.veredito && isFeature ? <ReguaMarcadores regua={regua} /> : null}

                {metrics && metrics.eligibility.eligible && !showLowBadge && (
                  <Text variant="caption" color="secondary" className="inline-flex items-center gap-1">
                    <TrendingDown className="size-3" aria-hidden />
                    Menor já visto: {formatBRL(metrics.lowestPriceCents)}
                  </Text>
                )}
              </>
            ) : (
              // Item descoberto automaticamente, ainda sem nenhuma coleta de
              // preço concluída: nunca mostrar "R$ 0,00" (parece grátis/quebrado).
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
            <span className="mt-1 hidden items-center gap-1 text-caption font-medium text-[var(--color-accent-primary)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 sm:inline-flex">
              Ver oferta <ArrowUpRight className="size-3.5" aria-hidden />
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

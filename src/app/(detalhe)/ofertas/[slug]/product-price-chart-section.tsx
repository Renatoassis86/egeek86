import { PriceHistoryChart, type PriceChartCanonical } from '@/components/monitoring/price-history-chart';
import { getOfferPageHistory3M } from '@/server/queries/offer-page-data';
import { Text } from '@/components/ui/text';

/**
 * Gráfico de histórico da página do produto. Server component próprio para
 * rodar dentro de <Suspense>: a consulta do histórico não atrasa o resto da
 * página. Sem polling; o selo e as contagens leem a estatística canônica.
 */
export async function ProductPriceChartSection({
  masterProductId,
  canonical,
  currentPriceCents,
}: {
  masterProductId: string;
  canonical: PriceChartCanonical;
  currentPriceCents: number;
}) {
  const history = await getOfferPageHistory3M(masterProductId).catch((error: unknown) => {
    console.error(`[product-price-chart-section] falha ao carregar histórico de preço (masterProductId=${masterProductId})`, error);
    return null;
  });
  if (!history) return null;

  return (
    <PriceHistoryChart
      masterProductId={masterProductId}
      initialHistory={history}
      initialTimeframe="3M"
      currentPriceCents={currentPriceCents}
      canonical={canonical}
      hideActions
      pollMs={0}
    />
  );
}

export function ProductPriceChartFallback() {
  return (
    <div className="flex h-[360px] w-full items-center justify-center border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
      <Text variant="caption" color="tertiary">
        Carregando histórico de preço
      </Text>
    </div>
  );
}

import { PriceHistoryChart, type PriceChartCanonical } from '@/components/monitoring/price-history-chart';
import { getOfferPageHistory3M } from '@/server/queries/offer-page-data';
import { Text } from '@/components/ui/text';
import { PriceChartV2, PriceChartV2Unavailable } from '@/components/monitoring/price-chart-v2';
import { isPriceMetricsV2Enabled } from '@/lib/pricing/price-metrics-config';
import { getPriceChartV2 } from '@/server/pricing/price-chart-v2';
import { getPriceMetricsV2 } from '@/server/pricing/price-metrics-v2';
import { chartLiveProps } from '@/lib/pricing/chart-props';

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
  canonical: PriceChartCanonical | null;
  currentPriceCents: number;
}) {
  // Gráfico V2 (fase 3) atrás de PRICE_METRICS_V2. Sem a flag: gráfico anterior, como sempre. COM a flag nunca cai no gráfico
  // anterior ("Menor preço praticado"/"Média geral de mercado" são medidas de outro regime): sem dado medido ou com falha, cartão sem gráfico.
  if (isPriceMetricsV2Enabled()) {
    const [input, v2] = await Promise.all([
      getPriceChartV2(masterProductId).catch((error: unknown) => {
        console.error(`[product-price-chart-section] falha no gráfico V2 (masterProductId=${masterProductId})`, error);
        return 'error' as const;
      }),
      getPriceMetricsV2(masterProductId).catch(() => null),
    ]);
    if (input === 'error') return <PriceChartV2Unavailable title="Histórico indisponível no momento" text="Não foi possível carregar o histórico medido agora. Nada é estimado para preencher." />;
    if (!input) {
      return (
        <PriceChartV2Unavailable
          title="Sem histórico medido"
          text="Este produto ainda não tem nenhum dia medido no método atual. O gráfico aparece quando houver pelo menos 2 dias medidos; nada é estimado para preencher."
        />
      );
    }
    return <PriceChartV2 input={input} nowIso={new Date().toISOString()} {...chartLiveProps(v2)} />;
  }

  if (!canonical) return null;
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

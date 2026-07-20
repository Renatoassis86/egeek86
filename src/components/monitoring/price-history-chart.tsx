'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  AreaSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeStore } from '@/lib/stores/theme-store';
import { CHART_PALETTES } from '@/lib/chart-colors';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import { usePollingRefresh } from '@/hooks/use-polling-refresh';
import { TimeframeSelector } from './timeframe-selector';
import type {
  PriceHistoryTimeframe,
  PriceHistoryResult,
  PriceHistoryPointOffer,
  PriceHistoryStats,
  PriceQuotePoint,
} from '@/server/queries/price-history';

const POLL_INTERVAL_MS = 45_000;

interface TooltipState {
  x: number;
  y: number;
  priceCents: number;
  offer: PriceHistoryPointOffer | null;
  quotes?: PriceQuotePoint[];
}

/**
 * Wrapper client-side do lightweight-charts (biblioteca open-source da
 * própria TradingView, mesmo zoom/pan/crosshair nativos dela). Série de
 * área, nunca candle — traça o MENOR preço entre todos os vendedores ativos
 * do produto (não de um vendedor específico), com o marco zero sendo o
 * snapshot mais antigo já coletado. `initialHistory` evita o flash de
 * gráfico vazio antes do primeiro fetch client-side.
 */
export function PriceHistoryChart({
  masterProductId,
  initialHistory,
  initialTimeframe = '1M',
}: {
  masterProductId: string;
  initialHistory: PriceHistoryResult;
  initialTimeframe?: PriceHistoryTimeframe;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const quotesSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const skipNextFetch = useRef(true);
  const requestIdRef = useRef(0);
  const pointOffersRef = useRef<Record<number, PriceHistoryPointOffer>>(initialHistory.pointOffers);
  const quotesRef = useRef<PriceQuotePoint[]>(initialHistory.quotes);
  const globalMaxPriceCentsRef = useRef<number | null>(initialHistory.stats.globalMaxPriceCents);

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [timeframe, setTimeframe] = useState<PriceHistoryTimeframe>(initialTimeframe);
  const [history, setHistory] = useState<PriceHistoryResult>(initialHistory);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  pointOffersRef.current = history.pointOffers;
  quotesRef.current = history.quotes;
  globalMaxPriceCentsRef.current = history.stats.globalMaxPriceCents;

  // Monta o gráfico uma única vez.
  useEffect(() => {
    if (!containerRef.current) return;
    const palette = CHART_PALETTES[useThemeStore.getState().resolvedTheme];

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: palette.text, attributionLogo: false },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      timeScale: { borderColor: palette.grid, timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: palette.grid },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

    const autoscaleProvider = (original: any) => {
      const res = original();
      if (res !== null) {
        res.priceRange.minValue = 0;
        const gMax = globalMaxPriceCentsRef.current;
        if (gMax && gMax > 0) {
          const maxInReais = gMax / 100;
          // Eixo Y partindo de 0 até algumas dezenas acima do preço máximo (ex: + R$ 35 ou 15% a mais)
          const margin = Math.max(35, Math.ceil(maxInReais * 0.15));
          res.priceRange.maxValue = Math.ceil(maxInReais + margin);
        }
      }
      return res;
    };

    const series = chart.addSeries(AreaSeries, {
      lineColor: palette.line,
      topColor: palette.areaTop,
      bottomColor: palette.areaBottom,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => formatBRL(Math.round(v * 100)),
        minMove: 0.01,
      },
      autoscaleInfoProvider: autoscaleProvider,
    });

    // Média móvel (janela escalada pelo período selecionado) — acompanha a
    // tendência da série de menor preço sem saltar a cada evento isolado de
    // coleta. Linha fina tracejada de propósito: nunca deve competir
    // visualmente com a série principal, é só contexto de tendência.
    const maSeries = chart.addSeries(LineSeries, {
      color: palette.movingAverage,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => formatBRL(Math.round(v * 100)),
        minMove: 0.01,
      },
      autoscaleInfoProvider: autoscaleProvider,
    });

    const quotesSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      color: 'transparent',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => formatBRL(Math.round(v * 100)),
        minMove: 0.01,
      },
      autoscaleInfoProvider: autoscaleProvider,
    });

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        return;
      }
      const seriesValue = param.seriesData.get(series);
      const value = seriesValue && 'value' in seriesValue ? seriesValue.value : undefined;
      if (value == null) {
        setTooltip(null);
        return;
      }
      // Tamanho estimado do card do tooltip (w-60 = 240px; altura varia com o
      // conteúdo, 260px cobre o pior caso) — usado só pra decidir de que lado
      // do cursor abrir, pra nunca cortar fora do container do gráfico.
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const containerHeight = containerRef.current?.clientHeight ?? 0;
      const TOOLTIP_WIDTH = 240;
      const TOOLTIP_HEIGHT = 260;
      const x = param.point.x + 12 + TOOLTIP_WIDTH > containerWidth ? param.point.x - TOOLTIP_WIDTH - 12 : param.point.x + 12;
      const y = Math.min(Math.max(param.point.y - 12, 8), Math.max(containerHeight - TOOLTIP_HEIGHT - 8, 8));

      const pointQuotes = quotesRef.current.filter((q) => q.time === param.time);

      setTooltip({
        x: Math.max(x, 8),
        y,
        priceCents: Math.round(value * 100),
        offer: pointOffersRef.current[param.time as number] ?? null,
        quotes: pointQuotes,
      });
    });

    chartRef.current = chart;
    seriesRef.current = series;
    maSeriesRef.current = maSeries;
    quotesSeriesRef.current = quotesSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      maSeriesRef.current = null;
      quotesSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monta uma vez só, tema é aplicado à parte no efeito abaixo
  }, []);

  // Recolore o gráfico quando o tema (dark/light) muda.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !maSeriesRef.current) return;
    const palette = CHART_PALETTES[resolvedTheme];
    chartRef.current.applyOptions({
      layout: { textColor: palette.text },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      timeScale: { borderColor: palette.grid },
      rightPriceScale: { borderColor: palette.grid },
    });
    seriesRef.current.applyOptions({
      lineColor: palette.line,
      topColor: palette.areaTop,
      bottomColor: palette.areaBottom,
    });
    maSeriesRef.current.applyOptions({ color: palette.movingAverage });
  }, [resolvedTheme]);

  // Empurra os dados atuais pra série sempre que mudarem.
  useEffect(() => {
    if (!seriesRef.current || !maSeriesRef.current || !quotesSeriesRef.current) return;
    seriesRef.current.setData(history.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    maSeriesRef.current.setData(
      history.movingAveragePoints.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    quotesSeriesRef.current.setData(
      history.quotes.map((q) => ({ time: q.time as UTCTimestamp, value: q.value }))
    );
    if (typeof (quotesSeriesRef.current as any).setMarkers === 'function') {
      (quotesSeriesRef.current as any).setMarkers(
        history.quotes.map((q, idx) => ({
          time: q.time as UTCTimestamp,
          position: 'inBar',
          shape: 'circle',
          color: q.networkColorHex || '#D4AF37',
          size: q.size,
          id: `q-${idx}`,
        }))
      );
    }
    chartRef.current?.timeScale().fitContent();
  }, [history]);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const res = await fetch(
        `/api/monitoramento/price-history?masterProductId=${masterProductId}&timeframe=${timeframe}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PriceHistoryResult;
      // Descarta resposta se uma requisição mais nova já foi disparada (troca
      // rápida de período/produto) — evita sobrescrever dado fresco com stale.
      if (requestId !== requestIdRef.current) return;
      setHistory(json);
      setFetchFailed(false);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setFetchFailed(true);
    }
  }, [masterProductId, timeframe]);

  // Refetch ao trocar de produto ou de período.
  useEffect(() => {
    fetchData();
  }, [masterProductId, timeframe, fetchData]);

  usePollingRefresh(fetchData, POLL_INTERVAL_MS);

  const hasEnoughData = history.points.length >= 2;
  const { stats } = history;
  const variationVsAvgPercent =
    tooltip && stats.avgPriceCents ? Math.round(((tooltip.priceCents - stats.avgPriceCents) / stats.avgPriceCents) * 1000) / 10 : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
          <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none">
            {history.totalOffersCount || 0} ofertas integradas (todas as plataformas)
          </Badge>
          <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none">
            {history.totalQuoteCount || 0} cotações registradas
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-caption text-[var(--color-text-tertiary)]">
            <span className="h-0.5 w-3 rounded-full bg-[var(--color-accent-primary)]" /> Menor preço
          </span>
          <span className="inline-flex items-center gap-1.5 text-caption text-[var(--color-text-tertiary)]">
            <span
              className="h-0 w-3 border-t border-dashed"
              style={{ borderColor: CHART_PALETTES[resolvedTheme].movingAverage }}
            />
            Média móvel
          </span>
        </div>
      </div>
      <div className="relative h-[360px] w-full">
        {!hasEnoughData && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <Text variant="body-sm" color="tertiary">
              Ainda não há histórico suficiente pra esse período. Volte mais tarde ou tente um período maior.
            </Text>
          </div>
        )}
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ visibility: hasEnoughData ? 'visible' : 'hidden' }}
        />
        {tooltip && <ChartTooltip tooltip={tooltip} stats={stats} variationVsAvgPercent={variationVsAvgPercent} />}
        {fetchFailed && (
          <Text
            variant="caption"
            color="tertiary"
            className="absolute right-2 top-2 rounded-[var(--radius-xs)] bg-[var(--color-bg-elevated)] px-2 py-1"
          >
            Falha ao atualizar — tentando de novo
          </Text>
        )}
      </div>
    </div>
  );
}

function ChartTooltip({
  tooltip,
  stats,
  variationVsAvgPercent,
}: {
  tooltip: TooltipState;
  stats: PriceHistoryStats;
  variationVsAvgPercent: number | null;
}) {
  const { offer, quotes } = tooltip;
  // Preço de compra: abaixo da média é bom (verde), acima é ruim (vermelho) — mesma convenção do resto do app.
  const variationColor =
    variationVsAvgPercent == null
      ? 'text-[var(--color-text-tertiary)]'
      : variationVsAvgPercent < 0
        ? 'text-[var(--color-accent-success)]'
        : variationVsAvgPercent > 0
          ? 'text-[var(--color-accent-danger)]'
          : 'text-[var(--color-text-tertiary)]';

  return (
    <div
      className="pointer-events-none absolute z-10 w-60 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-lg)]"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <Text variant="mono-lg" className="leading-none">
        {formatBRL(tooltip.priceCents)}
      </Text>

      {offer ? (
        <div className="mt-2 flex flex-col gap-1">
          <Text variant="caption" color="secondary">
            {offer.networkName}
            {offer.sellerNickname && ` · ${offer.sellerNickname}`}
          </Text>
          {(offer.sellerReputationLevel || offer.sellerPositiveRatingPercent) && (
            <Text variant="caption" color="tertiary">
              {offer.sellerReputationLevel ?? 'sem nível'}
              {offer.sellerPositiveRatingPercent && ` · ${offer.sellerPositiveRatingPercent}% avaliações positivas`}
              {offer.sellerPowerSellerStatus && ` · ${offer.sellerPowerSellerStatus}`}
            </Text>
          )}
        </div>
      ) : (
        <Text variant="caption" color="tertiary" className="mt-2">
          Vendedor não identificado nesse ponto
        </Text>
      )}

      {quotes && quotes.length > 0 && (
        <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2 flex flex-col gap-1">
          <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[9px] block">
            Cotações concorrentes ({quotes.length})
          </Text>
          <div className="max-h-24 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
            {quotes.map((q, i) => (
              <div key={i} className="flex justify-between items-center text-[10px] gap-2">
                <span className="text-[var(--color-text-secondary)] truncate max-w-[15ch] flex items-center gap-1">
                  <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: q.networkColorHex || '#D4AF37' }} />
                  {q.networkName} {q.sellerNickname ? `(${q.sellerNickname})` : ''}
                </span>
                <span className="font-mono font-semibold text-[var(--color-text-primary)] shrink-0">
                  {formatBRL(q.value * 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-0.5 border-t border-[var(--color-border-subtle)] pt-2">
        {variationVsAvgPercent != null && (
          <Text variant="caption" className={cn('font-medium', variationColor)}>
            {variationVsAvgPercent > 0 ? '+' : ''}
            {variationVsAvgPercent}% vs. preço médio do período
          </Text>
        )}
        {stats.minPriceCents != null && (
          <Text variant="caption" color="tertiary">
            Mínimo no período: {formatBRL(stats.minPriceCents)}
          </Text>
        )}
        {stats.maxPriceCents != null && (
          <Text variant="caption" color="tertiary">
            Máximo no período: {formatBRL(stats.maxPriceCents)}
          </Text>
        )}
      </div>
    </div>
  );
}

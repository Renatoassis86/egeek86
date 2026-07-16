'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Text } from '@/components/ui/text';
import { useThemeStore } from '@/lib/stores/theme-store';
import { CHART_PALETTES } from '@/lib/chart-colors';
import { formatBRL } from '@/lib/format';
import { usePollingRefresh } from '@/hooks/use-polling-refresh';
import { TimeframeSelector } from './timeframe-selector';
import type { PriceHistoryTimeframe } from '@/server/queries/price-history';

interface PricePointDTO {
  time: number;
  value: number;
}

const POLL_INTERVAL_MS = 45_000;

/**
 * Wrapper client-side do lightweight-charts (biblioteca open-source da
 * própria TradingView, mesmo zoom/pan/crosshair nativos dela). Série de
 * área, nunca candle — traça o MENOR preço entre todos os vendedores ativos
 * do produto (não de um vendedor específico), com o marco zero sendo o
 * snapshot mais antigo já coletado. `initialData` evita o flash de gráfico
 * vazio antes do primeiro fetch client-side.
 */
export function PriceHistoryChart({
  masterProductId,
  initialData,
  initialTimeframe = '1M',
}: {
  masterProductId: string;
  initialData: PricePointDTO[];
  initialTimeframe?: PriceHistoryTimeframe;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const skipNextFetch = useRef(true);

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [timeframe, setTimeframe] = useState<PriceHistoryTimeframe>(initialTimeframe);
  const [data, setData] = useState<PricePointDTO[]>(initialData);

  // Monta o gráfico uma única vez.
  useEffect(() => {
    if (!containerRef.current) return;
    const palette = CHART_PALETTES[useThemeStore.getState().resolvedTheme];

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: palette.text },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      timeScale: { borderColor: palette.grid, timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: palette.grid },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

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
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monta uma vez só, tema é aplicado à parte no efeito abaixo
  }, []);

  // Recolore o gráfico quando o tema (dark/light) muda.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
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
  }, [resolvedTheme]);

  // Empurra os dados atuais pra série sempre que mudarem.
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const fetchData = useCallback(async () => {
    const res = await fetch(
      `/api/monitoramento/price-history?masterProductId=${masterProductId}&timeframe=${timeframe}`
    );
    if (!res.ok) return;
    const json = (await res.json()) as { points: PricePointDTO[] };
    setData(json.points ?? []);
  }, [masterProductId, timeframe]);

  // Refetch ao trocar de período — pula a primeira vez (initialData já veio do server).
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    fetchData();
  }, [fetchData]);

  usePollingRefresh(fetchData, POLL_INTERVAL_MS);

  const hasEnoughData = data.length >= 2;

  return (
    <div className="flex flex-col gap-3">
      <TimeframeSelector value={timeframe} onChange={setTimeframe} />
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
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  AreaSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineType,
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

/** Rótulo do período pro badge de contagem de cotações — acompanha o seletor. */
const TIMEFRAME_LABELS: Record<PriceHistoryTimeframe, string> = {
  '1D': 'hoje',
  '1S': 'na semana',
  '1M': 'no mês',
  '3M': 'no trimestre',
  '6M': 'no semestre',
  '1A': 'no ano',
  Tudo: 'no período todo',
};

type PriceSignalLevel = 'great' | 'good' | 'watch' | 'unknown';

interface PriceSignal {
  level: PriceSignalLevel;
  label: string;
  detail: string;
}

/**
 * "Prescrição" de compra pra decisão imediata ao bater o olho no gráfico —
 * compara o preço vigente (último ponto) contra o mínimo e a média do
 * período já calculados no back. Regra simples e auditável (sem modelo,
 * sem caixa preta): perto do mínimo do período = comprar; abaixo da média =
 * já compensa mas já esteve mais barato; acima da média = esperar.
 */
function computePriceSignal(history: PriceHistoryResult): PriceSignal {
  const latest = history.points.at(-1)?.value;
  const { minPriceCents, avgPriceCents } = history.stats;
  if (latest == null || minPriceCents == null || avgPriceCents == null) {
    return {
      level: 'unknown',
      label: 'Sem dados suficientes',
      detail: 'Aguardando mais cotações pra gerar uma recomendação.',
    };
  }

  const currentCents = Math.round(latest * 100);

  if (currentCents <= minPriceCents * 1.02) {
    return {
      level: 'great',
      label: 'Comprar agora',
      detail: 'No menor preço (ou muito perto) do período selecionado.',
    };
  }

  if (currentCents < avgPriceCents) {
    const pct = Math.round(((avgPriceCents - currentCents) / avgPriceCents) * 100);
    return {
      level: 'good',
      label: 'Bom momento',
      detail: `${pct}% abaixo da média do período — já compensa, mas já esteve mais barato.`,
    };
  }

  const pct = Math.round(((currentCents - avgPriceCents) / avgPriceCents) * 100);
  return {
    level: 'watch',
    label: 'Considere esperar',
    detail: `${pct}% acima da média do período — histórico mostra preço melhor em outros momentos.`,
  };
}

function PriceSignalBadge({ signal }: { signal: PriceSignal }) {
  const styles: Record<PriceSignalLevel, string> = {
    great: 'bg-[var(--color-accent-success)]/15 border-[var(--color-accent-success)]/40 text-[var(--color-accent-success)]',
    good: 'bg-[var(--color-accent-success)]/10 border-[var(--color-accent-success)]/25 text-[var(--color-accent-success)]',
    watch: 'bg-[var(--color-accent-danger)]/10 border-[var(--color-accent-danger)]/30 text-[var(--color-accent-danger)]',
    unknown: 'bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]',
  };

  return (
    <div className={cn('flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-1.5', styles[signal.level])}>
      <span className="size-1.5 rounded-full bg-current shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-bold">{signal.label}</span>
        <span className="text-[10px] font-normal opacity-80">{signal.detail}</span>
      </div>
    </div>
  );
}

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
  const avgSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const skipNextFetch = useRef(true);
  const requestIdRef = useRef(0);
  const pointOffersRef = useRef<Record<number, PriceHistoryPointOffer>>(initialHistory.pointOffers);
  const quotesRef = useRef<PriceQuotePoint[]>(initialHistory.quotes);

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [timeframe, setTimeframe] = useState<PriceHistoryTimeframe>(initialTimeframe);
  const [history, setHistory] = useState<PriceHistoryResult>(initialHistory);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  pointOffersRef.current = history.pointOffers;
  quotesRef.current = history.quotes;

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

    // Zoom no intervalo onde o preço realmente circula, com uma margem
    // confortável — não força a régua a começar em zero. Preço de jogo
    // costuma variar numa faixa estreita (ex: R$300-450); baseline em zero
    // + teto no maior preço JÁ visto historicamente (às vezes um pico de
    // meses atrás) espremia a linha real numa faixinha, e com poucos pontos
    // reais (preço muda raramente) isso virava um bloco sólido sem leitura
    // nenhuma em vez de uma linha/degrau visível.
    const autoscaleProvider = (original: any) => {
      const res = original();
      if (res === null) return res;
      const { minValue, maxValue } = res.priceRange;
      const span = Math.max(maxValue - minValue, 1);
      const padding = Math.max(span * 0.12, 5);
      res.priceRange.minValue = Math.max(0, minValue - padding);
      res.priceRange.maxValue = maxValue + padding;
      return res;
    };

    // Degrau (não linear) porque o preço não "desliza" continuamente entre
    // duas cotações — ele fica parado num valor e pula pro próximo só
    // quando alguém muda de verdade. Interpolação linear entre pontos
    // esparsos (o normal aqui, já que só registramos mudança real de
    // preço) sugeria uma variação gradual que nunca aconteceu.
    const series = chart.addSeries(AreaSeries, {
      lineColor: palette.line,
      topColor: palette.areaTop,
      bottomColor: palette.areaBottom,
      lineWidth: 2,
      lineType: LineType.WithSteps,
      // Um ponto por balde de tempo agora (não mais um por evento de
      // mudança de preço) — o volume de pontos é baixo o bastante pra um
      // raio pequeno e fixo marcar cada balde sem os círculos se fundirem
      // numa mancha, como acontecia quando cada oscilação entre vendedores
      // virava um marcador (raio padrão, proporcional à densidade de dados).
      pointMarkersVisible: true,
      pointMarkersRadius: 3,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => formatBRL(Math.round(v * 100)),
        minMove: 0.01,
      },
      autoscaleInfoProvider: autoscaleProvider,
    });

    // Preço médio real entre todas as lojas/plataformas (não é média móvel
    // do menor preço) — linha fina tracejada de propósito: nunca deve
    // competir visualmente com a série principal, é só contexto de mercado.
    const avgSeries = chart.addSeries(LineSeries, {
      color: palette.movingAverage,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineType: LineType.WithSteps,
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

      // Cotações são agrupadas pelo mesmo balde de tempo do ponto (não por
      // timestamp exato) — cada ponto do gráfico agora representa um
      // intervalo inteiro (ex: 3 dias), não um instante único.
      const pointQuotes = quotesRef.current.filter((q) => q.bucketTime === param.time);

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
    avgSeriesRef.current = avgSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      avgSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monta uma vez só, tema é aplicado à parte no efeito abaixo
  }, []);

  // Recolore o gráfico quando o tema (dark/light) muda.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !avgSeriesRef.current) return;
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
    avgSeriesRef.current.applyOptions({ color: palette.movingAverage });
  }, [resolvedTheme]);

  // Empurra os dados atuais pra série sempre que mudarem.
  useEffect(() => {
    if (!seriesRef.current || !avgSeriesRef.current) return;
    seriesRef.current.setData(history.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    avgSeriesRef.current.setData(
      history.avgPoints.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    if (chartRef.current) {
      chartRef.current.applyOptions({
        timeScale: {
          timeVisible: timeframe === '1D',
          secondsVisible: false,
        },
      });
      chartRef.current.timeScale().fitContent();
    }
  }, [history, timeframe]);

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
  const priceSignal = useMemo(() => computePriceSignal(history), [history]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
          <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none">
            {history.totalOffersCount || 0} itens integrados (todas as plataformas)
          </Badge>
          <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none">
            {history.totalQuoteCount || 0} cotações {TIMEFRAME_LABELS[timeframe]}
          </Badge>
        </div>
        {hasEnoughData && <PriceSignalBadge signal={priceSignal} />}
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
          Preço médio (todas as lojas)
        </span>
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

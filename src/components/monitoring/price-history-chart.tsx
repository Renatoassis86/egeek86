'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  AreaSeries,
  LineSeries,
  HistogramSeries,
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
import { computeVerdict } from '@/lib/affiliate/price-verdict';
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

/**
 * Estatística canônica do produto (subconjunto serializável de
 * MasterProductPriceStats, src/server/queries/product-price-stats.ts). Quando
 * presente, selo e contagens leem dela e não do cálculo por período do gráfico.
 */
export interface PriceChartCanonical {
  avgCents: number | null;
  quoteCount: number;
  historyDays: number;
  lowAll: { priceCents: number } | null;
  currentLowestActive: { priceCents: number } | null;
}

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
      detail: `${pct}% abaixo da média do período. Já compensa, mas já esteve mais barato.`,
    };
  }

  const pct = Math.round(((currentCents - avgPriceCents) / avgPriceCents) * 100);
  return {
    level: 'watch',
    label: 'Considere esperar',
    detail: `${pct}% acima da média do período. O histórico mostra preço melhor em outros momentos.`,
  };
}

/** Selo a partir da estatística canônica: média única do produto, todo o histórico, só com histórico elegível. */
function computeCanonicalSignal(canonical: PriceChartCanonical, currentCents: number | undefined): PriceSignal {
  const current = currentCents ?? canonical.currentLowestActive?.priceCents ?? null;
  const verdict = computeVerdict({
    currentCents: current,
    avgCents: canonical.avgCents,
    quoteCount: canonical.quoteCount,
    historyDays: canonical.historyDays,
  });
  if (verdict.kind === 'insufficient' || verdict.deltaCents == null || verdict.deltaPercent == null || current == null) {
    return {
      level: 'unknown',
      label: 'Histórico ainda curto',
      detail: 'Precisamos de pelo menos 5 cotações em 14 dias para opinar.',
    };
  }
  const abs = Math.abs(verdict.deltaPercent).toLocaleString('pt-BR');
  const absBRL = formatBRL(Math.abs(verdict.deltaCents));
  const low = canonical.lowAll?.priceCents;
  if (verdict.kind === 'below') {
    const atLow = low != null && current <= low * 1.02;
    return {
      level: atLow ? 'great' : 'good',
      label: atLow ? 'Comprar agora' : 'Abaixo do normal',
      detail: `${absBRL} (${abs}%) abaixo da média do produto${atLow ? ', no menor preço já visto' : ''}.`,
    };
  }
  if (verdict.kind === 'inline') {
    return { level: 'unknown', label: 'Em linha com o normal', detail: `Dentro de 5% da média do produto (${verdict.deltaPercent > 0 ? '+' : ''}${verdict.deltaPercent.toLocaleString('pt-BR')}%).` };
  }
  return {
    level: 'watch',
    label: 'Acima do normal',
    detail: `${absBRL} (${abs}%) acima da média do produto. Considere esperar.`,
  };
}

import Link from 'next/link';
import { ShoppingCart, ShoppingBag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toggleCartItem } from '@/server/actions/cart';

function PriceSignalBadge({
  signal,
  winningOfferId,
  masterProductId,
  hideActions = false,
}: {
  signal: PriceSignal;
  winningOfferId?: string | null;
  masterProductId: string;
  hideActions?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const isBuyOpportunity = signal.level === 'great' || signal.level === 'good';

  const styles: Record<PriceSignalLevel, string> = {
    great: 'bg-[var(--color-accent-success)]/15 border-[var(--color-accent-success)]/40 text-[var(--color-accent-success)]',
    good: 'bg-[var(--color-accent-success)]/10 border-[var(--color-accent-success)]/25 text-[var(--color-accent-success)]',
    watch: 'bg-[var(--color-accent-danger)]/10 border-[var(--color-accent-danger)]/30 text-[var(--color-accent-danger)]',
    unknown: 'bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]',
  };

  const handleAddToCart = async () => {
    if (!winningOfferId) {
      toast.info('Redirecionando para a oferta com o menor preço...');
      window.location.href = `/monitoramento/comparar/${masterProductId}`;
      return;
    }

    setIsAdding(true);
    try {
      await toggleCartItem(winningOfferId, true);
      setAdded(true);
      toast.success('Produto adicionado ao seu carrinho!');
      setTimeout(() => setAdded(false), 3000);
    } catch {
      toast.error('Faça login para salvar ofertas no seu carrinho.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className={cn('flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-1.5', styles[signal.level])}>
        <span className="size-1.5 rounded-full bg-current shrink-0 animate-pulse" />
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-bold">{signal.label}</span>
          <span className="text-[10px] font-normal opacity-80">{signal.detail}</span>
        </div>
      </div>

      {isBuyOpportunity && !hideActions && (
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="hype"
            className="h-8 text-xs font-bold gap-1.5 shadow-lg"
          >
            <Link href={`/monitoramento/comparar/${masterProductId}`}>
              <ShoppingBag className="size-3.5" /> Comprar no Menor Preço
            </Link>
          </Button>

          <Button
            size="sm"
            variant={added ? 'secondary' : 'outline'}
            disabled={isAdding}
            onClick={handleAddToCart}
            className="h-8 text-xs font-bold gap-1.5 border-[var(--color-accent-primary)]/40 text-[var(--color-text-primary)] hover:bg-[var(--color-accent-primary)]/10"
          >
            {added ? (
              <>
                <Check className="size-3.5 text-[var(--color-accent-success)]" /> No Carrinho
              </>
            ) : (
              <>
                <ShoppingCart className="size-3.5 text-[var(--color-accent-primary)]" /> + Carrinho
              </>
            )}
          </Button>
        </div>
      )}
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
  currentPriceCents,
  canonical,
  hideActions = false,
  hideSignal = false,
  pollMs = POLL_INTERVAL_MS,
}: {
  masterProductId: string;
  initialHistory: PriceHistoryResult;
  initialTimeframe?: PriceHistoryTimeframe;
  currentPriceCents?: number;
  /** Estatística canônica do produto; opcional (sem ela, mantém o cálculo por período). */
  canonical?: PriceChartCanonical;
  /** Esconde "Comprar" e "+ Carrinho" (página do produto já tem os próprios botões). */
  hideActions?: boolean;
  /** Esconde o selo de juízo do gráfico (a página do produto já mostra o seu; dois selos contradiziam um ao outro). */
  hideSignal?: boolean;
  /** Intervalo de atualização em ms; 0 desliga o polling. */
  pollMs?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const avgSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const freqSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const requestIdRef = useRef(0);
  const pointOffersRef = useRef<Record<number, PriceHistoryPointOffer>>(initialHistory.pointOffers);
  const quotesRef = useRef<PriceQuotePoint[]>(initialHistory.quotes);

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [timeframe, setTimeframe] = useState<PriceHistoryTimeframe>(initialTimeframe);
  const [history, setHistory] = useState<PriceHistoryResult>(initialHistory);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  // Checklist #19: o último ponto NÃO é mais sobrescrito pelo preço atual (isso criava a diagonal final: a série de menor preço
  // continuava reta e o último intervalo subia até o preço da oferta da página). A série é exatamente a que o servidor mediu.
  const synchronizedHistory = history;

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

    // 1. Linha do Menor Preço Mínimo Ativo (Amarela/Vibrante - segmento autêntico de mercado)
    const series = chart.addSeries(AreaSeries, {
      lineColor: palette.line,
      topColor: palette.areaTop,
      bottomColor: palette.areaBottom,
      lineWidth: 2,
      lineType: LineType.Simple,
      pointMarkersVisible: true,
      pointMarkersRadius: 3,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => formatBRL(Math.round(v * 100)),
        minMove: 0.01,
      },
      autoscaleInfoProvider: autoscaleProvider,
    });

    // 2. Linha Tracejada da Média Geral de Mercado (Azul/Branca)
    const avgSeries = chart.addSeries(LineSeries, {
      color: palette.movingAverage,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineType: LineType.Simple,
      pointMarkersVisible: true,
      pointMarkersRadius: 2,
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

    chartRef.current = chart;
    seriesRef.current = series;
    avgSeriesRef.current = avgSeries;

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
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const containerHeight = containerRef.current?.clientHeight ?? 0;
      const TOOLTIP_WIDTH = 240;
      const TOOLTIP_HEIGHT = 160;
      const x = param.point.x + 12 + TOOLTIP_WIDTH > containerWidth ? param.point.x - TOOLTIP_WIDTH - 12 : param.point.x + 12;
      const y = Math.min(Math.max(param.point.y - 12, 8), Math.max(containerHeight - TOOLTIP_HEIGHT - 8, 8));

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
    seriesRef.current.setData(synchronizedHistory.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    avgSeriesRef.current.setData(
      synchronizedHistory.avgPoints.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
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
  }, [synchronizedHistory, timeframe]);

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

  // Refetch ao trocar de produto ou de período. O primeiro render já tem o
  // histórico inicial do servidor: não refaz a mesma busca ao montar.
  const skipFirstFetch = useRef(true);
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      if (initialHistory.points.length > 0 && initialTimeframe === timeframe) return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialHistory só vale no primeiro render
  }, [masterProductId, timeframe, fetchData]);

  usePollingRefresh(fetchData, pollMs > 0 ? pollMs : POLL_INTERVAL_MS, pollMs > 0);

  const hasEnoughData = synchronizedHistory.points.length >= 2;
  const { stats } = synchronizedHistory;
  const variationVsAvgPercent =
    tooltip && stats.avgPriceCents ? Math.round(((tooltip.priceCents - stats.avgPriceCents) / stats.avgPriceCents) * 1000) / 10 : null;
  const priceSignal = useMemo(
    () => (canonical ? computeCanonicalSignal(canonical, currentPriceCents) : computePriceSignal(synchronizedHistory)),
    [canonical, currentPriceCents, synchronizedHistory]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
          <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none font-bold">
            {history.totalOffersCount || 1} {(history.totalOffersCount || 1) === 1 ? 'loja parceira monitorada' : 'lojas parceiras monitoradas'}
          </Badge>
          <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none font-bold">
            {(canonical ? canonical.quoteCount : history.totalQuoteCount || 0).toLocaleString('pt-BR')}{' '}
            {canonical ? 'cotações no histórico do produto' : 'cotações de preços coletadas'}
          </Badge>
        </div>
        {hasEnoughData && !hideSignal && (
          <PriceSignalBadge
            signal={priceSignal}
            winningOfferId={
              synchronizedHistory.points.length > 0
                ? synchronizedHistory.pointOffers[synchronizedHistory.points[synchronizedHistory.points.length - 1].time]?.offerId
                : null
            }
            masterProductId={masterProductId}
            hideActions={hideActions}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)] font-bold">
          <span className="h-1 w-4 rounded-full bg-[var(--color-accent-primary)]" /> Menor preço praticado
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)] font-bold">
          <span
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: CHART_PALETTES[resolvedTheme].movingAverage }}
          />
          Média geral de mercado
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
            Falha ao atualizar. Tentando de novo
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

  const variationColor =
    variationVsAvgPercent == null
      ? 'text-[var(--color-text-tertiary)]'
      : variationVsAvgPercent < 0
        ? 'text-[var(--color-accent-success)]'
        : variationVsAvgPercent > 0
          ? 'text-[var(--color-accent-danger)]'
          : 'text-[var(--color-text-tertiary)]';

  const quotesCount = quotes && quotes.length > 0 ? quotes.length : 1;

  return (
    <div
      className="pointer-events-none absolute z-30 w-60 rounded-[var(--radius-xl)] border border-amber-500/40 bg-[var(--color-bg-elevated)]/95 p-3.5 shadow-2xl backdrop-blur-xl transition-all"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {/* Cabeçalho de Preço */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-2 mb-2">
        <Text variant="mono-lg" className="leading-none font-black text-amber-400 text-lg">
          {formatBRL(tooltip.priceCents)}
        </Text>
        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
          {quotesCount} {quotesCount === 1 ? 'cotação' : 'cotações'}
        </span>
      </div>

      {/* Vendedor e Loja */}
      {offer ? (
        <div className="flex flex-col gap-0.5 mb-2">
          <span className="text-xs font-bold text-[var(--color-text-primary)]">
            {offer.networkName}
          </span>
          {offer.sellerNickname && (
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
              Vendedor: {offer.sellerNickname}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs font-medium text-[var(--color-text-tertiary)] mb-2 block">
          Oferta de mercado
        </span>
      )}

      {/* Variação vs Média */}
      <div className="border-t border-[var(--color-border-subtle)] pt-2 flex flex-col gap-1">
        {variationVsAvgPercent != null && (
          <span className={cn('text-xs font-bold font-mono', variationColor)}>
            {variationVsAvgPercent > 0 ? '+' : ''}
            {variationVsAvgPercent}% vs. média de mercado
          </span>
        )}
        {stats.avgPriceCents != null && (
          <span className="text-[10px] font-medium text-[var(--color-text-tertiary)]">
            Média no período: {formatBRL(stats.avgPriceCents)}
          </span>
        )}
      </div>
    </div>
  );
}

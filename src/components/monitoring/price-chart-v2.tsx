'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Layers } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import { CHART_PALETTES } from '@/lib/chart-colors';
import { useThemeStore } from '@/lib/stores/theme-store';
import { buildChartModel, compressSteps, pickLabelSlot, readAt, CHART_TFS, type ChartInput, type ChartModel, type ChartTf, type PxPoint, type PxRect, type Reading } from '@/lib/pricing/chart-model';
import type { WeakSellerNotice } from '@/lib/pricing/price-verdict-v2';

/**
 * Gráfico de preço V2 (fase 3; atrás de PRICE_METRICS_V2). SVG próprio: o eixo do tempo é PROPORCIONAL ao relógio
 * (um degrau de 3 h e um de 3 dias têm larguras diferentes) e cada lacuna é um buraco de verdade. Nada é interpolado:
 * linha do menor preço em degraus nos instantes reais dos eventos, trecho sem cotação recente tracejado cinza,
 * Padrão da tela: degraus do menor preço + UMA linha de referência (mediana histórica do período) + marcador "agora".
 * Média histórica, média do dia e marcadores de queda (só quedas >= 3%) ficam atrás do botão "Camadas".
 * Oscilações mais próximas que 3 px viram uma faixa vertical (mínimo a máximo de valores reais); rótulos de referência escolhem o canto
 * com menos cruzamentos; trechos do menor preço de vendedor de baixa reputação levam barra e nota explícitas.
 */

/** Cor do texto/linha da média no tema atual: no claro, #0284C7 sobre o fundo bege dá só 3,8:1; #0369A1 dá 5,5:1. */
const AVG_TEXT_LIGHT = '#0369A1';

const TZ = 'America/Sao_Paulo';
const H_DESKTOP = 320;
const H_MOBILE = 260;
const MAX_DROP_MARKERS = 20;
// Faixa superior (t) reservada ao chip "Agora": fica ACIMA da área do gráfico, nunca sobre a série.
const CHIP_H = 20;
const M = { l: 64, r: 12, t: 14 + CHIP_H + 6, b: 26 };

const dayMonth = (t: number) => new Date(t).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const hourMin = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dateTime = (t: number) => `${dayMonth(t)} ${hourMin(t)}`;
const dayBR = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

function ago(fromMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - fromMs) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
}

const yLabel = (cents: number, span: number) =>
  `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: span < 5000 ? 2 : 0, maximumFractionDigits: span < 5000 ? 2 : 0 })}`;

function xTicks(t0: number, t1: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(t0 + ((t1 - t0) * i) / (count - 1));
  return out;
}

export interface PriceChartV2Current {
  cents: number;
  /** Última checagem da oferta que detém o preço agora ("verificado há X h"); sem ela, usa a cotação. */
  checkedAt: string | null;
  quotedAt: string;
  /** null = empate de preço sem como afirmar a loja. */
  store: string | null;
}
export interface PriceChartV2Low {
  cents: number;
  day: string;
  store: string;
}

/** Cartão sem gráfico: 0 medições (ou falha de leitura). Nada é estimado para preencher. */
export function PriceChartV2Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-4" data-state="sem-historico-medido">
      <Text variant="label" color="tertiary">{title}</Text>
      <Text variant="body-sm" color="secondary">{text}</Text>
    </div>
  );
}

const ACTIVE_BTN = 'bg-[var(--color-accent-primary-muted)] text-[var(--color-text-primary)] shadow-[inset_0_-2px_0_var(--color-accent-primary)]';

export function PriceChartV2({
  input,
  nowIso,
  current,
  lowAll,
  weakNotice,
}: {
  input: ChartInput;
  nowIso: string;
  current: PriceChartV2Current | null;
  lowAll: PriceChartV2Low | null;
  /** Aviso de vendedor fraco nos mínimos (ver `weakSellerNotice`): só com valor diferente de 'none' o texto diz que o menor já visto o ignora. */
  weakNotice: WeakSellerNotice;
}) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const palette = CHART_PALETTES[resolvedTheme];
  const avgColor = resolvedTheme === 'light' ? AVG_TEXT_LIGHT : palette.movingAverage;
  const nowMs = useMemo(() => new Date(nowIso).getTime(), [nowIso]);
  const [tf, setTf] = useState<ChartTf>('1M');
  const [layers, setLayers] = useState({ avgDay: false, avgHistorical: false, drops: false });
  const [layersOpen, setLayersOpen] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    setWidth(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => buildChartModel(input, tf, nowMs, { avgDay: layers.avgDay, avgHistorical: layers.avgHistorical }), [input, tf, nowMs, layers.avgDay, layers.avgHistorical]);
  const mobile = width < 480;
  const H = mobile ? H_MOBILE : H_DESKTOP;
  const pw = width - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = (t: number) => M.l + ((t - model.t0) / (model.t1 - model.t0)) * pw;
  const y = (v: number) => (model.y ? M.t + ((model.y.hi - v) / (model.y.hi - model.y.lo)) * ph : M.t);

  const reading: Reading = useMemo(() => readAt(model, hoverT ?? model.t1), [model, hoverT]);
  const showChart = model.level !== 'none' && model.level !== 'single' && model.y != null;
  const drawLines = model.level !== 'points';
  const yFmtSpan = model.y ? model.y.hi - model.y.lo : 0;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = Math.min(Math.max(e.clientX - r.left, 0), r.width);
    setHoverT(model.t0 + (px / r.width) * (model.t1 - model.t0));
  };

  const stepPath = (pts: { t: number; v: number }[]) =>
    pts.map((p, i) => (i === 0 ? `M${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}` : `H${x(p.t).toFixed(1)}V${y(p.v).toFixed(1)}`)).join('');
  const linePath = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  // Muitas quedas na janela: os marcadores ficam nas MAIORES (a lista abaixo traz todas as mudanças).
  const shownDrops = model.drops.length > MAX_DROP_MARKERS ? [...model.drops].sort((a, b) => (b.prev - b.v) / b.prev - (a.prev - a.v) / a.prev).slice(0, MAX_DROP_MARKERS) : model.drops;

  // Oscilações rápidas (< 3 px) viram faixa mínimo-máximo; a linha passa pelo primeiro e pelo último valor real do trecho.
  const comps = model.y ? model.segments.map((seg) => compressSteps(seg, x, 3)) : [];
  const bandsCount = comps.reduce((n, c) => n + c.bands.length, 0);

  // Rótulos das linhas de referência: escolhe o canto (esq./dir., acima/abaixo) com menos cruzamentos com a série e com o outro rótulo.
  const labels = (() => {
    if (!model.y || !showChart) return null;
    const stepPoly = (pts: { t: number; v: number }[]): PxPoint[] => {
      const out: PxPoint[] = [];
      pts.forEach((p, i) => {
        if (i > 0) out.push({ x: x(p.t), y: y(pts[i - 1].v) });
        out.push({ x: x(p.t), y: y(p.v) });
      });
      return out;
    };
    const series: PxPoint[][] = comps.map((c) => stepPoly(c.line));
    if (model.stale) series.push([{ x: x(model.stale.t0), y: y(model.stale.v) }, { x: x(model.stale.t1), y: y(model.stale.v) }]);
    if (layers.avgDay) for (const sg of model.avgSegments) series.push(sg.map((p) => ({ x: x(p.t), y: y(p.v) })));
    const hLine = (v: number): PxPoint[] => [{ x: M.l, y: y(v) }, { x: width - M.r, y: y(v) }];
    const med = model.ref?.medianCents ?? null;
    const avg = layers.avgHistorical ? (model.ref?.avgCents ?? null) : null;
    const place = (text: string, v: number, extra: PxPoint[][], avoid: PxRect[]) => {
      const w = text.length * 6.1 + 6;
      const yy = y(v);
      const mk = (left: boolean, above: boolean): { rect: PxRect; x: number; base: number } => {
        const x0 = left ? M.l + 4 : width - M.r - 4 - w;
        const base = above ? yy - 5 : yy + 14;
        return { rect: { x0, x1: x0 + w, y0: base - 11, y1: base + 3 }, x: x0, base };
      };
      let cands = [mk(true, true), mk(false, true), mk(true, false), mk(false, false)];
      const inPlot = cands.filter((c) => c.rect.y0 >= M.t && c.rect.y1 <= M.t + ph);
      if (inPlot.length) cands = inPlot;
      const k = pickLabelSlot(cands.map((c) => c.rect), [...series, ...extra], avoid);
      return { text, ...cands[k] };
    };
    const medL = med != null ? place(`${mobile ? 'Mediana' : 'Mediana histórica'} ${formatBRL(med)}`, med, avg != null ? [hLine(avg)] : [], []) : null;
    const avgL = avg != null ? place(`${mobile ? 'Média' : 'Média histórica'} ${formatBRL(avg)}`, avg, med != null ? [hLine(med)] : [], medL ? [medL.rect] : []) : null;
    return { medL, avgL };
  })();

  const summary = model.y
    ? `Gráfico do menor preço do produto em degraus, ${model.measuredDays} dias medidos${current ? `, preço agora ${formatBRL(current.cents)}` : ''}.`
    : 'Sem dado medido.';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {model.level !== 'none' && model.level !== 'single' ? (
        <div className="inline-flex items-center gap-0.5 border border-[var(--color-border-subtle)] p-1" role="group" aria-label="Período">
          {CHART_TFS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTf(opt)}
              aria-pressed={tf === opt}
              className={cn(
                'min-h-8 px-2.5 py-1 text-caption font-medium transition-colors',
                tf === opt ? ACTIVE_BTN : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        ) : null}
        {showChart && (
          <button
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
            className="inline-flex min-h-8 items-center gap-1.5 border border-[var(--color-border-subtle)] px-2.5 py-1 text-caption font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <Layers className="size-3.5" aria-hidden />
            Camadas
          </button>
        )}
        {model.level === 'short' || model.level === 'points' ? (
          <span className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] px-2 py-1 text-caption font-semibold text-[var(--color-text-tertiary)]">
            Histórico curto: {model.measuredDays} dia{model.measuredDays === 1 ? '' : 's'} medido{model.measuredDays === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {showChart && layersOpen && (
        <div className="flex flex-wrap gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-2" role="group" aria-label="Camadas do gráfico">
          {([
            ['avgHistorical', 'Média histórica'],
            ['avgDay', 'Média do dia (3+ ofertas)'],
            ['drops', 'Marcadores de queda (3% ou mais)'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
              className={cn(
                'min-h-8 border px-2.5 py-1 text-caption font-medium transition-colors',
                layers[key]
                  ? `border-[var(--color-accent-primary)] ${ACTIVE_BTN}`
                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--color-accent-primary)]" /> Menor preço (degraus)</span>
        {model.ref?.medianCents != null && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dotted border-[var(--color-text-secondary)]" /> Mediana histórica do período</span>}
        {layers.avgHistorical && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: avgColor }} /> Média histórica do período</span>}
        {layers.avgDay && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: avgColor, opacity: 0.55 }} /> Média do dia</span>}
        {model.weakSteps.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-4" style={{ background: palette.down }} /> Menor preço de vendedor de baixa reputação</span>}
        {bandsCount > 0 && <span className="inline-flex items-center gap-1.5"><span className={cn('inline-block h-3', mobile ? 'w-px' : 'w-1')} style={{ background: palette.line, opacity: mobile ? 0.3 : 0.4 }} /> Oscilações rápidas (mínimo a máximo)</span>}
        {layers.drops && <span className="inline-flex items-center gap-1.5"><span className="inline-block size-0 border-x-4 border-t-[7px] border-x-transparent" style={{ borderTopColor: palette.up }} /> Queda de 3% ou mais</span>}
      </div>
      {showChart && model.stale && (
        <Text variant="caption" color="tertiary">
          Trecho tracejado: sem cotação há mais de 48 h, este preço pode já ter mudado.
        </Text>
      )}

      <div ref={boxRef} className="relative w-full">
        {model.level === 'none' && (
          <div className="flex h-40 items-center justify-center border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] px-6 text-center">
            <Text variant="body-sm" color="tertiary">Sem dado medido neste período. Nada é estimado para preencher.</Text>
          </div>
        )}
        {model.level === 'single' && (
          <div className="flex flex-col gap-1 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-4">
            <Text variant="label" color="tertiary">Só 1 dia medido</Text>
            {current ? <Text variant="heading-md" className="tabular">{formatBRL(current.cents)} <span className="text-body-sm font-normal text-[var(--color-text-secondary)]">agora{current.store ? ` · ${current.store}` : ''}</span></Text> : null}
            <Text variant="caption" color="tertiary">Um gráfico de linha precisa de pelo menos 2 dias medidos. Volte nos próximos dias.</Text>
          </div>
        )}
        {showChart && model.y && (
          <svg
            width={width}
            height={H}
            viewBox={`0 0 ${width} ${H}`}
            role="img"
            aria-label={summary}
            className="block select-none"
            style={{ touchAction: 'pan-y' }}
          >
            {/* grade e eixo Y (não começa em zero) */}
            {model.y.ticks.map((tk) => (
              <g key={tk}>
                <line x1={M.l} x2={width - M.r} y1={y(tk)} y2={y(tk)} stroke={palette.grid} strokeWidth={1} />
                <text x={M.l - 6} y={y(tk) + 4} textAnchor="end" fontSize={11} fill={palette.textMuted}>{yLabel(tk, yFmtSpan)}</text>
              </g>
            ))}
            {xTicks(model.t0, model.t1, mobile ? 3 : 5).map((t, i, a) => (
              <text key={t} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'} fontSize={11} fill={palette.textMuted}>
                {tf === '1D' ? hourMin(t) : dayMonth(t)}
              </text>
            ))}

            {/* referência do período: mediana histórica (padrão); média histórica atrás de "Camadas". Rótulos com contorno do fundo. */}
            {(() => {
              const ym = model.ref?.medianCents != null ? y(model.ref.medianCents) : null;
              const ya = layers.avgHistorical && model.ref?.avgCents != null ? y(model.ref.avgCents) : null;
              const halo = { stroke: palette.background, strokeWidth: 3, paintOrder: 'stroke' } as const;
              return (
                <g>
                  {ym != null && (
                    <>
                      <line x1={M.l} x2={width - M.r} y1={ym} y2={ym} stroke={palette.text} strokeWidth={1.25} strokeDasharray="2 3" />
                      {labels?.medL && <text x={labels.medL.x} y={labels.medL.base} fontSize={11} fill={palette.text} {...halo}>{labels.medL.text}</text>}
                    </>
                  )}
                  {ya != null && (
                    <>
                      <line x1={M.l} x2={width - M.r} y1={ya} y2={ya} stroke={avgColor} strokeWidth={1.25} strokeDasharray="6 4" />
                      {labels?.avgL && <text x={labels.avgL.x} y={labels.avgL.base} fontSize={11} fill={avgColor} {...halo}>{labels.avgL.text}</text>}
                    </>
                  )}
                </g>
              );
            })()}

            {/* média do dia: curva fina, só n >= 3, quebra em dia sem média */}
            {layers.avgDay && model.avgSegments.map((s, i) => (
              <g key={`a${i}`} opacity={0.6}>
                {s.length > 1 && drawLines && <path d={linePath(s)} fill="none" stroke={avgColor} strokeWidth={1.5} />}
                {s.map((p) => <circle key={p.day} cx={x(p.t)} cy={y(p.v)} r={2.5} fill={avgColor} />)}
              </g>
            ))}

            {/* trecho sem cotação recente: valor carregado, tracejado cinza */}
            {model.stale && (
              <line x1={x(model.stale.t0)} x2={x(model.stale.t1)} y1={y(model.stale.v)} y2={y(model.stale.v)} stroke={palette.textMuted} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 4" />
            )}

            {/* menor preço: degraus nos instantes reais dos eventos, um segmento por corrida medida */}
            {model.segments.map((seg, i) => {
              const pts = seg.length > 1 && seg[seg.length - 1].v === seg[seg.length - 2].v ? seg.slice(0, -1) : seg;
              const comp = comps[i];
              return (
                <g key={`s${i}`}>
                  {comp?.bands.map((b) => (
                    <rect key={`b${b.t0}`} x={mobile ? x(b.t0) - 0.5 : x(b.t0) - 1.5} y={y(b.hi)} width={mobile ? Math.max(1, x(b.t1) - x(b.t0) + 1) : Math.max(3, x(b.t1) - x(b.t0) + 3)} height={Math.max(2, y(b.lo) - y(b.hi))} fill={palette.line} opacity={mobile ? 0.22 : 0.4}>
                      <title>{`${b.count} mudanças do menor preço entre ${dateTime(b.t0)} e ${dateTime(b.t1)}: de ${formatBRL(b.lo)} a ${formatBRL(b.hi)}`}</title>
                    </rect>
                  ))}
                  {drawLines && seg.length > 1 && <path d={stepPath(comp ? comp.line : seg)} fill="none" stroke={palette.line} strokeWidth={1.75} strokeLinejoin="bevel" />}
                  {(!drawLines || seg.length === 1) && pts.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={4} fill={palette.line} />)}
                </g>
              );
            })}

            {/* trechos do menor preço de vendedor de baixa reputação: barra sob o degrau (legenda e nota abaixo do gráfico) */}
            {model.weakSteps.map((w) => (
              <line key={`w${w.t0}`} x1={x(w.t0)} x2={Math.max(x(w.t1), x(w.t0) + 2)} y1={y(w.v) + 5} y2={y(w.v) + 5} stroke={palette.down} strokeWidth={3} />
            ))}

            {/* marcadores de queda do menor preço */}
            {layers.drops && shownDrops.map((d) => (
              <polygon key={d.t} points={`${x(d.t) - 5},${y(d.v) - 10} ${x(d.t) + 5},${y(d.v) - 10} ${x(d.t)},${y(d.v) - 2}`} fill={palette.up} stroke={palette.background} strokeWidth={1}>
                <title>{`Queda para ${formatBRL(d.v)} (antes ${formatBRL(d.prev)}) em ${dateTime(d.t)} · ${d.store}`}</title>
              </polygon>
            ))}

            {/* preço atual: marcador no fim da linha + chip na faixa acima do gráfico (não cobre a série nem o eixo) */}
            {current && model.y && (() => {
              const cy = Math.min(Math.max(y(current.cents), M.t), M.t + ph);
              const since = ago(new Date(current.checkedAt ?? current.quotedAt).getTime(), nowMs);
              const label = mobile ? `Agora ${formatBRL(current.cents)}` : `Agora ${formatBRL(current.cents)} · verificado há ${since}`;
              const w = label.length * 6.4 + 14;
              return (
                <g pointerEvents="none">
                  <rect x={width - M.r - 4} y={cy - 4} width={8} height={8} fill={palette.line} stroke={palette.background} />
                  <rect x={width - M.r - w} y={2} width={w} height={CHIP_H} fill={palette.line} />
                  <text x={width - M.r - w / 2} y={2 + CHIP_H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0B0908">{label}</text>
                </g>
              );
            })()}

            {/* leitura: cursor */}
            {hoverT != null && (
              <g pointerEvents="none">
                <line x1={x(hoverT)} x2={x(hoverT)} y1={M.t} y2={M.t + ph} stroke={palette.text} strokeOpacity={0.5} strokeDasharray="3 3" />
                {reading.minCents != null && <rect x={x(hoverT) - 4} y={y(reading.minCents) - 4} width={8} height={8} fill={reading.stale ? palette.textMuted : palette.line} stroke={palette.background} />}
              </g>
            )}
            <rect x={M.l} y={M.t} width={pw} height={ph} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHoverT(null); }} />
          </svg>
        )}
      </div>

      {showChart && <ReadingBar reading={reading} hover={hoverT != null} nowMs={nowMs} showAvg={layers.avgDay} />}

      {showChart && (
        <Text variant="caption" color="tertiary">
          O eixo vertical não começa em zero. {model.ref ? `Referência do período: ${model.ref.coveredDays} dia${model.ref.coveredDays === 1 ? '' : 's'} com dado. ` : 'Sem mediana histórica no período (menos de 3 ofertas). '}
          {model.firstMeasuredAt ? `Medição regular desde ${dayMonth(model.firstMeasuredAt)}.` : ''}
        </Text>
      )}

      {showChart && model.weakSteps.length > 0 && (
        <Text variant="caption" color="tertiary">
          A barra vermelha sob o degrau marca o trecho em que o menor preço do gráfico é de vendedor de baixa reputação.
          {weakNotice !== 'none' ? ' O "menor já visto" e os mínimos de referência ignoram esse vendedor, por isso podem ser maiores que o ponto mais baixo da linha.' : ''}
        </Text>
      )}

      {lowAll && (
        <Text variant="body-sm" color="secondary">
          Menor já visto: <span className="tabular font-semibold text-[var(--color-text-primary)]">{formatBRL(lowAll.cents)}</span> em {dayBR(lowAll.day)} · {lowAll.store}
          {weakNotice !== 'none' ? <span className="text-[var(--color-text-tertiary)]"> (ignora vendedor de baixa reputação)</span> : null}
        </Text>
      )}

      <EventList model={model} currentCents={current?.cents ?? null} />

      {input.legacyDays > 0 && (
        <div className="flex items-start gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-2.5">
          <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
          <Text variant="caption" color="tertiary">
            Histórico antigo: {input.legacyDays} dia{input.legacyDays === 1 ? '' : 's'} anteriores a 31/10/2026 foram coletados em outro regime, não são comparáveis e ficam fora do gráfico e das medidas.
          </Text>
        </div>
      )}
    </div>
  );
}

/** Barra de leitura de altura fixa: no mobile substitui o tooltip flutuante (o dedo cobriria o gráfico). */
function ReadingBar({ reading, hover, nowMs, showAvg }: { reading: Reading; hover: boolean; nowMs: number; showAvg: boolean }) {
  const when = hover ? dateTime(reading.t) : `agora (${dateTime(nowMs)})`;
  return (
    <div className="grid min-h-[116px] grid-cols-2 [&>div]:min-w-0 gap-x-4 gap-y-1 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-3 sm:min-h-[76px] sm:grid-cols-4" aria-live="polite">
      <div className="col-span-2 sm:col-span-4">
        <Text variant="caption" color="tertiary">{when}</Text>
      </div>
      <div>
        <Text variant="caption" color="tertiary">Menor preço</Text>
        <Text variant="body-sm" className="tabular font-semibold">
          {reading.minCents != null ? formatBRL(reading.minCents) : 'sem medição'}
        </Text>
        {reading.stale && <Text variant="caption" color="tertiary">sem cotação recente</Text>}
      </div>
      <div className="order-last col-span-2 sm:order-none sm:col-span-1">
        <Text variant="caption" color="tertiary">Loja</Text>
        <Text variant="body-sm" className="min-w-0 truncate" title={reading.store ?? undefined}>{reading.store ?? 'n/d'}</Text>
        {reading.weak && <Text variant="caption" color="tertiary">baixa reputação</Text>}
      </div>
      {showAvg && (
        <div>
          <Text variant="caption" color="tertiary">Média do dia</Text>
          <Text variant="body-sm" className="tabular">
            {reading.avgState === 'ok' && reading.avgCents != null ? formatBRL(Math.round(reading.avgCents)) : reading.avgState === 'few' ? 'menos de 3 ofertas' : 'sem medição'}
          </Text>
        </div>
      )}
      <div title="Quantas ofertas diferentes tiveram cotação neste dia. Não é o mesmo que as lojas distintas hoje, no topo da página.">
        <Text variant="caption" color="tertiary">Ofertas cotadas no dia</Text>
        <Text variant="body-sm" className="tabular">{reading.nOffers ?? 'n/d'}</Text>
      </div>
    </div>
  );
}

/** Mudanças do menor preço: a mais recente em destaque, as anteriores recolhidas. "Detectado em" = quando o coletor viu a mudança. */
function EventList({ model, currentCents }: { model: ChartModel; currentCents: number | null }) {
  if (!model.events.length) return null;
  const [latest, ...rest] = model.events;
  const row = (e: ChartModel['events'][number], strong: boolean) => {
    const down = e.prevMinCents != null && e.minCents < e.prevMinCents;
    const up = e.prevMinCents != null && e.minCents > e.prevMinCents;
    return (
      <li key={e.at} className={cn('flex flex-wrap items-baseline justify-between gap-x-3 px-2.5 text-body-sm', strong ? 'py-2.5' : 'py-1.5')}>
        <span className="tabular text-[var(--color-text-tertiary)]">Detectado em {dateTime(new Date(e.at).getTime())}</span>
        <span className={cn('tabular font-semibold', down ? 'text-[var(--color-accent-success)]' : up ? 'text-[var(--color-accent-danger)]' : 'text-[var(--color-text-primary)]')}>
          {formatBRL(e.minCents)}{e.prevMinCents != null ? ` (antes ${formatBRL(e.prevMinCents)})` : ' (primeiro registro)'}
        </span>
        <span className="text-[var(--color-text-secondary)]">{e.store}</span>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label" color="tertiary">Última mudança do menor preço</Text>
      <ul className="flex flex-col border border-[var(--color-border-default)] bg-[var(--color-bg-inset)]">{row(latest, true)}</ul>
      {currentCents != null && latest.minCents !== currentCents && (
        <Text variant="caption" color="tertiary">
          O menor preço atual ({formatBRL(currentCents)}) é de outra oferta, ainda sem evento gravado; este é o último evento registrado.
        </Text>
      )}
      {rest.length > 0 && (
        <details className="group border border-[var(--color-border-subtle)]">
          <summary className="cursor-pointer list-none px-2.5 py-1.5 text-caption font-medium text-[var(--color-accent-primary)] marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Mudanças anteriores no período ({rest.length})</span>
            <span className="hidden group-open:inline">Recolher mudanças anteriores</span>
          </summary>
          <ul className="flex max-h-72 flex-col divide-y divide-[var(--color-border-subtle)] overflow-y-auto border-t border-[var(--color-border-subtle)]">
            {rest.map((e) => row(e, false))}
          </ul>
        </details>
      )}
    </div>
  );
}

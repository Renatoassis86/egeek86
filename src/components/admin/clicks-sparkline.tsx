import { cn } from '@/lib/cn';
import type { DailyClicksPoint } from '@/server/queries/affiliate';

/**
 * Sparkline leve (SVG puro, sem lib de gráfico) pra tendência de cliques nos
 * últimos dias no dashboard admin. Sem estado/interatividade — Server
 * Component puro, zero JS enviado ao client.
 */
export function ClicksSparkline({ data, className }: { data: DailyClicksPoint[]; className?: string }) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 28;
  const max = Math.max(...data.map((d) => d.clicks), 1);
  const step = width / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * step;
    const y = height - (d.clicks / max) * (height - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(' ');
  const total = data.reduce((sum, d) => sum + d.clicks, 0);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-8 w-full overflow-visible"
        role="img"
        aria-label={`Tendência de cliques nos últimos ${data.length} dias, total de ${total}`}
      >
        <polygon points={areaPoints} fill="var(--color-accent-primary-muted)" stroke="none" />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--color-accent-primary)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="text-caption text-[var(--color-text-tertiary)]">
        últimos {data.length} dias
      </span>
    </div>
  );
}

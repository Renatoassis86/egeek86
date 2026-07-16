import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';

/**
 * Barra visual leve (sem lib de gráfico) posicionando o preço atual e a
 * média de 30d entre o menor histórico e o teto conhecido — dá noção de
 * "onde" o preço de hoje está sem precisar ler 3 números separados. Mesmo
 * princípio de CamelCamelCamel/IsThereAnyDeal: o número sozinho não diz
 * nada, o contexto histórico é que ajuda a decidir.
 *
 * Visual apenas — o cálculo (low/high/range/percentuais) é idêntico ao
 * original, não mexer na lógica, só na apresentação.
 */
export function PriceRangeBar({
  currentPriceCents,
  metrics,
}: {
  currentPriceCents: number;
  metrics: { lowestPriceCents: number; avgPriceCents30d: number | null };
}) {
  const low = metrics.lowestPriceCents;
  const high = Math.max(currentPriceCents, metrics.avgPriceCents30d ?? low, low);
  const range = high - low;
  if (range <= 0) return null;

  const currentPct = Math.min(100, Math.max(0, ((currentPriceCents - low) / range) * 100));
  const avgPct =
    metrics.avgPriceCents30d != null
      ? Math.min(100, Math.max(0, ((metrics.avgPriceCents30d - low) / range) * 100))
      : null;
  // Só pro rótulo flutuante não vazar da caixa nas pontas — a posição real do marcador usa currentPct puro.
  const labelPct = Math.min(90, Math.max(10, currentPct));

  return (
    <div className="mt-1">
      <div className="relative pt-6">
        <div
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${labelPct}%` }}
          aria-hidden
        >
          <Text variant="label" color="accent" className="font-semibold">
            {formatBRL(currentPriceCents)} hoje
          </Text>
        </div>

        <div className="relative h-2.5 rounded-[var(--radius-full)] bg-gradient-to-r from-[var(--color-accent-success)]/25 via-[var(--color-bg-elevated)] to-[var(--color-accent-danger)]/20">
          {avgPct != null && (
            <div
              className="absolute top-1/2 size-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[var(--color-text-secondary)] ring-2 ring-[var(--color-bg-canvas)]"
              style={{ left: `${avgPct}%` }}
              aria-hidden
              title="Média 30 dias"
            />
          )}
          <div
            className="absolute top-1/2 size-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-[3px] border-[var(--color-bg-canvas)] bg-[var(--color-accent-primary)] shadow-[var(--shadow-glow-primary)]"
            style={{ left: `${currentPct}%` }}
            aria-hidden
            title="Preço atual"
          />
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <Text variant="caption" color="success" className="font-medium whitespace-nowrap">
          {formatBRL(low)} · menor já visto
        </Text>
        {metrics.avgPriceCents30d != null && (
          <Text variant="caption" color="tertiary" className="hidden sm:inline-flex items-center gap-1 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-[var(--color-text-secondary)]" aria-hidden />
            Média 30d: {formatBRL(metrics.avgPriceCents30d)}
          </Text>
        )}
        <Text variant="caption" color="tertiary" className="whitespace-nowrap">
          {formatBRL(high)}
        </Text>
      </div>
    </div>
  );
}

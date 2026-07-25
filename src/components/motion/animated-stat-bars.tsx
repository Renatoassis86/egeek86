'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Text } from '@/components/ui/text';

export interface StatBarItem {
  label: string;
  /** 0-100 — preenchimento visual da barra (ilustrativo, não é um chart de precisão). */
  fillPercent: number;
  displayValue: string;
  /** Fonte citada — nunca exibir estatística de mercado sem dizer de onde veio. */
  source: string;
}

/**
 * Barras que "surgem" ao entrar na viewport — storytelling de dado real
 * (mercado gamer), não um gráfico de precisão. Mesmo padrão de motion do
 * Reveal (whileInView + useReducedMotion), sem lib de chart nova: aqui são
 * só 3-4 barras ilustrativas, lightweight-charts é pra série temporal de
 * preço com crosshair, seria overkill.
 */
export function AnimatedStatBars({ items }: { items: StatBarItem[] }) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col gap-5">
      {items.map((item, i) => {
        const pct = Math.min(100, Math.max(0, item.fillPercent));
        return (
          <div key={item.label} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <Text variant="body-sm" className="font-semibold">
                {item.label}
              </Text>
              <Text variant="mono-md" className="font-black text-[var(--color-accent-primary)] tabular">
                {item.displayValue}
              </Text>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-inset)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)]"
                style={{ transformOrigin: 'left', width: '100%' }}
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: pct / 100 }}
                viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                transition={{ delay: reduce ? 0 : i * 0.12, duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <Text variant="caption" color="tertiary" className="text-[10px]">
              Fonte: {item.source}
            </Text>
          </div>
        );
      })}
    </div>
  );
}

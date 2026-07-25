import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

/** Indicador numérico em card — usado em qualquer lugar que mostre COUNT real do banco (nunca estimativa). */
export function StatTile({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <CardContent className="p-5 flex flex-col gap-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
          {icon}
        </div>
        <Text variant="heading-lg" className="font-black text-2xl tabular">
          {value.toLocaleString('pt-BR')}
        </Text>
        <Text variant="caption" color="tertiary">
          {label}
        </Text>
      </CardContent>
    </Card>
  );
}

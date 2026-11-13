import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { ContagemBlackFriday } from '@/components/black-friday/contagem-black-friday';

/** Faixa de entrada da Black Friday para a home (nova landing, atrás da flag REDESENHO_HOME). */
export function FaixaBlackFriday() {
  return (
    <section aria-label="Black Friday" className="border-y border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div className="flex flex-col">
          <Text variant="label" color="tertiary">Black Friday</Text>
          <Text as="h2" variant="heading-md" className="font-black tracking-tight">Quedas reais de preço, contra a média de todas as lojas</Text>
          <ContagemBlackFriday />
        </div>
        <Link
          href="/black-friday"
          className="inline-flex min-h-11 items-center gap-2 self-start border border-[var(--color-accent-primary)] px-4 text-[14px] font-semibold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-muted)] sm:self-auto"
        >
          Ver as quedas <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

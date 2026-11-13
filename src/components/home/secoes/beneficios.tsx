// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Beneficios.
import { Sparkles, History, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';

// ----- Benefits ----------------------------------------------
const benefits = [
  {
    Icon: TrendingDown,
    title: 'Preço monitorado',
    description: 'Acompanhamos o preço dos jogos e consoles nas lojas parceiras e mostramos o menor preço com oferta ativa.',
  },
  {
    Icon: History,
    title: 'Histórico de preço',
    description: 'Preço atual, média e menor preço registrado de cada produto, quando já há histórico suficiente.',
  },
  {
    Icon: Sparkles,
    title: 'Aviso de queda de preço',
    description: 'Acompanhe um jogo e seja avisado quando o menor preço entre as lojas cair.',
  },
];

export function Benefits() {
  return (
    <section className="w-full relative overflow-hidden mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
      <Glow color="gold" size="md" intensity={0.15} className="-top-24 right-0" />

      <Reveal>
        <div className="mb-10 max-w-[36ch]">
          <Text variant="label" color="tertiary">
            Por que Geek 86
          </Text>
          <Text as="h2" variant="display-lg" className="mt-2">
            Preço monitorado, histórico à vista.
          </Text>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        {benefits.map((b, i) => (
          <Reveal key={b.title} delay={i * 0.06}>
            <Card className="h-full">
              <CardContent className="flex flex-col gap-4 p-6 lg:p-7">
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-accent-primary)]">
                    <b.Icon className="size-5" />
                  </div>
                  <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                    0{i + 1}
                  </span>
                </div>
                <Text variant="heading-sm">{b.title}</Text>
                <Text variant="body-sm" color="secondary">
                  {b.description}
                </Text>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

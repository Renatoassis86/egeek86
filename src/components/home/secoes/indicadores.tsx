// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Indicadores da home (4 contadores).
import Image from 'next/image';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { PUBLIC_METRIC_LABELS, type PublicMetrics } from '@/server/queries/public-metrics';
import { Package, Store, LineChart, TrendingDown as TrendingDownIcon } from 'lucide-react';
import { StatTile } from '@/components/ui/stat-tile';

export function IndicatorsSection({ metrics }: { metrics: PublicMetrics }) {
  return (
    <section data-theme="dark" className="w-full bg-gradient-to-b from-[#03291e] to-[#011a13] text-white border-y border-emerald-800/40 py-20 lg:py-28 relative overflow-hidden">
      <Glow color="hype" size="xl" intensity={0.15} className="-top-64 -right-48" />
      <div className="relative mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-10 text-center items-center">
        <Reveal>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 w-fit mx-auto">
            Métricas da nossa plataforma
          </span>
          <Text as="h2" variant="display-lg" className="mt-3 font-black text-white tracking-tight">
            Números do site.
          </Text>
          <Text variant="body-lg" className="mt-3 max-w-[52ch] mx-auto text-emerald-100/80 font-medium leading-relaxed">
            São contagens do nosso banco de dados, atualizadas a cada poucos minutos.
          </Text>
        </Reveal>

        <Reveal delay={0.08} className="w-full">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
            <StatTile icon={<Package className="size-5" />} value={metrics.products} label={PUBLIC_METRIC_LABELS.products} />
            <StatTile icon={<Store className="size-5" />} value={metrics.stores} label="Marketplaces com oferta ativa" />
            <StatTile icon={<LineChart className="size-5" />} value={metrics.quotes} label={PUBLIC_METRIC_LABELS.quotes} />
            {metrics.belowAverageCount != null && (
              <StatTile icon={<TrendingDownIcon className="size-5" />} value={metrics.belowAverageCount} label="Produtos abaixo do normal (histórico elegível)" />
            )}
          </div>
        </Reveal>

        {/* Imagem de Cockpit de Métricas & Inteligência Analítica */}
        <Reveal delay={0.12} className="w-full">
          <div className="relative aspect-[21/9] sm:aspect-[24/9] w-full rounded-[var(--radius-xl)] overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] shadow-2xl">
            <Image
              src="/images/home/painel-analitico-86.webp"
              alt="Gráficos de métricas do Espaço Geek 86"
              fill
              className="object-cover object-center"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Teaser do Observatorio Gamer.
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles, Newspaper, FileText, TrendingUp, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage } from '@/components/motion/scene-image';

// ----- Inteligência Gamer Teaser Section --------------------
export function InteligenciaGamerTeaserSection() {
  return (
    <section data-theme="dark" className="w-full bg-[var(--color-bg-canvas)] border-b border-[var(--color-border-subtle)] py-20 lg:py-28 relative overflow-hidden">
      <Glow color="gold" size="lg" intensity={0.12} className="-top-32 left-0" />
      <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-14">
          {/* Lado Esquerdo: Conteúdo Principal */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <Reveal>
              <SceneImage
                src="/images/home/observatorio-gamer-hero.webp"
                alt="Pesquisadores e analistas do Observatório Gamer"
                tone="ember"
                className="aspect-[16/9] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] mb-2"
              />
              <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" aria-hidden />
                Arkos Intelligence
              </Text>
              <Text as="h2" variant="display-lg" className="mt-2">
                Observatório Gamer: dados, análises e notícias.
              </Text>
              <Text variant="body-lg" color="secondary" className="leading-relaxed mt-2">
                Pesquisas sobre preços e comportamento do público gamer, análises e colunas de opinião.
              </Text>
              <div className="mt-6 flex flex-wrap gap-4">
                <Button asChild size="lg" rightIcon={<ArrowRight className="size-4" />}>
                  <Link href="/inteligencia-gamer">Acessar Portal Inteligência</Link>
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Lado Direito: Grid de Categorias/Artigos + Imagem Estratégica */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Reveal delay={0.06}>
                <Card className="h-full">
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <TrendingUp className="size-4" />
                    </div>
                    <Text variant="heading-sm" className="font-bold">Pesquisas Empíricas</Text>
                    <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
                      Análises estatísticas da variação histórica dos preços.
                    </Text>
                  </CardContent>
                </Card>
              </Reveal>

              <Reveal delay={0.12}>
                <Card className="h-full">
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                      <FileText className="size-4" />
                    </div>
                    <Text variant="heading-sm" className="font-bold">Pesquisas Teóricas</Text>
                    <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
                      Ensaios sobre gamificação, comportamento social e a história das gerações de consoles.
                    </Text>
                  </CardContent>
                </Card>
              </Reveal>

              <Reveal delay={0.18}>
                <Card className="h-full">
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                      <Layers className="size-4" />
                    </div>
                    <Text variant="heading-sm" className="font-bold">Pesquisas Descritivas</Text>
                    <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
                      Relatórios sobre o perfil do público gamer no Brasil e por região.
                    </Text>
                  </CardContent>
                </Card>
              </Reveal>

              <Reveal delay={0.24}>
                <Card className="h-full">
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-purple-500/10 text-purple-500">
                      <Newspaper className="size-4" />
                    </div>
                    <Text variant="heading-sm" className="font-bold">Notícias e Artigos</Text>
                    <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
                      Novidades da indústria de jogos e colunas dos fundadores.
                    </Text>
                  </CardContent>
                </Card>
              </Reveal>
            </div>

            {/* Imagem Ilustrativa Estratégica do Observatório Gamer */}
            <Reveal delay={0.28}>
              <div className="relative aspect-[21/9] sm:aspect-[24/9] w-full rounded-[var(--radius-lg)] overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] shadow-xl">
                <Image
                  src="/images/home/observatorio-cards-bg.webp"
                  alt="Pesquisa Acadêmica e Análise de Mercado Gamer"
                  fill
                  className="object-cover object-center"
                />
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

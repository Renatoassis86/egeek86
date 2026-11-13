// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Categorias "lado do jogo" e "lado da cultura" da home.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { CircuitLines } from '@/components/motion/circuit-lines';
import { CategoryCard, gamerCards, geekCards } from '@/lib/categories-showcase';
import { cn } from '@/lib/cn';

function Cluster({
  word,
  src,
  label,
  heading,
  text,
  cards,
  accentColor = 'gold',
}: {
  word: string;
  src: string;
  label: string;
  heading: string;
  text: string;
  cards: CategoryCard[];
  accentColor?: 'gold' | 'emerald';
}) {
  const isEmerald = accentColor === 'emerald';
  const labelBadgeBg = isEmerald ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  const iconColor = isEmerald ? 'text-emerald-400' : 'text-amber-400';
  const cardBorderHover = isEmerald ? 'hover:border-emerald-400/80 hover:bg-[#073629]' : 'hover:border-amber-400/80 hover:bg-[#2e1747]';

  return (
    <section className="relative w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24 overflow-hidden border-b border-white/10">
      <CircuitLines className="opacity-30" />

      <div className="relative grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
        <Reveal>
          <TextImageMask text={word} src={src} className="text-[100px] leading-none sm:text-[140px] lg:text-[170px]" />
        </Reveal>

        <Reveal delay={0.08}>
          <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border w-fit mb-3', labelBadgeBg)}>
            {label}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight mt-1 max-w-[22ch]">
            {heading}
          </h2>
          <p className="text-zinc-200 text-base sm:text-lg font-medium leading-relaxed mt-4 max-w-[52ch]">
            {text}
          </p>
        </Reveal>
      </div>

      <div className={`relative mt-12 grid gap-4 ${cards.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {cards.map(({ href, label: cardLabel, description, Icon, cta = 'Ver ofertas' }, i) => (
          <Reveal key={href} delay={0.06 + i * 0.06}>
            <Link
              href={href}
              className={cn(
                'group flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-white/15 bg-white/10 p-6 backdrop-blur-md transition-all shadow-lg',
                cardBorderHover
              )}
            >
              <Icon className={cn('size-7', iconColor)} aria-hidden />
              <h3 className="text-xl font-black text-white tracking-tight">
                {cardLabel}
              </h3>
              <p className="text-sm font-medium text-zinc-200 leading-relaxed">
                {description}
              </p>
              <span className={cn('mt-auto inline-flex items-center gap-1.5 text-sm font-bold transition-colors', iconColor)}>
                {cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function CategoriesSection() {
  return (
    <div className="w-full">
      <div data-theme="dark" className="bg-gradient-to-b from-[#1c0c32] via-[#160928] to-[#10061e] text-white border-b border-purple-900/40">
        <Cluster
          word="GAMER"
          src="/images/categorias/gamer-mask-light.png"
          label="O lado do jogo"
          heading="Jogos, consoles e acessórios."
          text="Jogos físicos, consoles e acessórios, cada um com preço monitorado e histórico de preços."
          cards={gamerCards}
          accentColor="gold"
        />
      </div>
      <div data-theme="dark" className="bg-gradient-to-b from-[#053024] via-[#03241b] to-[#021812] text-white border-b border-emerald-900/40">
        <Cluster
          word="GEEK"
          src="/images/categorias/geek-mask-light.png"
          label="O lado da cultura"
          heading="Franquias, lançamentos e comunidade."
          text="Notícias, lançamentos e conteúdo sobre cultura geek."
          cards={geekCards}
          accentColor="emerald"
        />
      </div>
    </div>
  );
}

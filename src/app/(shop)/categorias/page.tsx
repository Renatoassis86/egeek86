import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Boxes, Gamepad2, Joystick, LibraryBig, Newspaper, Sparkles, Zap } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { SceneImage } from '@/components/motion/scene-image';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { CircuitLines } from '@/components/motion/circuit-lines';

export const metadata: Metadata = {
  title: 'Categorias',
  description: 'Navegue pelo catálogo do Espaço Geek 86 por tipo de produto e por universo geek.',
};

export default function CategoriasPage() {
  return (
    <>
      <Hero />
      <Cluster
        word="GAMER"
        src="/images/categorias/gamer-collage.png"
        label="O lado do jogo"
        heading="Jogo, console e o que equipa a experiência."
        text="Tudo que é produto de verdade, com preço monitorado e histórico real por trás de cada item."
        cards={gamerCards}
      />
      <Cluster
        word="GEEK"
        src="/images/categorias/geek-collage.png"
        label="O lado da cultura"
        heading="Franquia, lançamento e o que move a comunidade."
        text="A parte do site que não é sobre comprar, é sobre acompanhar o que importa pra quem vive cultura geek."
        cards={geekCards}
      />
    </>
  );
}

function Hero() {
  return (
    <section className="relative w-full mx-auto max-w-7xl px-4 lg:px-8 pt-14 pb-10 lg:pt-20 lg:pb-14 overflow-hidden">
      <CircuitLines className="opacity-70" />

      <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-6">
        <Reveal className="lg:col-span-7">
          <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden />
            Categorias
          </Text>
          <Text as="h1" variant="display-xl" className="mt-3 max-w-[22ch] lg:text-display-2xl">
            Duas formas de navegar, um catálogo só.
          </Text>
          <Text variant="body-lg" color="secondary" className="mt-4 max-w-[56ch]">
            Separamos o catálogo em dois lados. GAMER é produto: jogo, console, acessório, tudo com
            preço monitorado. GEEK é cultura: franquia, lançamento, o que está em alta na comunidade.
            Escolha por onde entrar.
          </Text>
        </Reveal>

        {/* Painel duplo de corte diagonal (referência Mevos, mesmo espírito do
            HypeTeaser na home) — só lg+, em telas menores o corte angular
            sobra pouco espaço útil pra cada foto. */}
        <Reveal delay={0.08} className="hidden lg:col-span-5 lg:flex lg:h-64 lg:gap-2">
          <div className="relative flex-1 overflow-hidden rounded-[var(--radius-lg)] [clip-path:polygon(18%_0,100%_0,82%_100%,0%_100%)]">
            <SceneImage
              src="/images/categorias/hero-gamer-panel.png"
              alt="Cena de jogo e console"
              tone="ember"
              caption="Em curadoria"
              className="absolute inset-0"
            />
          </div>
          <div className="relative flex-1 overflow-hidden rounded-[var(--radius-lg)] [clip-path:polygon(18%_0,100%_0,82%_100%,0%_100%)]">
            <SceneImage
              src="/images/categorias/hero-geek-panel.png"
              alt="Cena de cultura geek"
              tone="ink"
              caption="Em curadoria"
              className="absolute inset-0"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

interface CategoryCard {
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const gamerCards: CategoryCard[] = [
  { href: '/ofertas?tipo=game', label: 'Jogos', description: 'Físico e digital, todas as plataformas.', Icon: Gamepad2 },
  { href: '/ofertas?tipo=console', label: 'Consoles', description: 'Hardware novo e usado, com histórico de preço.', Icon: Joystick },
  { href: '/ofertas?tipo=accessory', label: 'Acessórios', description: 'Controle, headset, cadeira e mais.', Icon: Boxes },
];

const geekCards: CategoryCard[] = [
  { href: '/universos', label: 'Universos', description: 'Navegue por franquia: Naruto, One Piece, Marvel e mais.', Icon: LibraryBig },
  { href: '/hype-zone', label: 'Hype Zone', description: 'Drop e lançamento em contagem regressiva real.', Icon: Zap },
  { href: '/noticias', label: 'Notícias', description: 'Cultura pop, sinopse de jogo e tecnologia geek.', Icon: Newspaper },
];

function Cluster({
  word,
  src,
  label,
  heading,
  text,
  cards,
}: {
  word: string;
  src: string;
  label: string;
  heading: string;
  text: string;
  cards: CategoryCard[];
}) {
  return (
    <section className="relative w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24 overflow-hidden">
      <CircuitLines className="opacity-50" />

      <div className="relative grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
        <Reveal>
          <TextImageMask text={word} src={src} className="text-[90px] leading-none sm:text-[130px] lg:text-[150px]" />
        </Reveal>

        <Reveal delay={0.08}>
          <Text variant="label" color="tertiary">
            {label}
          </Text>
          <Text as="h2" variant="display-md" className="mt-2 max-w-[22ch]">
            {heading}
          </Text>
          <Text variant="body-md" color="secondary" className="mt-4 max-w-[52ch]">
            {text}
          </Text>
        </Reveal>
      </div>

      <div className="relative mt-12 grid gap-4 sm:grid-cols-3">
        {cards.map(({ href, label: cardLabel, description, Icon }, i) => (
          <Reveal key={href} delay={0.06 + i * 0.06}>
            <Link
              href={href}
              className="group flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 transition-colors hover:border-[var(--color-border-strong)]"
            >
              <Icon className="size-6 text-[var(--color-accent-primary)]" aria-hidden />
              <Text as="h3" variant="heading-sm">
                {cardLabel}
              </Text>
              <Text variant="body-sm" color="secondary">
                {description}
              </Text>
              <span className="mt-auto inline-flex items-center gap-1 text-body-sm font-medium text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text-primary)]">
                Ver ofertas
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

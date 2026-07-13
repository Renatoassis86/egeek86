import Link from 'next/link';
import { ArrowRight, Sparkles, Zap, ShieldCheck, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';

// ============================================================
// HOME — primeira tela funcional da Fase 0.
// Estrutura: Hero · Universos · Hype Zone Teaser · Benefícios · CTA newsletter.
// Tudo RSC; client islands isoladas via componentes próprios.
// ============================================================

export default function HomePage() {
  return (
    <>
      <Hero />
      <UniversesSection />
      <HypeTeaser />
      <Benefits />
      <NewsletterCTA />
    </>
  );
}

// ----- Hero ---------------------------------------------------
function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-[var(--color-border-subtle)]"
    >
      {/* Glow ambiente */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 0%, rgba(168, 85, 247, 0.18) 0%, transparent 60%), radial-gradient(60% 50% at 80% 100%, rgba(245, 158, 11, 0.10) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-28">
        <Reveal>
          <Badge variant="primary" size="lg" className="mb-6">
            <Sparkles className="size-3" />
            Drop da semana ao vivo em 4d 12h
          </Badge>
        </Reveal>

        <Reveal delay={0.05}>
          <Text
            as="h1"
            id="hero-title"
            variant="display-xl"
            className="max-w-[16ch] tracking-tight"
          >
            O cofre da{' '}
            <span className="bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] bg-clip-text text-transparent">
              cultura geek
            </span>
            .
          </Text>
        </Reveal>

        <Reveal delay={0.12}>
          <Text variant="body-lg" color="secondary" className="mt-5 max-w-[52ch]">
            Action figures, TCG, colecionáveis e drops raros. Curadoria semanal,
            envio rastreado e Geek Points em cada compra.
          </Text>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" leftIcon={<Zap className="size-4" />}>
              <Link href="/hype-zone">Entrar na Hype Zone</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" rightIcon={<ArrowRight className="size-4" />}>
              <Link href="/categorias">Explorar catálogo</Link>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.24}>
          <dl className="mt-12 grid grid-cols-3 gap-4 max-w-md">
            <Stat label="Colecionadores" value="10k+" />
            <Stat label="Drops/mês" value="12" />
            <Stat label="Sellers verificados" value="48" />
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text variant="mono-lg" className="tabular">
        {value}
      </Text>
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
    </div>
  );
}

// ----- Universes ---------------------------------------------
const universes = [
  { slug: 'naruto', label: 'Naruto', emoji: '🍥' },
  { slug: 'one-piece', label: 'One Piece', emoji: '🏴‍☠️' },
  { slug: 'marvel', label: 'Marvel', emoji: '🛡️' },
  { slug: 'star-wars', label: 'Star Wars', emoji: '🌌' },
  { slug: 'pokemon', label: 'Pokémon', emoji: '⚡' },
  { slug: 'dragon-ball', label: 'Dragon Ball', emoji: '🐉' },
];

function UniversesSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-20">
      <Reveal>
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <Text variant="label" color="tertiary">
              Navegue por
            </Text>
            <Text as="h2" variant="heading-xl" className="mt-1">
              Universos
            </Text>
          </div>
          <Link
            href="/universos"
            className="text-body-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors inline-flex items-center gap-1"
          >
            Ver todos
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
        {universes.map((u, i) => (
          <Reveal key={u.slug} delay={i * 0.04}>
            <Link href={`/universos/${u.slug}`} className="group">
              <Card
                interactive
                className="aspect-[4/5] flex items-center justify-center relative overflow-hidden"
              >
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--duration-medium)]"
                  style={{
                    background:
                      'radial-gradient(60% 60% at 50% 0%, rgba(168, 85, 247, 0.20) 0%, transparent 70%)',
                  }}
                />
                <CardContent className="p-0 text-center relative">
                  <span className="text-5xl block mb-3" aria-hidden>
                    {u.emoji}
                  </span>
                  <Text variant="heading-sm">{u.label}</Text>
                </CardContent>
              </Card>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ----- Hype Teaser -------------------------------------------
function HypeTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-20">
      <Card
        variant="elevated"
        className="overflow-hidden relative"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(circle at 80% 50%, rgba(245, 158, 11, 0.35), transparent 60%)',
          }}
        />
        <CardContent className="p-8 lg:p-12 relative">
          <Badge variant="hype" size="lg" className="mb-4">
            <Flame className="size-3.5" />
            Hype Zone
          </Badge>
          <Text as="h2" variant="display-md" className="max-w-[18ch] mb-3">
            Drops que acabam quando acabam.
          </Text>
          <Text variant="body-md" color="secondary" className="max-w-[52ch] mb-6">
            Edições limitadas, contagem regressiva real, estoque ao vivo. Entre
            cedo, leve antes de todo mundo.
          </Text>
          <Button asChild variant="hype" size="lg">
            <Link href="/hype-zone">Ver drops ao vivo</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

// ----- Benefits ----------------------------------------------
const benefits = [
  {
    Icon: ShieldCheck,
    title: 'Autenticidade verificada',
    description: 'Cada item passa por curadoria. Selo de autenticidade em produtos elegíveis.',
  },
  {
    Icon: Sparkles,
    title: 'Geek Points em tudo',
    description: 'Ganhe pontos a cada compra e troque por descontos em drops futuros.',
  },
  {
    Icon: Zap,
    title: 'Drops semanais',
    description: 'Raridades, exclusivos e edições limitadas todas as semanas.',
  },
];

function Benefits() {
  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-12 lg:py-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {benefits.map((b, i) => (
          <Reveal key={b.title} delay={i * 0.06}>
            <Card className="h-full">
              <CardContent className="p-6 flex flex-col gap-3">
                <div className="size-10 rounded-[var(--radius-sm)] bg-[var(--color-accent-primary-muted)] flex items-center justify-center text-[var(--color-accent-primary)]">
                  <b.Icon className="size-5" />
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

// ----- Newsletter CTA ----------------------------------------
function NewsletterCTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 pb-16 lg:pb-24">
      <Card variant="default" className="overflow-hidden">
        <CardContent className="p-8 lg:p-14 flex flex-col items-center text-center gap-5">
          <Badge variant="outline" size="md">Comunidade</Badge>
          <Text as="h2" variant="display-md" className="max-w-[20ch]">
            Receba drops antes de todo mundo.
          </Text>
          <Text variant="body-md" color="secondary" className="max-w-[48ch]">
            Entre na newsletter e ganhe 50 Geek Points no seu primeiro cadastro.
          </Text>
          <Button asChild size="lg">
            <Link href="/cadastro">Quero entrar</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

import type { Metadata } from 'next';
import { Eye, Target, Shield, Users, Sparkles } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage } from '@/components/motion/scene-image';

export const metadata: Metadata = {
  title: 'Quem somos',
  description:
    'A história do Espaço Geek 86 — de uma coleção pessoal a uma plataforma de inteligência de preço pra cultura geek.',
};

export default function SobrePage() {
  return (
    <>
      <Hero />
      <Origem />
      <MissaoVisaoValores />
      <Idealizador />
    </>
  );
}

function Hero() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 pt-14 pb-10 lg:pt-20 lg:pb-14">
      <Reveal>
        <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          Quem somos
        </Text>
        <Text as="h1" variant="display-xl" className="mt-3 max-w-[20ch] lg:text-display-2xl">
          O novo e o velho, na mesma estante.
        </Text>
        <Text variant="body-lg" color="secondary" className="mt-4 max-w-[62ch]">
          O Espaço Geek 86 nasceu de uma coleção pessoal que virou pesquisa de preço, virou planilha,
          virou o hábito de ajudar amigo a comprar direito. Hoje é uma plataforma inteira, mas a ideia
          continua a mesma: cultura geek com carinho de colecionador e informação de verdade, nunca
          achismo.
        </Text>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="relative mt-10 aspect-[16/7] w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] sm:aspect-[21/9]">
          <SceneImage
            src="/images/sobre/hero-geracoes.png"
            alt="Duas gerações, um controle antigo e um controle novo, lado a lado"
            tone="gold"
            caption="Em curadoria"
            className="absolute inset-0"
          />
        </div>
      </Reveal>
    </section>
  );
}

const origemCenas = [
  {
    src: '/images/sobre/fliperama.png',
    alt: 'Crianças jogando em fliperama',
    tone: 'ember' as const,
  },
  {
    src: '/images/sobre/aluguel-tv.png',
    alt: 'Crianças esperando a vez de jogar numa TV alugada por tempo',
    tone: 'gold' as const,
  },
  {
    src: '/images/sobre/locadora.png',
    alt: 'Pessoas alugando jogos numa locadora de fim de semana',
    tone: 'ink' as const,
  },
];

function Origem() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24">
      <Reveal>
        <div className="max-w-[62ch]">
          <Text variant="label" color="tertiary">
            De onde viemos
          </Text>
          <Text as="h2" variant="display-md" className="mt-2 max-w-[18ch]">
            Quem já esperou a vez de jogar, entende.
          </Text>
          <div className="mt-5 flex flex-col gap-4">
            <Text variant="body-md" color="secondary">
              Fliperama de shopping, fichas contadas, os 30 minutos cronometrados de TV alugada com os
              amigos — sentado, esperando a vez, torcendo pro seu não estourar antes de passar o
              controle. Locadora no fim de semana pra levar um jogo emprestado, devolver na segunda,
              alugar outro. Essa é a memória que o Espaço Geek 86 quer manter viva.
            </Text>
            <Text variant="body-md" color="secondary">
              Mas nostalgia sozinha não paga boleto nem evita compra ruim. O outro lado da história é
              mais recente: anos comprando, pesquisando preço em cinco abas ao mesmo tempo, comparando
              vendedor, ajudando gente próxima a não errar na hora de trocar de console ou fechar
              negócio num jogo usado. O site é o ponto onde essas duas histórias se encontram.
            </Text>
          </div>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {origemCenas.map(({ src, alt, tone }, i) => (
          <Reveal key={src} delay={0.06 + i * 0.06}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
              <SceneImage src={src} alt={alt} tone={tone} caption="Em curadoria" className="absolute inset-0" />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const pillars = [
  {
    Icon: Target,
    label: 'Missão',
    text: 'Ajudar quem ama cultura geek a comprar com informação real, não no impulso — juntando o carinho de quem viveu os anos 80/90 com a mesma inteligência de dado que se usa pra decisão de mercado.',
  },
  {
    Icon: Eye,
    label: 'Visão',
    text: 'Ser a referência em cultura geek e inteligência de preço no Brasil — o lugar onde o colecionador de ontem encontra o comprador de hoje, sempre com histórico de verdade por trás.',
  },
  {
    Icon: Shield,
    label: 'Valores',
    text: 'Transparência (nunca inventamos dado — se não coletamos ainda, o site avisa em vez de fingir); comunidade antes de venda; nostalgia com propósito, não só estética.',
  },
];

function MissaoVisaoValores() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24">
      <Reveal>
        <div className="max-w-[52ch]">
          <Text variant="label" color="tertiary">
            Como pensamos
          </Text>
          <Text as="h2" variant="display-md" className="mt-2">
            Missão, visão e valores.
          </Text>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {pillars.map(({ Icon, label, text }, i) => (
          <Reveal key={label} delay={i * 0.06}>
            <Card className="h-full p-6">
              <Icon className="size-5 text-[var(--color-accent-primary)]" aria-hidden />
              <Text as="h3" variant="heading-sm" className="mt-4">
                {label}
              </Text>
              <Text variant="body-sm" color="secondary" className="mt-2">
                {text}
              </Text>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Idealizador() {
  return (
    <section className="relative w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24">
      <Glow color="gold" size="lg" intensity={0.16} className="-top-24 right-0" />

      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center lg:gap-14">
        <Reveal>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)]">
            <SceneImage
              src="/images/sobre/idealizador.png"
              alt="Ilustração de um colecionador cercado por sua coleção de jogos e consoles"
              tone="ink"
              caption="Em curadoria"
              className="absolute inset-0"
            />
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden />
            O idealizador
          </Text>
          <Text as="h2" variant="display-md" className="mt-2 max-w-[22ch]">
            Renato Silva de Assis
          </Text>
          <div className="mt-5 flex flex-col gap-4">
            <Text variant="body-md" color="secondary">
              Economista, mestre em Economia Regional (UFRN) e bacharel em Ciência de Dados, com mais de
              16 anos analisando mercado e construindo modelo estatístico pra decisão — hoje à frente da
              Arkos Intelligence, transformando dado bruto em decisão executiva pra empresa.
            </Text>
            <Text variant="body-md" color="secondary">
              A coleção pessoal veio antes da carreira. Foi ela que ensinou, na prática, o que vira
              trabalho todo dia: pesquisar preço direito, entender o que faz um jogo ou console valer o
              que custa, comparar vendedor antes de fechar. Com o tempo virou hábito ajudar amigo a
              comprar console novo sem se arrepender, ou fechar negócio bom num jogo usado sem cair em
              enrolação. O Espaço Geek 86 é essa mesma lógica — a de transformar dado em decisão —
              aplicada à paixão que começou tudo.
            </Text>
            <Text variant="body-sm" color="tertiary" className="italic">
              Essa seção ainda está crescendo — mais histórias de coleção, de compra, de ajuda a amigo
              entram aqui com o tempo.
            </Text>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

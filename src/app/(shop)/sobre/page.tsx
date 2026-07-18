import type { Metadata } from 'next';
import { Sparkles, Users } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage } from '@/components/motion/scene-image';

export const metadata: Metadata = {
  title: 'Quem somos',
  description:
    'A história do Espaço Geek 86, de uma coleção pessoal a uma plataforma de inteligência de preço pra cultura geek.',
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
          O Espaço Geek 86 nasceu de uma coleção pessoal que virou pesquisa de preço, virou planilha e
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
              amigos, sentado, esperando a vez, torcendo pro seu não estourar antes de passar o
              controle. Locadora no fim de semana pra levar um jogo emprestado, devolver na segunda e
              alugar outro. Essa é a memória que o Espaço Geek 86 quer manter viva.
            </Text>
            <Text variant="body-md" color="secondary">
              Só que entretenimento também é decisão. Anos comprando, pesquisando preço em cinco abas
              ao mesmo tempo, comparando vendedor, ajudando gente próxima a escolher certo na hora de
              trocar de console ou fechar negócio num jogo usado. Isso virou uma habilidade real, e
              habilidade real pode virar oportunidade. O Espaço Geek 86 nasce dessa ideia: transformar
              o hobby que a gente já ama num caminho de negócio pra quem quiser, não só num lugar de
              compra.
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

const valores = [
  {
    n: '01',
    title: 'Dado real, sempre',
    text: 'Nunca publicamos preço, histórico ou métrica que não venha de coleta verificada. Quando o dado ainda não existe, o site informa isso claramente, em vez de aproximar ou inventar.',
  },
  {
    n: '02',
    title: 'Nostalgia com propósito',
    text: 'O passado inspira curadoria e design, mas nunca substitui utilidade real para quem compra hoje.',
  },
  {
    n: '03',
    title: 'Comunidade antes de venda',
    text: 'Toda decisão de produto prioriza ajudar quem compra a decidir melhor, não maximizar clique ou conversão.',
  },
  {
    n: '04',
    title: 'Transparência de ponta a ponta',
    text: 'Reputação de vendedor, histórico de preço e condição de cada oferta ficam visíveis, sempre.',
  },
];

/**
 * Missão/visão como declaração grande (referência: página institucional de
 * Disney/Netflix/Amazon), não card pequeno espremido — e valores como lista
 * numerada de princípios distintos (referência: Leadership Principles da
 * Amazon), não uma frase só misturando tudo. Pedido explícito do cliente:
 * sem travessão no texto, missão e valores objetivos, com todo elemento que
 * precisa compor cada um.
 */
function MissaoVisaoValores() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24">
      <Reveal>
        <Text variant="label" color="tertiary">
          Como pensamos
        </Text>
      </Reveal>

      <div className="mt-8 grid gap-10 border-t border-[var(--color-border-subtle)] pt-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <Text variant="label" color="hype">
            Missão
          </Text>
          <Text as="h2" variant="heading-xl" className="mt-3 lg:text-display-md">
            Ajudar quem compra e quem indica cultura geek a decidir com informação real.
          </Text>
          <Text variant="body-md" color="secondary" className="mt-4 max-w-[52ch]">
            Unimos preço monitorado em tempo real, histórico verificável e curadoria humana em um único
            lugar, para que toda decisão, seja de compra ou de indicação, seja baseada em dado, não em
            impulso.
          </Text>
        </Reveal>

        <Reveal delay={0.08}>
          <Text variant="label" color="hype">
            Visão
          </Text>
          <Text as="h2" variant="heading-xl" className="mt-3 lg:text-display-md">
            Ser a plataforma de referência em cultura geek e inteligência de preço no Brasil.
          </Text>
          <Text variant="body-md" color="secondary" className="mt-4 max-w-[52ch]">
            Reconhecida tanto por quem cresceu jogando nos anos 80 e 90 quanto por quem começa sua
            coleção hoje, e usada por afiliados de grandes plataformas de venda para monitorar preço e
            fazer a melhor indicação para o próprio público.
          </Text>
        </Reveal>
      </div>

      <div className="mt-16 border-t border-[var(--color-border-subtle)] pt-10">
        <Reveal>
          <Text variant="label" color="hype">
            Valores
          </Text>
        </Reveal>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {valores.map(({ n, title, text }, i) => (
            <Reveal key={n} delay={0.05 + i * 0.05}>
              <div className="flex gap-4">
                <Text variant="mono-md" color="tertiary" className="shrink-0 tabular">
                  {n}
                </Text>
                <div>
                  <Text as="h3" variant="heading-sm">
                    {title}
                  </Text>
                  <Text variant="body-sm" color="secondary" className="mt-1.5 max-w-[46ch]">
                    {text}
                  </Text>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
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
              16 anos analisando mercado e construindo modelo estatístico pra decisão. Hoje à frente da
              Arkos Intelligence, transformando dado bruto em decisão executiva pra empresa.
            </Text>
            <Text variant="body-md" color="secondary">
              A coleção pessoal veio antes da carreira. Foi ela que ensinou, na prática, o que vira
              trabalho todo dia: pesquisar preço direito, entender o que faz um jogo ou console valer o
              que custa, comparar vendedor antes de fechar. Com o tempo virou hábito ajudar amigo a
              comprar console novo sem se arrepender, ou fechar negócio bom num jogo usado sem cair em
              enrolação. O Espaço Geek 86 é essa mesma lógica, a de transformar dado em decisão,
              aplicada à paixão que começou tudo.
            </Text>
            <Text variant="body-sm" color="tertiary" className="italic">
              Essa seção ainda está crescendo. Mais histórias de coleção, de compra e de ajuda a amigo
              entram aqui com o tempo.
            </Text>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

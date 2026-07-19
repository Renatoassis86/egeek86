import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  Flame,
  Clock,
  History,
  TrendingDown,
  Tag,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage, type SceneTone } from '@/components/motion/scene-image';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { CornerBrackets } from '@/components/motion/corner-brackets';
import { WeeklyPromosSection } from '@/components/geek-deals/weekly-promos-section';
import { PlatformShowcase } from '@/components/geek-deals/platform-showcase';
import { SalesHighlights } from '@/components/geek-deals/sales-highlights';
import { cn } from '@/lib/cn';

// ============================================================
// HOME — página de destaque/vitrine editorial, não a busca completa
// (isso mora em /ofertas). Estrutura em módulos:
// Hero (assimétrico, mosaico) · Carrossel de promoções da semana
// (full-bleed, dado real) · Destaques de venda (segmentado por preço/
// geração, dado real) · Inteligência de preço (o diferencial) ·
// Universos (editorial) · Hype Zone · Benefícios · CTA newsletter.
// Cada seção varia levemente de atmosfera (Glow/SceneImage por tom)
// mas mantém a identidade preto/dourado/creme. Tudo RSC; client
// islands isoladas via Reveal/SceneImage/Carousel/ThemeToggle etc.
// ============================================================

// Mostra dado ao vivo (preço/destaques) sem searchParams pra disparar isso
// sozinho — sem isso, o build tenta pré-renderizar como estática e trava
// buscando no banco no ambiente de build (visto ao vivo no primeiro deploy).
import { getPublishedArticles } from '@/server/queries/news';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatementBand />
      <WeeklyPromosSection />
      <PlatformShowcase />
      <SalesHighlights />
      <PriceIntelligence />
      <UniversesSection />
      <DividerEmblem />
      <HypeTeaser />
      <HomeNewsSection />
      <Benefits />
      <NewsletterCTA />
    </>
  );
}

// ----- Statement band ------------------------------------------
// Banda em formato "cartela" (cartão contido, não full-bleed de ponta a
// ponta da viewport) — a composição da foto foi pensada pra uma proporção
// mais fechada; esticada em 100vw ela sobra espaço negativo demais do lado
// direito. Como cartão com aspect-ratio fixo, a imagem cobre o container de
// canto a canto de verdade (object-cover garante isso em qualquer tela).
function StatementBand() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16">
      <Reveal>
        <div className="relative isolate aspect-[16/7] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] sm:aspect-[21/9]">
          <Image
            src="/images/home/statement-band.png"
            alt=""
            fill
            sizes="(min-width: 1280px) 1280px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-canvas)] via-[var(--color-bg-canvas)]/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-canvas)]/80 via-transparent to-transparent" />
          <CornerBrackets inset={16} size={20} />

          <div className="relative flex h-full items-center px-6 py-8 sm:px-10 lg:px-14">
            <div>
              <Text variant="label" color="tertiary" className="inline-flex items-center gap-1.5">
                <History className="size-3.5" aria-hidden />
                Por trás de cada preço
              </Text>
              <Text as="h2" variant="heading-xl" className="mt-3 max-w-[22ch] lg:text-display-md">
                Um cockpit de dado pra cada jogo que você acompanha.
              </Text>
              <Text variant="body-md" color="secondary" className="mt-3 max-w-[42ch]">
                Console, controle, cupom, histórico — tudo cruzado em tempo real pra você nunca
                comprar no escuro.
              </Text>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ----- Divider emblem (letterform "E") --------------------------
// Um dos usos pedidos explicitamente: imagem recortada dentro de uma
// interpretação geométrica das iniciais/número da marca (E de "Espaço").
// Pausa editorial entre Universos e a Hype Zone — os 4 glifos (E · G · 8 · 6,
// iniciais + número da marca) juntos no mesmo painel, cada um com uma foto
// diferente, formando o emblema "EG86" completo num só lugar da página (em
// vez de espalhado letra por letra em headers de outras rotas).
function DividerEmblem() {
  const glyphs: { id: string; letter: string; src: string }[] = [
    { id: 'eg86-e', letter: 'E', src: '/images/home/divider-emblem.png' },
    { id: 'eg86-g', letter: 'G', src: '/images/emblem/g-gadgets.png' },
    { id: 'eg86-8', letter: '8', src: '/images/emblem/8-drop-reveal.png' },
    { id: 'eg86-6', letter: '6', src: '/images/emblem/6-collectibles.png' },
  ];

  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16">
      <Reveal>
        <div className="flex flex-col items-center gap-8 rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] px-6 py-10 lg:py-14">
          <div className="flex items-center justify-center gap-0.5 sm:gap-1">
            {glyphs.map(({ id, letter, src }) => (
              <TextImageMask
                key={id}
                text={letter}
                src={src}
                className="text-[100px] sm:text-[160px] lg:text-[240px]"
              />
            ))}
          </div>
          <div className="max-w-[48ch] text-center">
            <Text variant="label" color="tertiary">
              Espaço Geek 86
            </Text>
            <Text as="p" variant="heading-md" className="mt-2">
              Dado, curadoria e cultura geek — a mesma vitrine, num só lugar.
            </Text>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ----- Hero ---------------------------------------------------
const heroStats = [
  { label: 'Colecionadores', value: '10k+' },
  { label: 'Drops/mês', value: '12' },
  { label: 'Sellers verificados', value: '48' },
];

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-[var(--color-border-subtle)]"
    >
      <Glow color="gold" size="xl" intensity={0.3} className="-top-64 -left-48" />
      <Glow color="hype" size="md" intensity={0.2} className="top-24 -right-32" />

      <div className="relative mx-auto max-w-7xl px-4 lg:px-8 pt-14 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Copy — coluna dominante, alinhada à esquerda */}
          <div className="relative lg:col-span-7">
            <Reveal>
              <Badge variant="primary" size="lg">
                <Sparkles className="size-3" />
                Drop da semana ao vivo em 4d 12h
              </Badge>
            </Reveal>

            <Reveal delay={0.05}>
              <Text
                as="h1"
                id="hero-title"
                variant="display-xl"
                className="mt-6 max-w-[24ch] tracking-tight lg:max-w-[32ch] lg:text-display-2xl"
              >
                Informação real sobre games
                <br />
                <span className="bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] bg-clip-text text-transparent">
                  Decisões inteligentes.
                </span>
              </Text>
            </Reveal>

            <Reveal delay={0.12}>
              <Text variant="body-lg" color="secondary" className="mt-6 max-w-[48ch]">
                Tudo sobre o mundo gamer e geek, em um só lugar: preço, histórico e cupom
                sempre atualizados, pra você decidir com informação real, não com pressa.
              </Text>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button asChild size="lg" leftIcon={<Zap className="size-4" />}>
                  <Link href="/hype-zone">Entrar na Hype Zone</Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  size="lg"
                  rightIcon={<ArrowRight className="size-4" />}
                >
                  <Link href="/categorias">Explorar catálogo</Link>
                </Button>
              </div>
            </Reveal>

            {/* Ticker editorial — não mais um grid de 3 caixas isoladas */}
            <Reveal delay={0.24}>
              <dl className="mt-16 lg:mt-20 flex flex-wrap border-t border-[var(--color-border-subtle)] pt-8">
                {heroStats.map((s, i) => (
                  <div
                    key={s.label}
                    className={cn(
                      'pr-8 lg:pr-12',
                      i > 0 && 'border-l border-[var(--color-border-subtle)] pl-8 lg:pl-12'
                    )}
                  >
                    <Stat label={s.label} value={s.value} />
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* Âncora visual — mosaico desconstruído (3 quadros levemente
              rotacionados/sobrepostos) em vez de uma imagem única, no
              espírito colagem editorial pedido como referência. */}
          <div className="lg:col-span-5">
            <Reveal delay={0.1}>
              <div className="relative mt-2 aspect-[4/5] lg:mt-6">
                <div className="absolute inset-x-6 inset-y-4 -rotate-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] shadow-[var(--shadow-lg)]">
                  <SceneImage
                    src="/images/hero/tile-back.png"
                    alt=""
                    tone="ink"
                    focal="left"
                    className="absolute inset-0"
                  />
                </div>
                <div className="absolute inset-2 rotate-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] shadow-[var(--shadow-xl)]">
                  <SceneImage
                    src="/images/hero/tile-main.png"
                    alt="Vitrine de colecionáveis Espaço Geek 86"
                    tone="gold"
                    focal="left"
                    caption="Vitrine em curadoria"
                    priority
                    className="absolute inset-0"
                  />
                </div>
                <div className="absolute -bottom-4 -right-3 size-28 -rotate-6 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)] shadow-[var(--shadow-lg)] sm:size-32">
                  <SceneImage src="/images/hero/tile-accent.png" alt="" tone="ember" className="absolute inset-0" />
                </div>
                <Card className="absolute -bottom-6 -left-4 w-56 border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/90 p-4 shadow-[var(--shadow-lg)] backdrop-blur-md sm:-left-8 sm:w-60">
                  <Badge variant="hype" size="sm" className="mb-2">
                    <Flame className="size-3" />
                    Menor preço já visto
                  </Badge>
                  <Text variant="caption" color="secondary">
                    Comparamos preço nos principais marketplaces antes de você decidir.
                  </Text>
                </Card>
              </div>
            </Reveal>
          </div>
        </div>
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

// ----- Inteligência de preço (o diferencial real) --------------
// Client explicitamente pediu pra não perder isso — é o que nos
// aproxima de CamelCamelCamel/IsThereAnyDeal, e hoje não aparecia
// em lugar nenhum da home. Copy reaproveita a linguagem real já
// usada em /ofertas e no OfferCard ("menor preço já visto",
// "histórico e cupons") — nada inventado.
const priceFeatures = [
  {
    Icon: History,
    title: 'Histórico de preço real',
    description:
      'Cada oferta guarda o preço de ontem, do mês passado e o menor já visto, não só o de hoje.',
  },
  {
    Icon: TrendingDown,
    title: 'Selo de menor preço já visto',
    description:
      'Quando uma oferta bate recorde, a gente marca. Você não precisa comparar aba por aba.',
  },
  {
    Icon: Tag,
    title: 'Cupons organizados por oferta',
    description:
      'Cupons ativos ficam junto do produto, não espalhados em grupo de WhatsApp.',
  },
];

function PriceIntelligence() {
  return (
    <section className="relative overflow-hidden border-y border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
      <Glow color="cream" size="lg" intensity={0.14} className="-top-40 left-1/3" />

      <div className="relative mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-center">
          <div className="lg:col-span-5">
            <Reveal>
              <Text variant="label" color="tertiary">
                O diferencial
              </Text>
              <Text as="h2" variant="display-lg" className="mt-2 max-w-[14ch]">
                Compre no momento certo, não no impulso.
              </Text>
              <Text variant="body-lg" color="secondary" className="mt-4 max-w-[42ch]">
                Preços monitorados nos principais marketplaces, com histórico e cupons,
                pra você saber se aquele preço é bom antes de clicar.
              </Text>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="mt-8"
                rightIcon={<ArrowRight className="size-4" />}
              >
                <Link href="/ofertas">Ver ofertas monitoradas</Link>
              </Button>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <div className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)]">
              {priceFeatures.map((f, i) => (
                <Reveal key={f.title} delay={i * 0.06}>
                  <div className="flex items-start gap-5 py-6">
                    <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-accent-primary)]">
                      <f.Icon className="size-4" aria-hidden />
                    </div>
                    <div>
                      <Text variant="heading-sm">{f.title}</Text>
                      <Text variant="body-sm" color="secondary" className="mt-1 max-w-[52ch]">
                        {f.description}
                      </Text>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ----- Universes -------------------------------------------------
// Sem emoji como marcador — mosaico assimétrico (primeiro item maior)
// com SceneImage por tom variando gold/ember/ink, no espírito
// Netflix/Steam de categoria com imagem, não ícone solto.
const universes = [
  { slug: 'naruto', label: 'Naruto', image: '/images/universos/naruto.png' },
  { slug: 'one-piece', label: 'One Piece', image: '/images/universos/one-piece.png' },
  { slug: 'marvel', label: 'Marvel', image: '/images/universos/marvel.png' },
  { slug: 'star-wars', label: 'Star Wars', image: '/images/universos/star-wars.png' },
  { slug: 'pokemon', label: 'Pokémon', image: '/images/universos/pokemon.png' },
  { slug: 'dragon-ball', label: 'Dragon Ball', image: '/images/universos/dragon-ball.png' },
];

const universeTones: SceneTone[] = ['gold', 'ember', 'ink'];

function UniversesSection() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
      <Reveal>
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Text variant="label" color="tertiary">
              Navegue por
            </Text>
            <Text as="h2" variant="display-lg" className="mt-2 max-w-[16ch]">
              Universos que a gente cataloga a fundo.
            </Text>
          </div>
          <Link
            href="/universos"
            className="inline-flex items-center gap-1 text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            Ver todos
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Reveal>

      {/* Card em aspect-[3/2] — mesma proporção real das imagens geradas
          (1536×1024), pra caber inteira sem cortar e sem sobrar borda vazia.
          Grid uniforme (sem card "herói" maior) fica mais contido/editorial
          que o mosaico assimétrico anterior. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {universes.map((u, i) => (
          <Reveal key={u.slug} delay={i * 0.05} className="w-[78vw] shrink-0 snap-start sm:w-72 lg:w-auto">
            <Link
              href={`/universos/${u.slug}`}
              className="group block rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
            >
              <Card interactive className="relative aspect-[3/2] overflow-hidden">
                <SceneImage
                  src={u.image}
                  alt={u.label}
                  tone={universeTones[i % universeTones.length]}
                  caption="Em curadoria"
                  className="absolute inset-0"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent"
                />
                <span className="absolute left-3 top-3 font-mono text-[11px] tracking-[0.08em] text-[var(--color-text-primary)]/55">
                  0{i + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <Text as="h3" variant="heading-sm" className="text-[var(--color-text-primary)]">
                    {u.label}
                  </Text>
                </div>
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
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
      <Card variant="elevated" className="relative overflow-hidden">
        <Glow color="hype" size="lg" intensity={0.3} className="-top-32 -right-24" />
        {/* Glow extra na costura do corte diagonal — sangramento de luz
            "colando" o painel de imagem ao resto do card, só lg+. */}
        <Glow color="hype" size="sm" intensity={0.3} className="hidden lg:block top-1/3 left-[62%]" />

        <div className="relative grid lg:grid-cols-12">
          <div className="flex flex-col justify-center p-8 lg:col-span-7 lg:p-14">
            <Badge variant="hype" size="lg" className="mb-5 w-fit">
              <Flame className="size-3.5" />
              Hype Zone
            </Badge>
            <Text as="h2" variant="display-lg" className="mb-4 max-w-[16ch]">
              Drops que acabam quando acabam.
            </Text>
            <Text variant="body-lg" color="secondary" className="mb-8 max-w-[44ch]">
              Edições limitadas, contagem regressiva real, estoque ao vivo. Entre
              cedo, leve antes de todo mundo.
            </Text>

            <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3">
              <HypeStat icon={<Clock className="size-3.5" />} label="Contagem regressiva real" />
              <HypeStat icon={<Zap className="size-3.5" />} label="Estoque ao vivo" />
            </div>

            <Button asChild variant="hype" size="lg" className="w-fit">
              <Link href="/hype-zone">Ver drops ao vivo</Link>
            </Button>
          </div>

          {/* Corte geométrico diagonal (referência Mevos) — só lg+: em
              mobile o clip-path angular corta demais a foto num painel
              baixo e largo, então cai pra retângulo reto simples. */}
          <div className="relative min-h-[260px] lg:col-span-5 lg:min-h-full lg:[clip-path:polygon(10%_0,100%_0,100%_100%,0%_100%)]">
            <SceneImage
              src="/images/hype-zone/banner.png"
              alt="Drop ao vivo da Hype Zone"
              tone="ember"
              focal="left"
              caption="Drop ao vivo · em produção"
              className="absolute inset-0"
            />
          </div>
        </div>
      </Card>
    </section>
  );
}

function HypeStat({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[var(--color-accent-hype)]">{icon}</span>
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
    </div>
  );
}

// ----- Home News Section ------------------------------------
async function HomeNewsSection() {
  const { items: articles } = await getPublishedArticles({ pageSize: 3 });
  if (articles.length === 0) return null;

  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24">
      <Reveal>
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Text variant="label" color="tertiary">
              Portal de Notícias Geek
            </Text>
            <Text as="h2" variant="display-lg" className="mt-2">
              Últimas novidades do ecossistema.
            </Text>
          </div>
          <Link
            href="/noticias"
            className="inline-flex items-center gap-1 text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            Ver todas as notícias
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((article, i) => (
          <Reveal key={article.id} delay={i * 0.06}>
            <Link href={`/noticias/${article.slug}`} className="group block h-full">
              <Card interactive className="h-full flex flex-col overflow-hidden">
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-bg-inset)]">
                  {article.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.coverImageUrl}
                      alt={article.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[var(--color-text-tertiary)] font-mono text-xs">
                      Espaço Geek 86
                    </div>
                  )}
                  <Badge variant="hype" size="sm" className="absolute top-3 left-3 capitalize">
                    {article.category.replace('_', ' ')}
                  </Badge>
                </div>
                <CardContent className="p-5 flex flex-col gap-2 flex-1">
                  <Text variant="heading-sm" className="line-clamp-2 font-bold group-hover:text-[var(--color-accent-primary)] transition-colors">
                    {article.title}
                  </Text>
                  <Text variant="body-sm" color="secondary" className="line-clamp-3 text-xs leading-relaxed">
                    {article.excerpt}
                  </Text>
                  <Text variant="caption" color="tertiary" className="mt-auto pt-3 border-t border-[var(--color-border-subtle)]">
                    {new Date(article.publishedAt ?? article.createdAt).toLocaleDateString('pt-BR')}
                  </Text>
                </CardContent>
              </Card>
            </Link>
          </Reveal>
        ))}
      </div>
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
    <section className="w-full relative overflow-hidden mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
      <Glow color="gold" size="md" intensity={0.15} className="-top-24 right-0" />

      <Reveal>
        <div className="mb-10 max-w-[36ch]">
          <Text variant="label" color="tertiary">
            Por que Geek 86
          </Text>
          <Text as="h2" variant="display-lg" className="mt-2">
            Curadoria de verdade, não só um catálogo.
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

// ----- Newsletter CTA ----------------------------------------
function NewsletterCTA() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 pb-20 lg:pb-28">
      <Card variant="elevated" className="relative overflow-hidden">
        <Glow color="gold" size="lg" intensity={0.26} className="-bottom-32 -left-24" />

        <div className="relative grid items-center gap-8 p-8 lg:grid-cols-12 lg:gap-12 lg:p-14">
          <div className="lg:col-span-8">
            <Reveal>
              <Badge variant="outline" size="md" className="mb-5">
                Comunidade
              </Badge>
              <Text as="h2" variant="display-lg" className="max-w-[18ch]">
                Receba drops antes de todo mundo.
              </Text>
              <Text variant="body-lg" color="secondary" className="mt-4 max-w-[48ch]">
                Entre na newsletter e ganhe 50 Geek Points no seu primeiro cadastro.
              </Text>
            </Reveal>
          </div>

          <div className="flex lg:col-span-4 lg:justify-end">
            <Reveal delay={0.1}>
              <Button asChild size="xl" rightIcon={<ArrowRight className="size-4" />}>
                <Link href="/cadastro">Quero entrar</Link>
              </Button>
            </Reveal>
          </div>
        </div>
      </Card>
    </section>
  );
}

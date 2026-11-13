import { Suspense, cache } from 'react';
import Link from 'next/link';
import { getStores } from '@/server/stores';
import Image from 'next/image';
import {
  ArrowRight,
  Sparkles,
  History,
  TrendingDown,
  Newspaper,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage } from '@/components/motion/scene-image';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { CornerBrackets } from '@/components/motion/corner-brackets';
import { CircuitLines } from '@/components/motion/circuit-lines';
import type { CategoryCard } from '@/lib/categories-showcase';
import { WeeklyPromosSection } from '@/components/geek-deals/weekly-promos-section';
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
import { createPersistedQuery } from '@/lib/cache/server-cache';
import { getPublicMetrics, PUBLIC_METRIC_LABELS, type PublicMetrics } from '@/server/queries/public-metrics';
import { getSurveyAggregationForHome, type SurveyAggregation } from '@/server/queries/survey';
import { gamerCards, geekCards } from '@/lib/categories-showcase';
import { getHomeSearchData, type HomeSearchData } from '@/server/queries/home-search';
import { SearchBox } from '@/components/search/search-box';
import { PLATFORM_SHORT } from '@/components/search/platform-short';
import { GamerSurvey } from '@/components/home/gamer-survey';
import { Package, Store, Layers, LineChart, TrendingDown as TrendingDownIcon } from 'lucide-react';
import { StatTile } from '@/components/ui/stat-tile';
import { SecaoPlusHome } from '@/components/plus/secao-plus-home';
import { FaixasPlusHome } from '@/components/plus/faixas-plus-home';

export const dynamic = 'force-dynamic';

// Uma única leitura de notícias por requisição, compartilhada entre o carrossel
// do Hero e a seção de notícias (React cache). Só entra notícia com fonte
// registrada (EG-16): sem fonte, não há como conferir a afirmação.
// Cache SWR de 60 s (src/lib/cache/swr.ts): a home nunca espera o banco para as notícias.
// Datas viajam como string ISO (JSON); o consumidor usa new Date(...).
const publishedArticlesCached = createPersistedQuery(
  async () => (await getPublishedArticles({ pageSize: 30 })).items,
  ['home-articles-v1'],
  { revalidate: 60, coldTimeoutSeconds: 5, persist: { maxAgeSeconds: 300, maxStaleSeconds: 24 * 3600 } }
);
const getHomeArticles = cache(async () => {
  try {
    const items = await publishedArticlesCached();
    return items.filter((a) => (a.sourceName ?? '').trim() !== '');
  } catch (e) {
    console.error('Erro ao carregar notícias na home:', e);
    return [];
  }
});

export default async function HomePage() {
  const [metrics, surveyData, searchData] = await Promise.all([
    getPublicMetrics(),
    getSurveyAggregationForHome(),
    getHomeSearchData(),
  ]);

  return (
    <>
      <Hero data={searchData} />
      <StatementBand products={metrics.products} stores={metrics.stores} quotes={metrics.quotes} />
      <Suspense fallback={null}>
        <WeeklyPromosSection />
      </Suspense>
      <CategoriesSection />
      <Suspense fallback={null}>
        <SalesHighlights />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoPlusHome />
      </Suspense>
      <Suspense fallback={null}>
        <FaixasPlusHome />
      </Suspense>
      <SurveySection surveyData={surveyData} />
      <IndicatorsSection metrics={metrics} />
      <InteligenciaGamerTeaserSection />
      <Suspense fallback={null}>
        <HomeNewsSection />
      </Suspense>
      <Benefits />
      <NewsletterCTA />
    </>
  );
}

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

function CategoriesSection() {
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

function SurveySection({ surveyData }: { surveyData: SurveyAggregation }) {
  const platformQuestion = surveyData.questions.find((q) => q.key === 'platform');
  const initialOptions = (platformQuestion?.options ?? []).map((opt) => ({
    id: opt.value,
    label: opt.label,
    votes: opt.count,
  }));

  return (
    <section data-theme="light" className="w-full bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-600/10 border-b border-amber-300/40 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-14 lg:items-center">
        <Reveal>
          <GamerSurvey initialOptions={initialOptions} />
        </Reveal>
        <Reveal delay={0.08}>
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 border border-amber-500/40 w-fit">
              Voz da Comunidade
            </span>
            <Text as="h2" variant="display-lg" className="font-black text-zinc-900 tracking-tight">
              Responda às enquetes sobre games.
            </Text>
            <Text variant="body-lg" className="leading-relaxed text-zinc-700 font-medium">
              Os resultados ao lado são a contagem das respostas já enviadas na pesquisa.
            </Text>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function IndicatorsSection({ metrics }: { metrics: PublicMetrics }) {
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
              src="/images/home/painel-analitico-86.png"
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


// ----- Statement band ------------------------------------------
// Foto escura tratada (brilho/contraste/saturação + brilho âmbar direcionado)
// para ganhar presença; painel de texto em vidro com borda âmbar nítida, CTA
// para a busca e 3 números reais já carregados pela home (sem query nova).
function StatementBand({ products, stores, quotes }: { products: number; stores: number; quotes: number }) {
  const numbers = [
    { value: products, label: 'produtos com oferta' },
    { value: stores, label: 'lojas monitoradas' },
    { value: quotes, label: 'cotações registradas' },
  ].filter((n) => n.value > 0);
  return (
    <section data-theme="dark" className="w-full border-b border-[var(--color-border-subtle)] bg-[#0F0C08] py-10 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <Reveal>
          <div className="relative isolate flex min-h-[460px] flex-col justify-center overflow-hidden border border-amber-400/50 bg-[#140d05] shadow-2xl lg:aspect-[21/9] lg:min-h-0">
            <Image
              src="/images/home/hero-watermark.png"
              alt="Mesa gamer com painéis de gráfico de preço em tons de dourado"
              fill
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover object-left [filter:brightness(1.7)_contrast(1.15)_saturate(1.25)]"
            />
            {/* Brilho âmbar atrás do gráfico + vinheta só no lado do texto */}
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_40%,rgba(245,158,11,0.28),transparent_55%)] mix-blend-screen" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-l from-[#0F0C08]/95 via-[#0F0C08]/55 to-transparent md:from-[#0F0C08]/90 md:via-[#0F0C08]/30" />
            <CornerBrackets inset={16} size={20} />

            <div className="relative z-10 flex h-full items-center justify-end p-4 sm:p-8 lg:p-12">
              <div className="w-full max-w-xl border border-amber-400/60 bg-[#0F0C08]/75 p-5 shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-8">
                <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-amber-300">
                  <History className="size-4" aria-hidden />
                  <span>Por trás de cada preço</span>
                </div>
                <div aria-hidden className="mt-3 h-0.5 w-14 bg-amber-400" />
                <Text as="h2" variant="display-md" className="mt-3 font-black !text-white tracking-tight text-2xl sm:text-3xl lg:text-4xl leading-tight">
                  Preço, média e menor preço de cada jogo.
                </Text>
                <Text variant="body-md" className="mt-3 font-medium !text-zinc-100 text-sm sm:text-base leading-relaxed">
                  Veja o preço atual, a média e o menor preço já registrado antes de comprar.
                </Text>

                {numbers.length > 0 && (
                  <dl className="mt-5 grid grid-cols-3 gap-px border border-white/15 bg-white/15">
                    {numbers.map((n) => (
                      <div key={n.label} className="flex flex-col-reverse bg-[#0F0C08]/80 px-2 py-2.5 text-center sm:px-3">
                        <dt className="text-[11px] font-semibold leading-tight text-zinc-300">{n.label}</dt>
                        <dd className="font-mono text-lg font-black text-amber-300 sm:text-xl">
                          {n.value.toLocaleString('pt-BR')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" rightIcon={<ArrowRight className="size-4" />}>
                    <Link href="/ofertas">Buscar preços</Link>
                  </Button>
                  <Link
                    href="/entrar"
                    className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-amber-200 underline decoration-amber-400/60 underline-offset-4 hover:text-amber-100"
                  >
                    Monitorar um jogo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----- Hero ---------------------------------------------------
// Primeira tela = a função principal do site: BUSCAR PREÇOS. Sempre dark
// (data-theme="dark"), foto real tratada com overlay em gradiente (contraste
// AA do texto), busca à esquerda e carrossel vertical de notícias reais à
// direita (some se não houver notícia; nada é inventado).
function Hero({ data }: { data: HomeSearchData }) {
  const { platforms } = data;
  return (
    <section
      data-theme="dark"
      aria-labelledby="hero-title"
      className="relative isolate w-full overflow-hidden border-b border-amber-500/20 bg-gradient-to-b from-[#1a1033] via-[#120b26] to-[#0c0616] text-white"
    >
      <Glow color="gold" size="xl" intensity={0.2} className="-top-64 -left-48" />
      <Glow color="hype" size="xl" intensity={0.18} className="-bottom-72 -right-40" />

      <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-12 text-center lg:px-8 lg:pb-24 lg:pt-20">
        <span className="inline-flex items-center gap-2 border border-amber-400/40 bg-white/10 px-3 py-1.5 text-[14px] font-semibold text-amber-100">
          <Sparkles aria-hidden className="size-4 text-amber-400" />
          Ofertas reais. Decisões inteligentes.
        </span>
        <Text
          as="h1"
          id="hero-title"
          variant="display-xl"
          className="mt-5 !font-black tracking-tight !text-white !text-[36px] !leading-[40px] sm:!text-[44px] sm:!leading-[48px] lg:!text-[56px] lg:!leading-[60px]"
        >
          Informação real sobre games{' '}
          <span className="bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] bg-clip-text text-transparent">
            Decisões inteligentes.
          </span>
        </Text>

        <div className="mx-auto mt-8 max-w-3xl text-left">
          <SearchBox
            variant="hero"
            platforms={platforms.map((p) => ({ platform: p.platform, label: PLATFORM_SHORT[p.platform] || p.label }))}
          />
        </div>
      </div>
    </section>
  );
}

// ----- Inteligência Gamer Teaser Section --------------------
function InteligenciaGamerTeaserSection() {
  return (
    <section data-theme="dark" className="w-full bg-[var(--color-bg-canvas)] border-b border-[var(--color-border-subtle)] py-20 lg:py-28 relative overflow-hidden">
      <Glow color="gold" size="lg" intensity={0.12} className="-top-32 left-0" />
      <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-14">
          {/* Lado Esquerdo: Conteúdo Principal */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <Reveal>
              <SceneImage
                src="/images/home/observatorio-gamer-hero.png"
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
                  src="/images/home/observatorio-cards-bg.png"
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

// ----- Home News Section ------------------------------------
async function HomeNewsSection() {
  try {
    // Só entra na home notícia com fonte registrada (EG-16): sem fonte, não há como
    // conferir a afirmação, então o bloco some até o dono publicar matéria com fonte.
    const articles = (await getHomeArticles()).slice(0, 6);
    if (articles.length === 0) return null;

    return (
      <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24 border-b border-[var(--color-border-subtle)]">
        <Reveal>
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Text variant="label" color="tertiary">
                Portal de Notícias Geek
              </Text>
              <Text as="h2" variant="display-lg" className="mt-2">
                Últimas notícias.
              </Text>
            </div>
            <Link
              href="/noticias"
              className="inline-flex items-center gap-1 text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] font-bold"
            >
              Ver todas as notícias
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article, i) => {
            // Sem capa própria = sem imagem (nada de capa escolhida por palavra do título).
            const finalCover = article.coverImageUrl?.startsWith('/images/') ? article.coverImageUrl : null;
            return (
              <Reveal key={article.id} delay={i * 0.05}>
                <Link href={`/noticias/${article.slug}`} className="group block h-full">
                  <Card interactive className="h-full flex flex-col overflow-hidden border border-[var(--color-border-subtle)]">
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
                      {finalCover && (
                        <Image
                          src={finalCover}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      )}
                      <Badge variant="hype" size="sm" className="absolute top-3 left-3 capitalize z-10 shadow-md">
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
                      <Text variant="caption" color="tertiary" className="mt-auto pt-3 border-t border-[var(--color-border-subtle)] font-mono text-[11px]">
                        {new Date(article.publishedAt ?? article.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        {' · Fonte: '}
                        {article.sourceName}
                      </Text>
                    </CardContent>
                  </Card>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>
    );
  } catch (e) {
    console.error('Erro ao carregar notícias na home:', e);
    return null;
  }
}

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

// ----- Newsletter CTA ----------------------------------------
const STORE_BLURB: Record<string, string> = {
  games: 'Games',
  'impressao-3d': 'Impressão 3D',
  tecnologia: 'Tecnologia',
  livros: 'Livros',
  eletrodomesticos: 'Casa',
  eletroeletronicos: 'Eletrônicos',
  esporte: 'Esporte',
};
const STORE_ORDER = Object.keys(STORE_BLURB);

async function NewsletterCTA() {
  // Canais públicos de cada loja (Telegram e WhatsApp) vêm do cadastro das lojas; loja sem link não aparece. Falha segura: lista vazia.
  const stores = (await getStores().catch(() => []))
    .filter((s) => STORE_ORDER.includes(s.slug))
    .sort((x, y) => STORE_ORDER.indexOf(x.slug) - STORE_ORDER.indexOf(y.slug));
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 pb-20 lg:pb-28">
      <Card variant="elevated" className="relative overflow-hidden bg-brand-orange-depth border bg-brand-orange-glow">
        <Glow color="hype" size="lg" intensity={0.35} className="-bottom-32 -left-24" />

        <div className="relative grid items-center gap-8 p-8 lg:grid-cols-12 lg:gap-12 lg:p-14">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <Reveal>
              <Badge variant="outline" size="md" className="mb-5 border-amber-500/40 text-amber-400">
                Comunidade
              </Badge>
              <Text as="h2" variant="display-lg" className="max-w-[18ch]">
                Avisamos quando o preço cair.
              </Text>
              <Text variant="body-lg" color="secondary" className="mt-4 max-w-[48ch]">
                Cada loja tem o seu canal no Telegram e o seu grupo no WhatsApp. Você recebe só o menor preço monitorado, com a média das lojas e o histórico para decidir a compra.
              </Text>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="xl" rightIcon={<ArrowRight className="size-4" />}>
                  <Link href="/entrar">Criar minha conta</Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <a href="https://instagram.com/espacogeek86" target="_blank" rel="noopener noreferrer">Instagram</a>
                </Button>
              </div>
            </Reveal>
          </div>

          <div className="lg:col-span-6">
            <Reveal delay={0.1}>
              <ul className="grid gap-px border border-[var(--color-border-subtle)] bg-[var(--color-border-subtle)] sm:grid-cols-2">
                {stores.map((s) => (
                  <li key={s.slug} className="flex flex-col gap-2 bg-[var(--color-bg-inset)] p-4">
                    <Text variant="heading-sm">{STORE_BLURB[s.slug]}</Text>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {s.telegramInviteUrl && (
                        <a className="border border-[var(--color-border-default)] px-3 py-1 hover:border-amber-500/60" href={s.telegramInviteUrl} target="_blank" rel="noopener noreferrer">Telegram</a>
                      )}
                      {s.whatsappGroupUrl && (
                        <a className="border border-[var(--color-border-default)] px-3 py-1 hover:border-amber-500/60" href={s.whatsappGroupUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </Card>
    </section>
  );
}

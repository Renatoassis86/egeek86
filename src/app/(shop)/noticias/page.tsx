import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { SceneImage } from '@/components/motion/scene-image';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { cn } from '@/lib/cn';
import { getPublishedArticles } from '@/server/queries/news';
import type { ArticleCategory, NewsArticle } from '@/db/schema';
import { ARTICLE_CATEGORY_LABELS, ARTICLE_CATEGORY_OPTIONS } from '@/lib/news/labels';
import { AnimatedStatBars, type StatBarItem } from '@/components/motion/animated-stat-bars';
import { FeaturedArticlesCarousel } from '@/components/news/featured-articles-carousel';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// Estatísticas reais do mercado gamer, sempre com fonte citada — nunca
// inventadas nem projetadas sem dizer a origem. Atualizar quando houver
// relatório mais recente (Newzoo publica novo Global Games Market Report
// anualmente, geralmente entre jun-set; Pesquisa Game Brasil, anualmente).
const MARKET_STATS: StatBarItem[] = [
  {
    label: 'Mercado global de games em 2025',
    fillPercent: 75,
    displayValue: 'US$ 197 bi (+7,5%)',
    source: 'Newzoo, Global Games Market Report 2025',
  },
  {
    label: 'Mercado de games no Brasil em 2025',
    fillPercent: 80,
    displayValue: 'R$ 12,7 bi (+8%)',
    source: 'Newzoo / Statista / Abragames',
  },
  {
    label: 'Jogadores ativos no mundo',
    fillPercent: 61.5,
    displayValue: '3,6 bi (61,5% da população online)',
    source: 'Newzoo, 2025',
  },
  {
    label: 'Brasileiros que jogam games',
    fillPercent: 73.4,
    displayValue: '73,4%',
    source: 'Pesquisa Game Brasil',
  },
];

export const metadata = { title: 'Notícias' };

const CATEGORY_LABELS = ARTICLE_CATEGORY_LABELS;
const CATEGORY_OPTIONS = ARTICLE_CATEGORY_OPTIONS;

// Imagens reais (documental + tecnologia/negócio) pro mosaico do hub — ver
// lista de prompts de geração entregue ao cliente pra criar cada arquivo.
const marketScenes: { src: string; alt: string; tone: 'gold' | 'ember' | 'ink' }[] = [
  {
    src: '/images/noticias-hub/gamer-setup.png',
    alt: 'Pessoa jogando em um setup gamer completo, tela e periféricos iluminados',
    tone: 'gold',
  },
  {
    src: '/images/noticias-hub/esports-event.png',
    alt: 'Público acompanhando um evento de esports ao vivo',
    tone: 'ember',
  },
  {
    src: '/images/noticias-hub/data-analysis.png',
    alt: 'Equipe analisando gráficos e dados de mercado em tela grande',
    tone: 'ink',
  },
];

function parseCategoryParam(value?: string): ArticleCategory | undefined {
  return value && value in CATEGORY_LABELS ? (value as ArticleCategory) : undefined;
}

// Executa migrações dinâmicas de enums de notícias para garantir consistência
// (rede de segurança — a fonte real dessas categorias agora é a migration
// drizzle + o enum article_category; ver src/db/schema/_enums.ts).
async function ensureDbEnums() {
  const newCategories = ['filmes', 'series_tv', 'animes', 'games', 'korea', 'criticas', 'listas', 'colunistas', 'ccxp', 'pesquisa_mercado'];
  for (const cat of newCategories) {
    try {
      await db.execute(sql.raw(`ALTER TYPE article_category ADD VALUE '${cat}'`));
    } catch (e) {
      // Ignora se o valor já existir no enum do Postgres
    }
  }
  try {
    await db.execute(sql.raw(`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS keywords text`));
  } catch (e) {
    // Ignora se já existe
  }
}

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; pagina?: string }>;
}) {
  const { categoria, pagina } = await searchParams;
  const category = parseCategoryParam(categoria);
  const page = Number(pagina) > 0 ? Number(pagina) : 1;

  // Garante os enums no banco antes de buscar
  await ensureDbEnums();

  const [{ items, totalPages }, { items: featured }] = await Promise.all([
    getPublishedArticles({ category, page }),
    getPublishedArticles({ pageSize: 5 }),
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-14">
      {/* Hub de dados: posicionamento sobre o mercado gamer + estatísticas reais citadas */}
      <Reveal>
        <Text variant="label" color="hype">
          O mercado gamer em números
        </Text>
        <Text as="h1" variant="display-md" className="mt-2 max-w-[26ch] text-[28px] md:text-[38px] font-black leading-tight tracking-tight">
          Games já é a maior indústria de entretenimento do mundo, e o Brasil lidera a América Latina.
        </Text>
        <Text variant="body-md" color="secondary" className="mt-4 max-w-[70ch] leading-relaxed">
          Mais gente joga do que assiste streaming ou vai ao cinema — e o Brasil é o maior mercado
          consumidor da América Latina desde 2021. Esse hub reúne notícias, sinopses e as pesquisas
          de mercado que acompanhamos, sempre com fonte citada. Nunca projeção sem dizer de onde
          veio.
        </Text>
      </Reveal>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-center">
        <Reveal delay={0.06}>
          <AnimatedStatBars items={MARKET_STATS} />
        </Reveal>
        <Reveal delay={0.1}>
          <FeaturedArticlesCarousel articles={featured} />
        </Reveal>
      </div>

      {/* Mosaico documental/promocional — imagens reais (não geradas por IA
          sem revisão humana antes de publicar); enquanto o arquivo não
          existir em public/images/noticias-hub/, SceneImage cai no
          fallback "em produção" (nunca quebra, nunca imagem cinza genérica). */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {marketScenes.map(({ src, alt, tone }, i) => (
          <Reveal key={src} delay={0.06 + i * 0.06}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
              <SceneImage src={src} alt={alt} tone={tone} caption="Em curadoria" className="absolute inset-0" />
            </div>
          </Reveal>
        ))}
      </div>

      {/* Header Banner Visual */}
      <div className="relative border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/30 rounded-[var(--radius-xl)] p-6 md:p-10 lg:p-14 overflow-hidden mb-10 z-10">
        
        {/* Imagem do banner inteira com recorte diagonal na direita */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[48%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
          <div 
            className="relative w-full h-full"
            style={{
              clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)',
            }}
          >
            <Image
              src="/images/noticias/header-collage.png"
              alt="Notícias Banner"
              fill
              className="object-cover object-center"
              priority
            />
            {/* Gradiente sutil de fade na junção do corte diagonal */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-transparent to-transparent opacity-80 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-col gap-3 relative z-10 max-w-2xl">
          <Reveal>
            <Badge variant="hype" size="md">
              Mural Geek
            </Badge>
          </Reveal>
          <Reveal delay={0.05}>
            <Text as="h2" variant="display-md" className="text-[32px] md:text-[40px] font-black leading-none tracking-tight">
              Notícias
            </Text>
          </Reveal>
          <Reveal delay={0.1}>
            <Text variant="body-sm" color="secondary" className="max-w-[50ch] leading-relaxed text-xs md:text-sm">
              Cultura pop, sinopse de jogos, tecnologia e tudo que envolve o mundo gamer e geek.
            </Text>
          </Reveal>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
        <Link
          href="/noticias"
          className={cn(
            'rounded-[var(--radius-full)] border px-3 py-1.5 text-body-sm font-medium transition-colors',
            !category
              ? 'border-transparent bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
              : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          Todas
        </Link>
        {CATEGORY_OPTIONS.map(([value, label]) => (
          <Link
            key={value}
            href={`/noticias?categoria=${value}`}
            className={cn(
              'rounded-[var(--radius-full)] border px-3 py-1.5 text-body-sm font-medium transition-colors',
              category === value
                ? 'border-transparent bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
                : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Grid Três Colunas: Menu Lateral vs Matérias vs Coluna Editorial */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Lado Esquerdo (Desktop): Menu Lateral de Categorias */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/15 p-4 shadow-[var(--shadow-sm)]">
            <Text variant="heading-sm" className="mb-3 border-b border-[var(--color-border-subtle)] pb-2 uppercase tracking-wider text-[11px] font-bold text-[var(--color-text-secondary)]">
              Filtrar por Área
            </Text>
            <div className="flex flex-col gap-1">
              <Link
                href="/noticias"
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded text-xs font-semibold transition-all hover:bg-[var(--color-bg-surface)]',
                  !category
                    ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] font-bold border-l-2 border-[var(--color-accent-primary)] pl-2.5'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                )}
              >
                <span>Todas as Áreas</span>
              </Link>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <Link
                  key={value}
                  href={`/noticias?categoria=${value}`}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded text-xs font-semibold transition-all hover:bg-[var(--color-bg-surface)]',
                    category === value
                      ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] font-bold border-l-2 border-[var(--color-accent-primary)] pl-2.5'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  )}
                >
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Centro: Grid de Artigos */}
        <div className="lg:col-span-6">
          {items.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Text variant="body-sm" color="tertiary">
                  Nenhuma matéria publicada ainda{category ? ' nessa categoria' : ''}.
                </Text>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {items.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>

        {/* Lado Direito: Colunistas & Coluna Editorial */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/20">
            <CardContent className="p-5 flex flex-col gap-4">
              
              {/* Cabeçalho do Bloco */}
              <div className="flex items-center gap-2.5 border-b border-[var(--color-border-subtle)] pb-3">
                <div className="flex size-7 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
                  <Award className="size-4" />
                </div>
                <div>
                  <Text variant="body-sm" className="font-bold text-[var(--color-text-primary)]">
                    Coluna Editorial
                  </Text>
                  <Text variant="caption" color="tertiary" className="text-[10px]">
                    Colunistas Parceiros
                  </Text>
                </div>
              </div>

              {/* Feed de Opiniões */}
              <div className="flex flex-col gap-4">
                
                {/* Colunista 1 */}
                <div className="flex gap-3.5 p-3.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded hover:border-[var(--color-border-strong)] transition-all items-start">
                  <div className="relative size-9 rounded-full overflow-hidden shrink-0 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
                    <Image
                      src="/images/colunistas/arthur.png"
                      alt="Arthur Pendragon"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-[var(--color-accent-primary)] uppercase tracking-wider block">
                      Arthur Pendragon · Mestre
                    </span>
                    <Text variant="body-sm" className="font-semibold leading-tight hover:underline text-[12px] md:text-[13px]">
                      O Futuro do Retro Gaming e a Preservação Digital
                    </Text>
                    <span className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                      Por que as mídias físicas antigas estão morrendo e o que podemos fazer para salvar os clássicos.
                    </span>
                  </div>
                </div>

                {/* Colunista 2 */}
                <div className="flex gap-3.5 p-3.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded hover:border-[var(--color-border-strong)] transition-all items-start">
                  <div className="relative size-9 rounded-full overflow-hidden shrink-0 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
                    <Image
                      src="/images/colunistas/jessica.png"
                      alt="Jéssica Ramos"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-[var(--color-accent-primary)] uppercase tracking-wider block">
                      Jéssica Ramos · Hunter Pro
                    </span>
                    <Text variant="body-sm" className="font-semibold leading-tight hover:underline text-[12px] md:text-[13px]">
                      O Impacto do Pro Controller na Competitividade
                    </Text>
                    <span className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                      Análise tática dos analógicos mecânicos e botões traseiros nos consoles atuais.
                    </span>
                  </div>
                </div>

                {/* Colunista 3 */}
                <div className="flex gap-3.5 p-3.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded hover:border-[var(--color-border-strong)] transition-all items-start">
                  <div className="relative size-9 rounded-full overflow-hidden shrink-0 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
                    <Image
                      src="/images/colunistas/renato.png"
                      alt="Renato Assis"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-[var(--color-accent-primary)] uppercase tracking-wider block">
                      Renato Assis · Renato86
                    </span>
                    <Text variant="body-sm" className="font-semibold leading-tight hover:underline text-[12px] md:text-[13px]">
                      Por que Colecionar Funko Virou Cultura de Massa?
                    </Text>
                    <span className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                      O fenômeno do design minimalista cabeçudo que conquistou prateleiras no mundo inteiro.
                    </span>
                  </div>
                </div>

              </div>

              {/* Call-to-Action */}
              <div className="border-t border-[var(--color-border-subtle)] pt-4 mt-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)] block">
                  Quer ser um colunista?
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed mt-1 block">
                  Escreva sobre cultura pop, games ou tecnologia e compartilhe com milhares de leitores.
                </span>
                <Button asChild size="sm" variant="outline" className="w-full mt-3 text-[11px] h-8">
                  <Link href="/contato">Candidatar-se à Coluna</Link>
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href={`/noticias?${new URLSearchParams({ ...(category ? { categoria: category } : {}), pagina: String(Math.max(1, page - 1)) })}`}
            aria-disabled={page <= 1}
            className={cn(
              'inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-body-sm',
              page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[var(--color-bg-surface)]'
            )}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Link>
          <Text variant="body-sm" color="tertiary">
            Página {page} de {totalPages}
          </Text>
          <Link
            href={`/noticias?${new URLSearchParams({ ...(category ? { categoria: category } : {}), pagina: String(Math.min(totalPages, page + 1)) })}`}
            aria-disabled={page >= totalPages}
            className={cn(
              'inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-body-sm',
              page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-[var(--color-bg-surface)]'
            )}
          >
            Próxima
            <ChevronRight className="size-4" />
          </Link>
        </div>
      )}
    </section>
  );
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const isCurated = article.kind === 'curated_link';
  const href = `/noticias/${article.slug}`;

  return (
    <Link href={href} className="group block h-full">
      <Card interactive className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-[var(--color-bg-inset)]">
          <SceneImage src={article.coverImageUrl} alt={article.title} tone="gold" />
          <div className="absolute left-3 top-3">
            <Badge
              variant={isCurated ? 'outline' : 'primary'}
              size="sm"
              className={isCurated ? 'bg-[var(--color-bg-canvas)]/80 backdrop-blur-sm' : undefined}
            >
              {isCurated ? 'Também na mídia' : 'Artigo'}
            </Badge>
          </div>
        </div>
        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <Text variant="caption" color="tertiary" className="uppercase tracking-[0.04em]">
            {CATEGORY_LABELS[article.category]}
          </Text>
          <Text variant="body-md" className="line-clamp-2 font-medium">
            {article.title}
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-auto line-clamp-2">
            {article.excerpt}
          </Text>
          {isCurated && article.sourceName && (
            <Text variant="caption" color="tertiary">
              via {article.sourceName}
            </Text>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

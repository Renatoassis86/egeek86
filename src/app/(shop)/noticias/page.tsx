import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { SceneImage } from '@/components/motion/scene-image';
import { cn } from '@/lib/cn';
import { getPublishedArticles } from '@/server/queries/news';
import type { ArticleCategory, NewsArticle } from '@/db/schema';
import { ARTICLE_CATEGORY_LABELS, ARTICLE_CATEGORY_OPTIONS, ARTICLE_CATEGORY_STYLES } from '@/lib/news/labels';
import { FeaturedArticlesCarousel } from '@/components/news/featured-articles-carousel';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const metadata = { title: 'Notícias' };

const CATEGORY_LABELS = ARTICLE_CATEGORY_LABELS;
const CATEGORY_OPTIONS = ARTICLE_CATEGORY_OPTIONS;

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

  const isDefaultView = !category && page === 1;
  const secondaryItems = isDefaultView ? items.slice(1) : items;

  return (
    <section data-theme="light" className="w-full bg-[var(--color-bg-canvas)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-8 lg:py-12">
      {/* Cabeçalho estilo portal (Globo/UOL): título simples, sem banner
          escuro nem imagem de fundo — o carrossel de destaques logo abaixo
          já carrega a força visual da abertura. */}
      <div className="mb-6 flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-5">
        <Reveal>
          <Badge variant="hype" size="md" className="w-fit mb-1">
            Mural Geek
          </Badge>
        </Reveal>
        <Reveal delay={0.05}>
          <Text as="h1" variant="display-md" className="text-[28px] md:text-[36px] font-black leading-none tracking-tight text-[var(--color-text-primary)]">
            Notícias
          </Text>
        </Reveal>
        <Reveal delay={0.1}>
          <Text variant="body-sm" color="secondary" className="max-w-[60ch] leading-relaxed text-xs md:text-sm">
            Cultura pop, sinopse de jogos, tecnologia e tudo que envolve o mundo gamer e geek.
          </Text>
        </Reveal>
      </div>

      {/* Carrossel de destaques — as 5 matérias mais recentes, direto abaixo
          do texto inicial acima (mesma seção de abertura da página). */}
      <div className="mb-10">
        <Reveal delay={0.06}>
          <FeaturedArticlesCarousel articles={featured} />
        </Reveal>
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
          ) : isDefaultView ? (
            <div className="flex flex-col gap-5">
              {/* Manchete principal — só faz sentido na visão padrão (sem filtro,
                  primeira página): destaque real pra matéria mais recente, no
                  espírito de home de portal (Globo/UOL), não mais um card igual
                  aos outros. */}
              <LeadArticleCard article={items[0]} />
              {secondaryItems.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {secondaryItems.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              )}
            </div>
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
      </div>
    </section>
  );
}

const CLEAN_NEWS_IMAGES = [
  '/images/noticias-hub/news-gta6.png',
  '/images/noticias-hub/news-xmen.png',
  '/images/noticias-hub/news-esports.png',
  '/images/noticias-hub/news-gaming-setup.png',
  '/images/noticias-hub/news-retro-console.png',
];

function getCleanNewsImage(coverUrl?: string | null, index = 0) {
  if (coverUrl && coverUrl.startsWith('/images/noticias-hub/news-')) {
    return coverUrl;
  }
  return CLEAN_NEWS_IMAGES[index % CLEAN_NEWS_IMAGES.length];
}

/**
 * Manchete principal — estilo globo.com/UOL: foto no topo, título abaixo
 * dela (não sobreposto na imagem), card branco com borda fina na cor da
 * editoria e etiqueta de categoria embaixo (mesmo padrão do card menor,
 * só maior).
 */
function LeadArticleCard({ article }: { article: NewsArticle }) {
  const isCurated = article.kind === 'curated_link';
  const style = ARTICLE_CATEGORY_STYLES[article.category];

  return (
    <Link href={`/noticias/${article.slug}`} className="group block">
      <div className={cn('overflow-hidden rounded-[var(--radius-xl)] border bg-white shadow-sm transition-shadow hover:shadow-md', style.border)}>
        <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden bg-[var(--color-bg-inset)]">
          <SceneImage src={getCleanNewsImage(article.coverImageUrl, 0)} alt={article.title} tone="ember" />
        </div>
        <div className="flex flex-col gap-2 p-5 sm:p-6">
          <Text as="h2" variant="heading-lg" className={cn('line-clamp-3 font-black leading-snug', style.heading)}>
            {article.title}
          </Text>
          <Text variant="body-sm" color="secondary" className="line-clamp-2 max-w-[70ch]">
            {article.excerpt}
          </Text>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold', style.chipBg, style.chipText)}>
              {CATEGORY_LABELS[article.category]}
            </span>
            {isCurated && (
              <span className="inline-flex items-center rounded-full border border-[var(--color-border-default)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                Também na mídia{article.sourceName ? ` · ${article.sourceName}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Card de matéria — mesmo padrão do LeadArticleCard, em tamanho menor pra grade. */
function ArticleCard({ article, index = 0 }: { article: NewsArticle; index?: number }) {
  const isCurated = article.kind === 'curated_link';
  const style = ARTICLE_CATEGORY_STYLES[article.category];
  const href = `/noticias/${article.slug}`;

  return (
    <Link href={href} className="group block h-full">
      <div className={cn('flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-sm transition-shadow hover:shadow-md', style.border)}>
        <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-[var(--color-bg-inset)]">
          <SceneImage src={getCleanNewsImage(article.coverImageUrl, index + 1)} alt={article.title} tone="gold" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <Text variant="body-md" className={cn('line-clamp-2 font-bold leading-snug', style.heading)}>
            {article.title}
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-auto line-clamp-2">
            {article.excerpt}
          </Text>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold', style.chipBg, style.chipText)}>
              {CATEGORY_LABELS[article.category]}
            </span>
            {isCurated && article.sourceName && (
              <span className="text-[11px] text-[var(--color-text-tertiary)]">via {article.sourceName}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

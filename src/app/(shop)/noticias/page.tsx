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
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const metadata = { title: 'Notícias' };

const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  cultura_pop: 'Cultura Pop',
  sinopse_jogo: 'Sinopse de Jogo',
  tecnologia: 'Tecnologia',
  lancamentos: 'Lançamentos',
  filmes: 'Filmes',
  series_tv: 'Séries e TV',
  animes: 'Animes',
  games: 'Games',
  korea: 'Korea',
  criticas: 'Críticas',
  listas: 'Listas',
  colunistas: 'Colunistas',
  ccxp: 'CCXP',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [ArticleCategory, string][];

function parseCategoryParam(value?: string): ArticleCategory | undefined {
  return value && value in CATEGORY_LABELS ? (value as ArticleCategory) : undefined;
}

// Executa migrações dinâmicas de enums de notícias para garantir consistência
async function ensureDbEnums() {
  const newCategories = ['filmes', 'series_tv', 'animes', 'games', 'korea', 'criticas', 'listas', 'colunistas', 'ccxp'];
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

  const { items, totalPages } = await getPublishedArticles({ category, page });

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-14">
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
            <Text as="h1" variant="display-md" className="text-[32px] md:text-[40px] font-black leading-none tracking-tight">
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

      <div className="mb-8 flex flex-wrap gap-2">
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

      {/* Grid Duas Colunas: Matérias vs Coluna Editorial */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Lado Esquerdo: Grid de Artigos */}
        <div className="lg:col-span-8">
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
        <div className="lg:col-span-4 flex flex-col gap-6">
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

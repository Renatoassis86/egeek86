import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SceneImage } from '@/components/motion/scene-image';
import { cn } from '@/lib/cn';
import { getPublishedArticles } from '@/server/queries/news';
import type { ArticleCategory, NewsArticle } from '@/db/schema';

export const metadata = { title: 'Notícias' };

const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  cultura_pop: 'Cultura pop',
  sinopse_jogo: 'Sinopse de jogo',
  tecnologia: 'Tecnologia',
  lancamentos: 'Lançamentos',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [ArticleCategory, string][];

function parseCategoryParam(value?: string): ArticleCategory | undefined {
  return value && value in CATEGORY_LABELS ? (value as ArticleCategory) : undefined;
}

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; pagina?: string }>;
}) {
  const { categoria, pagina } = await searchParams;
  const category = parseCategoryParam(categoria);
  const page = Number(pagina) > 0 ? Number(pagina) : 1;

  const { items, totalPages } = await getPublishedArticles({ category, page });

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <Text as="h1" variant="heading-xl">
          Notícias
        </Text>
        <Text variant="body-md" color="secondary" className="mt-1">
          Cultura pop, sinopse de jogos, tecnologia e tudo que envolve o mundo gamer e geek.
        </Text>
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

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Text variant="body-sm" color="tertiary">
              Nenhuma matéria publicada ainda{category ? ' nessa categoria' : ''}.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

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
  const href = isCurated ? `/go/noticia/${article.slug}` : `/noticias/${article.slug}`;

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

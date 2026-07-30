import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MarkdownAsync } from 'react-markdown';
import { eq } from 'drizzle-orm';
import { Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { newsArticles } from '@/db/schema';
import { scrapeNewsArticle } from '@/server/actions/news';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SceneImage } from '@/components/motion/scene-image';
import { getArticleBySlug, getArticleAuthorName, getRelatedArticles } from '@/server/queries/news';
import { ARTICLE_CATEGORY_LABELS as CATEGORY_LABELS } from '@/lib/news/labels';

const WORDS_PER_MINUTE = 200;

/** Estimativa real a partir da contagem de palavras do corpo — nunca um número fixo/fabricado. */
function estimateReadingMinutes(markdown: string | null): number {
  if (!markdown) return 1;
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  return { title: article?.title ?? 'Notícias' };
}

/**
 * Página de leitura completa — só pra artigo 'original'. Se um link antigo
 * ou crawler cair aqui num artigo 'curated_link' (nunca linkado assim na
 * listagem), redireciona pro /go/noticia/[slug] em vez de tentar renderizar
 * conteúdo que não é nosso.
 */
export default async function ArtigoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  let bodyMarkdown = article.bodyMarkdown;
  let coverImageUrl = article.coverImageUrl;

  // Transcrição sob demanda para matérias antigas ou que falharam na criação
  if ((article.kind === 'curated_link' || !bodyMarkdown) && article.sourceUrl) {
    try {
      const scraped = await scrapeNewsArticle(article.sourceUrl, article.sourceName ?? undefined);
      bodyMarkdown = scraped.bodyMarkdown;
      if (!coverImageUrl && scraped.coverImageUrl) {
        coverImageUrl = scraped.coverImageUrl;
      }
      
      // Atualiza o banco de dados e converte em artigo próprio ('original') de forma definitiva
      await db
        .update(newsArticles)
        .set({
          kind: 'original',
          bodyMarkdown,
          coverImageUrl,
          sourceName: null,
          sourceUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(newsArticles.id, article.id));
    } catch (e) {
      console.error('Falha na transcrição sob demanda do artigo:', e);
    }
  }

  const [authorName, relatedArticles] = await Promise.all([
    getArticleAuthorName(article.authorId),
    getRelatedArticles(article.category, article.id, 3),
  ]);
  const readingMinutes = estimateReadingMinutes(bodyMarkdown);

  return (
    <div data-theme="light" className="w-full bg-[var(--color-bg-canvas)]">
    <article className="mx-auto max-w-3xl px-4 lg:px-8 py-10 lg:py-14">
      <Link
        href="/noticias"
        className="mb-6 inline-flex items-center gap-1 text-body-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        Voltar pras notícias
      </Link>

      <Badge variant="primary" size="sm" className="mb-3">
        {CATEGORY_LABELS[article.category]}
      </Badge>
      <Text as="h1" variant="heading-xl">
        {article.title}
      </Text>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {authorName && (
          <Text variant="caption" color="secondary" className="font-semibold">
            Por {authorName}
          </Text>
        )}
        {article.publishedAt && (
          <Text variant="caption" color="tertiary">
            {article.publishedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </Text>
        )}
        <Text variant="caption" color="tertiary" className="inline-flex items-center gap-1">
          <Clock className="size-3" aria-hidden />
          {readingMinutes} min de leitura
        </Text>
      </div>

      <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-inset)]">
        <SceneImage src={coverImageUrl} alt={article.title} tone="gold" priority />
      </div>

      <div className="mt-8 flex flex-col gap-4 text-body-lg text-[var(--color-text-secondary)]">
        <MarkdownAsync
          components={{
            h2: ({ children }) => (
              <Text as="h2" variant="heading-lg" className="mt-4">
                {children}
              </Text>
            ),
            h3: ({ children }) => (
              <Text as="h3" variant="heading-md" className="mt-3">
                {children}
              </Text>
            ),
            p: ({ children }) => <p className="leading-relaxed">{children}</p>,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent-primary)] underline underline-offset-2"
              >
                {children}
              </a>
            ),
            strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-[var(--color-border-strong)] pl-4 italic text-[var(--color-text-tertiary)]">
                {children}
              </blockquote>
            ),
            img: (props) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...props} className="w-full rounded-[var(--radius-md)]" alt={props.alt ?? ''} />
            ),
            code: ({ children }) => (
              <code className="rounded-[var(--radius-xs)] bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-[0.9em]">
                {children}
              </code>
            ),
          }}
        >
          {bodyMarkdown ?? ''}
        </MarkdownAsync>
      </div>

      {article.keywords && (
        <div className="mt-8 pt-6 border-t border-[var(--color-border-subtle)] flex flex-wrap gap-2">
          {article.keywords.split(',').map((kw) => {
            const cleanKw = kw.trim();
            if (!cleanKw) return null;
            return (
              <Badge key={cleanKw} variant="outline" className="text-xs bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] select-none">
                🏷️ {cleanKw}
              </Badge>
            );
          })}
        </div>
      )}

      {relatedArticles.length > 0 && (
        <div className="mt-10 pt-8 border-t border-[var(--color-border-subtle)]">
          <Text variant="label" color="tertiary" className="mb-4">
            Leia também
          </Text>
          <div className="grid gap-4 sm:grid-cols-3">
            {relatedArticles.map((related) => (
              <Link key={related.id} href={`/noticias/${related.slug}`} className="group block h-full">
                <Card interactive className="h-full flex flex-col overflow-hidden">
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-bg-inset)]">
                    <SceneImage src={related.coverImageUrl} alt={related.title} tone="ember" />
                  </div>
                  <CardContent className="p-3 flex-1">
                    <Text variant="body-sm" className="line-clamp-2 font-medium group-hover:text-[var(--color-accent-primary)] transition-colors">
                      {related.title}
                    </Text>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
    </div>
  );
}

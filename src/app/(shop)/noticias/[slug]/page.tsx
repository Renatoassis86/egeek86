import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MarkdownAsync } from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { SceneImage } from '@/components/motion/scene-image';
import { getArticleBySlug } from '@/server/queries/news';
import type { ArticleCategory } from '@/db/schema';

const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  cultura_pop: 'Cultura pop',
  sinopse_jogo: 'Sinopse de jogo',
  tecnologia: 'Tecnologia',
  lancamentos: 'Lançamentos',
};

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
  if (article.kind === 'curated_link') redirect(`/go/noticia/${slug}`);

  return (
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
      {article.publishedAt && (
        <Text variant="caption" color="tertiary" className="mt-2">
          {article.publishedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </Text>
      )}

      <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-inset)]">
        <SceneImage src={article.coverImageUrl} alt={article.title} tone="gold" priority />
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
          {article.bodyMarkdown ?? ''}
        </MarkdownAsync>
      </div>
    </article>
  );
}

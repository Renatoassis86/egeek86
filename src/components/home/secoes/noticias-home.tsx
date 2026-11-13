// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Noticias da home (leitura unica por requisicao).
import { cache } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { getPublishedArticles } from '@/server/queries/news';
import { createPersistedQuery } from '@/lib/cache/server-cache';

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

// ----- Home News Section ------------------------------------
export async function HomeNewsSection() {
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

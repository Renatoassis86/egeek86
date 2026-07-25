'use client';

import * as React from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { SceneImage } from '@/components/motion/scene-image';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/news/labels';
import { cn } from '@/lib/cn';
import type { NewsArticle } from '@/db/schema';

/**
 * Carrossel de destaques do hub de notícias — alimentado pelos artigos
 * publicados mais recentes (getPublishedArticles, sem flag "destaque" nova
 * no schema). Mesmo padrão de embla-carousel-react + autoplay do
 * WeeklyPromosCarousel (src/components/geek-deals/weekly-promos-carousel.tsx).
 */
export function FeaturedArticlesCarousel({ articles }: { articles: NewsArticle[] }) {
  const autoplay = React.useRef(Autoplay({ delay: 6000, stopOnInteraction: true, stopOnMouseEnter: true }));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: articles.length > 1, align: 'start' }, [autoplay.current]);
  const [selected, setSelected] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  if (articles.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)]">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {articles.map((article) => (
            <div key={article.id} className="min-w-0 flex-[0_0_100%]">
              <Link href={`/noticias/${article.slug}`} className="group grid sm:grid-cols-2">
                <div className="relative aspect-[16/9] overflow-hidden bg-[var(--color-bg-inset)] sm:aspect-auto">
                  <SceneImage src={article.coverImageUrl} alt={article.title} tone="gold" />
                </div>
                <div className="flex flex-col justify-center gap-3 bg-[var(--color-bg-surface)] p-6 sm:p-10">
                  <Badge variant="primary" size="sm" className="w-fit">
                    {ARTICLE_CATEGORY_LABELS[article.category]}
                  </Badge>
                  <Text as="h3" variant="heading-lg" className="line-clamp-2 font-bold group-hover:underline">
                    {article.title}
                  </Text>
                  <Text variant="body-sm" color="secondary" className="line-clamp-2">
                    {article.excerpt}
                  </Text>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {articles.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/70 p-2 text-[var(--color-text-primary)] backdrop-blur-sm transition-colors hover:bg-[var(--color-bg-canvas)]"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/70 p-2 text-[var(--color-text-primary)] backdrop-blur-sm transition-colors hover:bg-[var(--color-bg-canvas)]"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {articles.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir pro destaque ${i + 1}`}
                onClick={() => emblaApi?.scrollTo(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === selected ? 'w-6 bg-[var(--color-accent-primary)]' : 'w-1.5 bg-[var(--color-text-primary)]/30'
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

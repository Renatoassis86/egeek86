'use client';

import * as React from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/ui/product-image';
import { Text } from '@/components/ui/text';
import { Glow } from '@/components/motion/glow';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface CarouselSlide {
  slug: string;
  title: string;
  imageUrl: string | null;
  networkName: string;
  currentPriceCents: number;
  avgDiscountPercent: number | null;
  isLowestEver: boolean;
}

const ITEMS_PER_GROUP = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

/**
 * Carrossel full-bleed das melhores ofertas da semana — dado real (não é
 * mockup). Cada slide mostra 3 ofertas lado a lado (não 1 só): evita a
 * "vitrine vazia" de um card pequeno boiando num banner alto só com blur de
 * fundo — o conteúdo real preenche o frame. Autoplay via
 * embla-carousel-autoplay, pausa sozinho no hover/interação, respeita
 * prefers-reduced-motion.
 */
export function WeeklyPromosCarousel({ slides }: { slides: CarouselSlide[] }) {
  const autoplay = React.useRef(Autoplay({ delay: 5000, stopOnInteraction: true, stopOnMouseEnter: true }));
  const groups = React.useMemo(() => chunk(slides, ITEMS_PER_GROUP), [slides]);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: groups.length > 1, align: 'start' }, [autoplay.current]);
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

  if (groups.length === 0) return null;

  return (
    <section
      className="relative w-full overflow-hidden border-y border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]"
      aria-label="Promoções da semana"
    >
      <Glow color="gold" size="lg" intensity={0.16} className="-top-32 left-1/4" />
      <Glow color="hype" size="md" intensity={0.1} className="-bottom-24 right-1/4" />

      <div className="relative overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="min-w-0 flex-[0_0_100%]">
              <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-3 lg:gap-6 lg:px-8 lg:py-10">
                {group.map((slide) => (
                  <PromoCard key={slide.slug} slide={slide} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {groups.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/70 p-2 text-[var(--color-text-primary)] backdrop-blur-sm transition-colors hover:bg-[var(--color-bg-canvas)] lg:left-6"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/70 p-2 text-[var(--color-text-primary)] backdrop-blur-sm transition-colors hover:bg-[var(--color-bg-canvas)] lg:right-6"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {groups.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir pro grupo ${i + 1}`}
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
    </section>
  );
}

function PromoCard({ slide }: { slide: CarouselSlide }) {
  return (
    <Link
      href={`/ofertas/${slide.slug}`}
      className="group flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)]/60 p-4 backdrop-blur-sm transition-colors hover:border-[var(--color-border-strong)]"
    >
      <ProductImage src={slide.imageUrl} alt={slide.title} hoverZoom padding="sm" className="size-28 sm:size-32" />

      <div className="min-w-0 flex-1">
        <Badge variant="outline" size="sm" className="mb-2">
          {slide.networkName}
        </Badge>
        <Text as="h3" variant="body-md" className="mb-2 line-clamp-2 font-medium">
          {slide.title}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="heading-sm" color="primary" className="tabular">
            {formatBRL(slide.currentPriceCents)}
          </Text>
          {slide.avgDiscountPercent ? (
            <Badge variant="success" size="sm">
              -{slide.avgDiscountPercent}%
            </Badge>
          ) : null}
        </div>
        {slide.isLowestEver && (
          <Badge variant="hype" size="sm" className="mt-2">
            <Flame className="size-3" />
            Menor preço já visto
          </Badge>
        )}
      </div>
    </Link>
  );
}

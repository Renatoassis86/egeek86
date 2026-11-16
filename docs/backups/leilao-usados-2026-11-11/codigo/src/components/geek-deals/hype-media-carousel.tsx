'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface HypeMediaCarouselProps {
  images: string[];
  alt: string;
  className?: string;
}

export function HypeMediaCarousel({ images, alt, className }: HypeMediaCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className={cn('relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex items-center justify-center', className)}>
        <span className="text-caption text-[var(--color-text-tertiary)]">Sem Imagem</span>
      </div>
    );
  }

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className={cn('flex flex-col gap-2.5 w-full', className)}>
      {/* Imagem Principal */}
      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-md)]">
        <Image
          src={images[activeIndex]}
          alt={`${alt} - Imagem ${activeIndex + 1}`}
          fill
          sizes="(min-width: 1024px) 500px, 95vw"
          className="object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105"
          priority={activeIndex === 0}
        />
        
        {/* Gradiente sutil */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

        {/* Controles de Navegação (Somente se mais de 1 imagem) */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/80 text-[var(--color-text-primary)] opacity-0 shadow-[var(--shadow-sm)] backdrop-blur-sm transition-all duration-[var(--duration-fast)] group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-bg-surface)]"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/80 text-[var(--color-text-primary)] opacity-0 shadow-[var(--shadow-sm)] backdrop-blur-sm transition-all duration-[var(--duration-fast)] group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-bg-surface)]"
              aria-label="Próxima imagem"
            >
              <ChevronRight className="size-4" />
            </button>

            {/* Marcadores de Página */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/40 rounded-full px-2 py-1 backdrop-blur-sm">
              {images.map((_, idx) => (
                <span
                  key={idx}
                  className={cn(
                    'size-1.5 rounded-full transition-all',
                    activeIndex === idx ? 'w-3.5 bg-[var(--color-accent-primary)]' : 'bg-[var(--color-text-inverse)]/40'
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Miniaturas de Navegação (thumbnails) */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={cn(
                'relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
                activeIndex === idx
                  ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]'
              )}
            >
              <Image
                src={img}
                alt={`${alt} miniatura ${idx + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

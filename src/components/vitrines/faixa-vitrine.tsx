'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CartaoVitrine } from '@/components/vitrines/cartao-vitrine';
import type { VitrineItem } from '@/lib/vitrines/tipos';

/**
 * Faixa horizontal (embla). No celular arrasta com encaixe por cartão (snap); do tablet para cima mostra setas de 44 px.
 * Largura dos cartões fixa por breakpoint: nada muda de tamanho depois de hidratar (sem CLS).
 */
export function FaixaVitrine({ itens, rotulo }: { itens: VitrineItem[]; rotulo: string }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', dragFree: false });
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [podeAvancar, setPodeAvancar] = useState(false);

  const atualizar = useCallback(() => {
    if (!emblaApi) return;
    setPodeVoltar(emblaApi.canScrollPrev());
    setPodeAvancar(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    atualizar();
    emblaApi.on('select', atualizar).on('reInit', atualizar);
    return () => {
      emblaApi.off('select', atualizar).off('reInit', atualizar);
    };
  }, [emblaApi, atualizar]);

  return (
    <div className="relative" role="region" aria-roledescription="carrossel" aria-label={rotulo}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="-ml-3 flex touch-pan-y">
          {itens.map((item, i) => (
            <div
              key={`${item.masterProductId}-${item.offerId ?? i}`}
              className="min-w-0 flex-[0_0_72%] pl-3 sm:flex-[0_0_42%] md:flex-[0_0_33.333%] lg:flex-[0_0_25%] xl:flex-[0_0_20%]"
            >
              <CartaoVitrine item={item} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 hidden items-center justify-end gap-2 md:flex">
        <button
          type="button"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!podeVoltar}
          aria-label={`${rotulo}: anterior`}
          className="inline-flex size-11 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-text-primary)] disabled:opacity-40"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => emblaApi?.scrollNext()}
          disabled={!podeAvancar}
          aria-label={`${rotulo}: próximo`}
          className="inline-flex size-11 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-text-primary)] disabled:opacity-40"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

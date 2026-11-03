'use client';

import { useState, type ReactNode } from 'react';
import { Tag } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DIMENSIONS, type CatalogDimension } from '@/lib/catalog/dimensions';

/** Jogos em 4:5 (capa); consoles/acessórios em 1:1 (decisão do dono, 2026-10-31). */
export function ratioForDimension(d?: CatalogDimension | null): 'portrait' | 'square' {
  return d === 'game' ? 'portrait' : 'square';
}

/**
 * Quadro padrão de foto de produto (estilo Zoom/Google Shopping): proporção
 * fixa, imagem inteira (`object-contain`) centralizada com respiro interno,
 * painel claro mesmo no tema escuro (capas costumam ter fundo branco) e borda
 * fina. Sem foto ou em erro de carga: ícone neutro, nunca imagem inventada.
 *
 * O tamanho vem do `className` (ex.: `size-14`, `w-full`); a proporção vem de
 * `ratio` quando a largura é fluida. Overlays (selos) entram como `children`.
 * Fotos vêm de CDNs externas dos marketplaces, por isso `<img>` com contêiner
 * de aspecto fixo (sem salto de layout), `loading="lazy"` e `priority` só para
 * o que está acima da dobra.
 */
export function ProductImage({
  src,
  alt,
  dimension,
  bundle = false,
  ratio,
  padding = 'md',
  priority = false,
  hoverZoom = false,
  fallbackLabel,
  className,
  children,
}: {
  src?: string | null;
  alt: string;
  /** Dimensão do produto (product_type): define a proporção e o rótulo do placeholder. */
  dimension?: CatalogDimension | null;
  /** Selo "Bundle" sobre a foto (só consoles). Ponto de extensão: passe quando o dado existir. */
  bundle?: boolean;
  /** Sobrescreve a proporção da dimensão. square = 1:1 | portrait = 4:5 | none = o className define a altura */
  ratio?: 'square' | 'portrait' | 'none';
  padding?: 'sm' | 'md';
  priority?: boolean;
  hoverZoom?: boolean;
  /** Texto curto exibido sob o ícone quando não há foto (ex.: plataforma). */
  fallbackLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;
  const finalRatio = ratio ?? ratioForDimension(dimension);
  const label = fallbackLabel ?? (dimension ? DIMENSIONS[dimension].label : undefined);

  return (
    <div
      className={cn(
        'group/pimg relative flex shrink-0 items-center justify-center overflow-hidden border',
        show
          ? 'border-[var(--color-border-subtle)] bg-[var(--color-media-bg)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]',
        finalRatio === 'square' && 'aspect-square',
        finalRatio === 'portrait' && 'aspect-[4/5]',
        className
      )}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 h-full w-full max-w-full object-contain object-center',
            padding === 'md' ? 'p-[8%]' : 'p-[4%]',
            hoverZoom &&
              'transition-transform duration-[var(--duration-medium)] group-hover:scale-[1.04] group-hover/pimg:scale-[1.04]'
          )}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 px-1 text-[var(--color-text-tertiary)]">
          <Tag className="size-[28%] min-h-4 min-w-4 max-h-10 max-w-10" aria-hidden />
          {label ? (
            <span
              aria-hidden
              className="text-center font-mono text-[10px] font-bold uppercase leading-tight tracking-wider"
            >
              {label}
            </span>
          ) : null}
          <span className="sr-only">{alt}</span>
        </div>
      )}
      {bundle && dimension === 'console' ? (
        <span className="absolute left-0 top-0 z-10 bg-[var(--color-accent-primary)] px-1.5 py-0.5 text-[10px] font-black uppercase leading-none tracking-wider text-[var(--color-text-inverse)]">
          Bundle
        </span>
      ) : null}
      {children}
    </div>
  );
}

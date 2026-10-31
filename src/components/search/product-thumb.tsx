'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Miniatura de produto: foto real com `contain` (capa nunca cortada) ou, sem
 * foto/em erro, um placeholder só de CSS com a sigla da plataforma. Nunca
 * reutiliza imagem de outro produto.
 */
export function ProductThumb({
  src,
  alt,
  fallbackLabel,
  className,
}: {
  src: string | null;
  alt: string;
  fallbackLabel: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]',
        className
      )}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-contain p-1"
        />
      ) : (
        <span
          aria-hidden
          className="px-1 text-center font-mono text-[10px] font-bold uppercase leading-tight tracking-wider text-[var(--color-text-tertiary)]"
        >
          {fallbackLabel}
        </span>
      )}
    </div>
  );
}

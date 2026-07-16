'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export type SceneTone = 'gold' | 'ember' | 'ink';
type SceneFocal = 'center' | 'top' | 'bottom' | 'left' | 'right';

const focalMap: Record<SceneFocal, string> = {
  center: 'object-center',
  top: 'object-top',
  bottom: 'object-bottom',
  left: 'object-left',
  right: 'object-right',
};

const toneStops: Record<SceneTone, string> = {
  gold: 'radial-gradient(80% 70% at 70% 30%, rgba(212,175,55,0.22) 0%, transparent 60%), radial-gradient(90% 80% at 30% 80%, rgba(20,16,10,0.9) 0%, rgba(6,5,4,1) 100%)',
  ember:
    'radial-gradient(70% 60% at 60% 30%, rgba(232,114,28,0.20) 0%, transparent 60%), radial-gradient(90% 80% at 30% 80%, rgba(30,16,8,0.85) 0%, rgba(6,5,4,1) 100%)',
  ink: 'radial-gradient(60% 60% at 50% 30%, rgba(242,233,216,0.08) 0%, transparent 60%), linear-gradient(180deg, rgba(11,9,8,1) 0%, rgba(6,5,4,1) 100%)',
};

/**
 * Superfície de imagem "cinematográfica" — renderiza uma foto real quando
 * `src` existe; se não existir (ou falhar o load), cai num fallback
 * atmosférico bonito (gradiente por tom + grain + selo "em produção") em vez
 * de um placeholder cinza genérico. Portado do padrão usado em outro
 * projeto (wemake/CinematicImage), adaptado pra paleta preto/dourado.
 *
 * Uso: seções institucionais/editoriais do site que ainda não têm fotografia
 * de produto real (ex: hero de colecionáveis, banners de universo). Pra
 * produto com foto real (jogos vindos do Mercado Livre), passar `src` normalmente.
 */
export function SceneImage({
  src,
  alt,
  tone = 'gold',
  focal = 'center',
  /**
   * 'cover' (padrão) = preenche o quadro, corta o excesso — certo pra imagem
   * atmosférica/decorativa (hero, mosaico de universos). 'contain' = nunca
   * corta, mostra a imagem inteira com respiro nas bordas se sobrar espaço —
   * obrigatório pra foto de produto real (capa de jogo), onde cortar a arte
   * não é aceitável.
   */
  fit = 'cover',
  caption,
  className,
  priority = false,
}: {
  src?: string | null;
  alt: string;
  tone?: SceneTone;
  focal?: SceneFocal;
  fit?: 'cover' | 'contain';
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  return (
    <div className={cn('relative size-full overflow-hidden', className)}>
      {!showFallback && src && (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          quality={88}
          sizes="(min-width: 1280px) 96vw, 100vw"
          onError={() => setErrored(true)}
          className={cn(fit === 'contain' ? 'object-contain p-4' : 'object-cover', focalMap[focal])}
        />
      )}

      {showFallback && (
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-0" style={{ background: toneStops[tone] }} />
          <div className="absolute inset-x-0 top-[58%] h-px bg-gradient-to-r from-transparent via-[var(--color-accent-primary)]/25 to-transparent" />
          <div
            className="absolute inset-0 mix-blend-overlay opacity-[0.08]"
            style={{
              backgroundImage:
                'url("data:image/svg+xml;utf8,<svg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>")',
            }}
          />
          <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)]/60 backdrop-blur px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-[var(--color-accent-primary)]/80" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              {caption ?? 'Foto institucional · em produção'}
            </span>
          </div>
          <span className="sr-only">{alt}</span>
        </div>
      )}
    </div>
  );
}

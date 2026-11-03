import Image from 'next/image';
import { Text } from '@/components/ui/text';

interface GameAboutSectionProps {
  synopsis?: { text: string; sourceName: string; sourceUrl: string; license: string; lang?: 'pt' | 'en' } | null;
  galleryImages: string[];
}

/**
 * "Sobre o jogo": sinopse com crédito da fonte e galeria real do catálogo.
 * A "Ficha Rápida" copiada do vendedor (gênero, "diversão garantida") foi
 * removida: era texto de anúncio, não informação do jogo.
 */
export function GameAboutSection({ synopsis, galleryImages }: GameAboutSectionProps) {
  if (!synopsis && galleryImages.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {synopsis && (
        <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
          <Text as="h3" variant="heading-sm" className="mb-3">
            {synopsis.lang === 'en' ? 'Sinopse em inglês' : 'Sinopse'}
          </Text>
          <Text variant="body-md" color="secondary" className="leading-relaxed" lang={synopsis.lang === 'en' ? 'en' : undefined}>
            {synopsis.text}
          </Text>
          <Text variant="caption" color="tertiary" className="mt-3">
            Fonte:{' '}
            <a href={synopsis.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {synopsis.sourceName}
            </a>{' '}
            ({synopsis.license})
          </Text>
        </div>
      )}

      {galleryImages.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {galleryImages.slice(0, 6).map((src) => (
            <li key={src}>
              <ChunkImage src={src} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChunkImage({ src }: { src: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
      <Image src={src} alt="" fill className="object-cover" sizes="(min-width: 640px) 33vw, 50vw" />
    </div>
  );
}

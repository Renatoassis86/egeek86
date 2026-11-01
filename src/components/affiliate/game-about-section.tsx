import Image from 'next/image';
import { ListChecks, CheckCircle2 } from 'lucide-react';
import { Text } from '@/components/ui/text';

interface GameAboutSectionProps {
  synopsis?: { text: string; sourceName: string; sourceUrl: string; license: string } | null;
  shortDescription?: string | null;
  features: string[];
  galleryImages: string[];
}

/**
 * "Sobre o jogo" em formato editorial — a descrição do catálogo (às vezes
 * um bloco único enorme misturando ficha técnica e narrativa, ex: bundle
 * com 3 jogos) vira cards curtos alternados com imagem real da galeria, em
 * vez de um parágrafo só. Ficha Rápida (features estruturadas do ML) fica
 * separada da narrativa, nunca misturada no mesmo bloco de texto.
 */
export function GameAboutSection({ synopsis, features, galleryImages }: GameAboutSectionProps) {
  if (!synopsis && features.length === 0 && galleryImages.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {synopsis && (
        <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
          <Text as="h3" variant="heading-sm" className="mb-3">
            Sinopse
          </Text>
          <Text variant="body-md" color="secondary" className="leading-relaxed">
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

      {features.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
          <Text as="h3" variant="heading-sm" className="mb-3 flex items-center gap-2">
            <ListChecks className="size-4 text-[var(--color-accent-primary)]" aria-hidden />
            Ficha Rápida
          </Text>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {features.map((feature, i) => (
              <li key={i} className="flex gap-2 text-body-sm text-[var(--color-text-secondary)]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-accent-primary)]" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
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
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
      <Image src={src} alt="" fill className="object-cover" sizes="(min-width: 640px) 33vw, 50vw" />
    </div>
  );
}

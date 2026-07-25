import Image from 'next/image';
import { ListChecks, CheckCircle2 } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { splitIntoStoryChunks } from '@/lib/text/split-into-story-chunks';

interface GameAboutSectionProps {
  shortDescription: string | null;
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
export function GameAboutSection({ shortDescription, features, galleryImages }: GameAboutSectionProps) {
  const chunks = shortDescription ? splitIntoStoryChunks(shortDescription) : [];
  if (chunks.length === 0 && features.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
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

      {chunks.length > 0 && (
        <div className="flex flex-col gap-4">
          {chunks.length > 1 && (
            <Text variant="label" color="tertiary">
              Um pouco da história
            </Text>
          )}
          {chunks.map((chunk, i) => {
            const image = galleryImages.length > 0 ? galleryImages[i % galleryImages.length] : null;
            const imageOnRight = i % 2 === 1;
            return (
              <div
                key={i}
                className={cn(
                  'grid gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6',
                  image && (imageOnRight ? 'sm:grid-cols-[1fr_180px] sm:items-center' : 'sm:grid-cols-[180px_1fr] sm:items-center')
                )}
              >
                {image && !imageOnRight && <ChunkImage src={image} />}
                <Text variant="body-md" color="secondary" className="leading-relaxed">
                  {chunk}
                </Text>
                {image && imageOnRight && <ChunkImage src={image} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChunkImage({ src }: { src: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
      <Image src={src} alt="" fill className="object-cover" sizes="180px" />
    </div>
  );
}

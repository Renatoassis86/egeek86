import { cn } from '@/lib/cn';

/**
 * Recorta uma imagem dentro do próprio glifo tipográfico da marca (mesma
 * fonte usada em headings/logo — var(--font-display), Geist 700), em vez de
 * uma interpretação geométrica bold desenhada à mão (LetterMask antigo).
 * Pedido explícito do cliente: "letras grandes em caixa alta e as imagens
 * escaladas dentro", não um bloco/figura destoando da fonte da marca.
 *
 * Técnica: background-clip: text (suportado em todo engine Chromium/Firefox/
 * Safari moderno) — a imagem vira o "preenchimento" do texto via
 * background-image + color transparente, sem precisar de SVG/mask manual.
 */
export function TextImageMask({
  text,
  src,
  className,
  outline = false,
}: {
  text: string;
  src: string;
  className?: string;
  outline?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block bg-cover bg-center uppercase leading-none', className)}
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        backgroundImage: `url(${src})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        WebkitTextStrokeWidth: outline ? '2px' : undefined,
        WebkitTextStrokeColor: outline ? 'var(--color-accent-primary)' : undefined,
      }}
    >
      {text}
    </span>
  );
}

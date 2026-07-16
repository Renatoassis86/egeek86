import { cn } from '@/lib/cn';

type GlowColor = 'gold' | 'hype' | 'cream';
type GlowSize = 'sm' | 'md' | 'lg' | 'xl';

// Trincas RGB (não hex) pra funcionar com rgb(r g b / alpha) — mantidas em
// sincronia manual com --color-accent-primary/--color-accent-hype/--color-text-primary
// em globals.css. Se a paleta mudar lá, atualizar aqui também.
const colorMap: Record<GlowColor, string> = {
  gold: '212 175 55',
  hype: '232 114 28',
  cream: '242 233 216',
};

const sizeMap: Record<GlowSize, string> = {
  sm: 'size-64',
  md: 'size-[28rem]',
  lg: 'size-[44rem]',
  xl: 'size-[64rem]',
};

/**
 * Bloom de luz ambiente — 1-2 por seção, posicionado absoluto (ex: "-top-40
 * -right-20"), pra dar atmosfera/profundidade sem virar decoração genérica.
 * Portado do padrão usado em outro projeto (wemake), adaptado pra paleta
 * preto/dourado do Espaço Geek 86.
 */
export function Glow({
  color = 'gold',
  size = 'lg',
  intensity = 0.35,
  className,
}: {
  color?: GlowColor;
  size?: GlowSize;
  intensity?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute rounded-full blur-3xl motion-reduce:hidden',
        sizeMap[size],
        className
      )}
      style={{
        background: `radial-gradient(closest-side, rgb(${colorMap[color]} / ${intensity}) 0%, rgb(${colorMap[color]} / 0) 70%)`,
      }}
    />
  );
}

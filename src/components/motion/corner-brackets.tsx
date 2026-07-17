import { cn } from '@/lib/cn';

/**
 * Cantos estilo HUD/terminal de dados — o toque "desconstruído" pedido pro
 * tratamento de imagens (evoca cockpit/trading terminal sem virar poluição
 * visual). 4 marcas em L, absolutas, nos cantos do container relativo mais
 * próximo. Puramente decorativo — `aria-hidden`.
 */
export function CornerBrackets({
  inset = 16,
  size = 28,
  className,
}: {
  inset?: number;
  size?: number;
  className?: string;
}) {
  const common = 'absolute border-[var(--color-accent-primary)]/60';
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0', className)}>
      <span className={cn(common, 'border-t-2 border-l-2')} style={{ top: inset, left: inset, width: size, height: size }} />
      <span className={cn(common, 'border-t-2 border-r-2')} style={{ top: inset, right: inset, width: size, height: size }} />
      <span className={cn(common, 'border-b-2 border-l-2')} style={{ bottom: inset, left: inset, width: size, height: size }} />
      <span className={cn(common, 'border-b-2 border-r-2')} style={{ bottom: inset, right: inset, width: size, height: size }} />
    </div>
  );
}

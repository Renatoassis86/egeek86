import { cn } from '@/lib/cn';

/**
 * Decoração de fundo estilo trilha de circuito impresso (linhas retas com
 * curva em ângulo reto + "solda" nos vértices) — motivo visual reutilizável
 * pedido pelo cliente pra usar em várias seções, não só uma. Puramente
 * decorativo (aria-hidden, pointer-events-none), atrás do conteúdo.
 */
export function CircuitLines({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 1200 600"
      preserveAspectRatio="none"
      fill="none"
    >
      <g stroke="var(--color-accent-primary)" strokeOpacity="0.16" strokeWidth="1.5">
        <path d="M-20,80 H220 V220 H520 V80 H900 V320" />
        <path d="M1220,180 H980 V60 H700" />
        <path d="M-20,460 H180 V540 H460 V420 H820 V520 H1220" />
        <path d="M340,600 V480 H600 V560" />
      </g>
      <g fill="var(--color-accent-primary)" fillOpacity="0.5">
        <circle cx="220" cy="80" r="3" />
        <circle cx="520" cy="220" r="3" />
        <circle cx="520" cy="80" r="3" />
        <circle cx="900" cy="80" r="3" />
        <circle cx="900" cy="320" r="3" />
        <circle cx="980" cy="180" r="3" />
        <circle cx="700" cy="60" r="3" />
        <circle cx="180" cy="460" r="3" />
        <circle cx="180" cy="540" r="3" />
        <circle cx="460" cy="540" r="3" />
        <circle cx="460" cy="420" r="3" />
        <circle cx="820" cy="420" r="3" />
        <circle cx="820" cy="520" r="3" />
        <circle cx="340" cy="480" r="3" />
        <circle cx="600" cy="480" r="3" />
      </g>
    </svg>
  );
}

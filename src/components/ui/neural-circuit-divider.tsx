import { cn } from '@/lib/cn';

interface NeuralCircuitDividerProps {
  className?: string;
  variant?: 'gold' | 'emerald' | 'purple' | 'subtle';
}

export function NeuralCircuitDivider({ className, variant = 'gold' }: NeuralCircuitDividerProps) {
  const strokeColor =
    variant === 'emerald'
      ? 'text-emerald-500'
      : variant === 'purple'
      ? 'text-purple-500'
      : variant === 'subtle'
      ? 'text-zinc-400'
      : 'text-blue-400';

  return (
    <div className={cn('relative w-full py-4 flex items-center justify-center overflow-hidden pointer-events-none select-none', className)}>
      {/* Linha Divisória Horizontal Base com Fade Gradiente nas Pontas */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-gradient-to-r from-transparent via-blue-500/25 to-transparent opacity-60" />

      {/* SVG de Redes Neurais e Circuitos Eletrônicos (Muito Transparente e Clean) */}
      <svg
        aria-hidden="true"
        className={cn('relative z-10 h-8 w-full max-w-5xl opacity-20 dark:opacity-30', strokeColor)}
        viewBox="0 0 1000 40"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Trilhas de Circuito Eletrônico com Ângulos de 45° */}
        <path
          d="M 50,20 L 250,20 L 280,10 L 420,10 L 440,20 L 480,20"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="4 2"
        />
        <path
          d="M 950,20 L 750,20 L 720,30 L 580,30 L 560,20 L 520,20"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="4 2"
        />

        {/* Nós de Redes Neurais (Conexões Interligadas) */}
        <line x1="420" y1="10" x2="460" y2="30" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
        <line x1="580" y1="30" x2="540" y2="10" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />

        {/* Soldas e Nós Circulares de Entrada/Saída */}
        <circle cx="280" cy="10" r="2.5" fill="currentColor" />
        <circle cx="420" cy="10" r="2.5" fill="currentColor" />
        <circle cx="440" cy="20" r="2.5" fill="currentColor" />
        <circle cx="460" cy="30" r="2.5" fill="currentColor" />

        <circle cx="720" cy="30" r="2.5" fill="currentColor" />
        <circle cx="580" cy="30" r="2.5" fill="currentColor" />
        <circle cx="560" cy="20" r="2.5" fill="currentColor" />
        <circle cx="540" cy="10" r="2.5" fill="currentColor" />

        {/* Emblema Central do Nó Mestre de Inteligência (Neural Hub Node) */}
        <circle cx="500" cy="20" r="6" fill="currentColor" opacity="0.2" />
        <circle cx="500" cy="20" r="3.5" fill="currentColor" />
        <circle cx="500" cy="20" r="1.5" fill="#ffffff" />
      </svg>
    </div>
  );
}

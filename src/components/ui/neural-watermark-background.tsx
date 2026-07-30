import { cn } from '@/lib/cn';

interface NeuralWatermarkBackgroundProps {
  className?: string;
}

export function NeuralWatermarkBackground({ className }: NeuralWatermarkBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-0 z-0 overflow-hidden select-none opacity-10 dark:opacity-15 transition-opacity',
        className
      )}
    >
      {/* Marca d'água 1: Emblema "EG86" Gigante no Canto Superior Direito */}
      <div className="absolute -top-12 -right-16 text-[220px] font-black tracking-tighter text-blue-500/30 leading-none filter blur-[1px]">
        EG86
      </div>

      {/* Marca d'água 2: Texto Institucional "ESPAÇO GEEK 86" Diagonal no Centro */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 whitespace-nowrap text-[120px] sm:text-[160px] font-black uppercase tracking-[0.2em] text-zinc-400/20 dark:text-blue-400/10 pointer-events-none">
        ESPAÇO GEEK 86
      </div>

      {/* Marca d'água 3: Marca d'água "ARKOS INTELLIGENCE" no Canto Inferior Esquerdo */}
      <div className="absolute -bottom-10 -left-10 text-[140px] font-black tracking-widest uppercase text-purple-500/20 filter blur-[1px]">
        ARKOS
      </div>

      {/* Brush de Circuitos Eletrônicos & Nós de Redes Neurais (Fundo Transparente) */}
      <svg
        className="absolute inset-0 h-full w-full stroke-blue-500/20 dark:stroke-blue-400/20"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="none"
      >
        <g strokeWidth="1" strokeDasharray="6 3">
          <path d="M -50,150 L 300,150 L 350,200 L 700,200 L 750,100 L 1250,100" />
          <path d="M -50,550 L 200,550 L 250,450 L 600,450 L 650,600 L 1250,600" />
          <line x1="350" y1="200" x2="250" y2="450" strokeWidth="0.5" opacity="0.5" />
          <line x1="750" y1="100" x2="650" y2="600" strokeWidth="0.5" opacity="0.5" />
        </g>
        <g fill="currentColor" opacity="0.6">
          <circle cx="300" cy="150" r="4" />
          <circle cx="350" cy="200" r="4" />
          <circle cx="700" cy="200" r="4" />
          <circle cx="750" cy="100" r="4" />
          <circle cx="200" cy="550" r="4" />
          <circle cx="250" cy="450" r="4" />
          <circle cx="600" cy="450" r="4" />
          <circle cx="650" cy="600" r="4" />
        </g>
      </svg>
    </div>
  );
}

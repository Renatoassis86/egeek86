'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

// Fim da campanha: 27/11/2026 23:59:59 em Brasília (UTC-3).
export const FIM_BLACK_FRIDAY = '2026-11-27T23:59:59-03:00';

function restante(alvo: number) {
  const ms = alvo - Date.now();
  if (ms <= 0) return null;
  return {
    dias: Math.floor(ms / 86_400_000),
    horas: Math.floor((ms / 3_600_000) % 24),
    minutos: Math.floor((ms / 60_000) % 60),
  };
}

/**
 * Contagem regressiva até o fim da Black Friday (27/11). Renderiza só no cliente
 * depois de montar (evita divergência de hidratação) e reserva a altura da linha
 * para não deslocar o layout. Some quando a data passa.
 */
export function ContagemBlackFriday({ className }: { className?: string }) {
  const [tempo, setTempo] = useState<ReturnType<typeof restante> | undefined>(undefined);

  useEffect(() => {
    const alvo = new Date(FIM_BLACK_FRIDAY).getTime();
    const atualizar = () => setTempo(restante(alvo));
    atualizar();
    const id = window.setInterval(atualizar, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (tempo === null) return null;

  return (
    <p className={cn('min-h-[1.5rem] text-[14px] tabular-nums text-[var(--color-text-secondary)]', className)} aria-live="off">
      {tempo
        ? `Termina em ${tempo.dias} d ${String(tempo.horas).padStart(2, '0')} h ${String(tempo.minutos).padStart(2, '0')} min (27/11)`
        : ''}
    </p>
  );
}

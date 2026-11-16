'use client';

import { useEffect, useState } from 'react';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

interface HypeCountdownProps {
  targetDate: Date | string;
  onComplete?: () => void;
  className?: string;
}

export function HypeCountdown({ targetDate, onComplete, className }: HypeCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
    isOver: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
    isOver: false,
  });

  useEffect(() => {
    const targetTime = new Date(targetDate).getTime();

    const calculateTimeLeft = () => {
      const difference = targetTime - Date.now();
      
      if (difference <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          milliseconds: 0,
          isOver: true,
        });
        if (onComplete) onComplete();
        return false;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      const milliseconds = Math.floor((difference % 1000) / 10); // mostra dois dígitos (00-99)

      setTimeLeft({ days, hours, minutes, seconds, milliseconds, isOver: false });
      return difference < 1000 * 60 * 60 * 24; // retorna true se faltar menos de 24 horas (precisa de atualizações rápidas para milissegundos)
    };

    // Primeira checagem
    const isUnder24h = calculateTimeLeft();
    
    // Configura o intervalo com base na urgência
    // Se faltar menos de 24h, atualiza em alta taxa (50ms) para dar o efeito de milissegundos girando rápida e organicamente
    const intervalTime = isUnder24h ? 50 : 1000;
    
    const interval = setInterval(() => {
      const under24h = calculateTimeLeft();
      // Se o estado mudar dinamicamente de acima de 24h para abaixo, recriamos o intervalo
      if (under24h && intervalTime === 1000) {
        clearInterval(interval);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [targetDate, onComplete]);

  if (timeLeft.isOver) {
    return (
      <div className={cn('animate-pulse flex items-center justify-center gap-2 text-[var(--color-accent-hype)] font-bold uppercase tracking-wider', className)}>
        <span className="size-2 rounded-full bg-[var(--color-accent-hype)]" />
        Drop Liberado!
      </div>
    );
  }

  const isCritical = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes < 15;
  const isMilisecondRange = timeLeft.days === 0 && timeLeft.hours < 24;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        {/* Bloco de Dias (somente se dias > 0) */}
        {timeLeft.days > 0 && (
          <>
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
                <Text variant="mono-lg" className="text-xl font-bold">
                  {timeLeft.days.toString().padStart(2, '0')}
                </Text>
              </div>
              <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">Dias</span>
            </div>
            <span className="h-12 flex items-center text-xl font-bold text-[var(--color-text-tertiary)]">:</span>
          </>
        )}

        {/* Bloco de Horas */}
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
            <Text variant="mono-lg" className="text-xl font-bold">
              {timeLeft.hours.toString().padStart(2, '0')}
            </Text>
          </div>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">Horas</span>
        </div>

        <span className="h-12 flex items-center text-xl font-bold text-[var(--color-text-tertiary)]">:</span>

        {/* Bloco de Minutos */}
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
            <Text variant="mono-lg" className="text-xl font-bold">
              {timeLeft.minutes.toString().padStart(2, '0')}
            </Text>
          </div>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">Min</span>
        </div>

        <span className="h-12 flex items-center text-xl font-bold text-[var(--color-text-tertiary)]">:</span>

        {/* Bloco de Segundos */}
        <div className="flex flex-col items-center">
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)] transition-all",
            isCritical && "border-[var(--color-accent-hype)] bg-[var(--color-accent-hype)]/5"
          )}>
            <Text variant="mono-lg" className={cn("text-xl font-bold", isCritical && "text-[var(--color-accent-hype)]")}>
              {timeLeft.seconds.toString().padStart(2, '0')}
            </Text>
          </div>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">Seg</span>
        </div>

        {/* Bloco de Milissegundos (somente se faltar menos de 24 horas) */}
        {isMilisecondRange && (
          <>
            <span className="h-12 flex items-center text-xl font-bold text-[var(--color-text-tertiary)]">:</span>
            <div className="flex flex-col items-center">
              <div className={cn(
                "flex h-12 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] opacity-75"
              )}>
                <Text variant="mono-lg" className="text-base font-medium text-[var(--color-text-secondary)]">
                  {timeLeft.milliseconds.toString().padStart(2, '0')}
                </Text>
              </div>
              <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">Ms</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

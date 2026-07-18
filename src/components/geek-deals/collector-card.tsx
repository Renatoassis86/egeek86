'use client';

import { Star, ShieldAlert, Award, UserCheck } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { CollectorInfo } from '@/server/queries/hype';

interface CollectorCardProps {
  collector: CollectorInfo | null;
  className?: string;
}

export function CollectorCard({ collector, className }: CollectorCardProps) {
  if (!collector) {
    return (
      <Card className={cn('bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)]', className)}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-[var(--color-text-tertiary)]">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <Text variant="body-sm" className="font-semibold text-[var(--color-text-primary)]">
              Curadoria Espaço Geek 86
            </Text>
            <Text variant="caption" color="tertiary">
              Item oficial inspecionado pela nossa equipe.
            </Text>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Define cores de badges baseados no nível do colecionador
  const badgeColors: Record<string, string> = {
    Lendário: 'text-[var(--color-accent-hype)] border-[var(--color-accent-hype)]/30 bg-[var(--color-accent-hype)]/5',
    Mestre: 'text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5',
    Veterano: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
    Explorador: 'text-green-400 border-green-400/30 bg-green-400/5',
    Iniciante: 'text-zinc-400 border-zinc-400/30 bg-zinc-400/5',
  };

  const currentBadgeColor = badgeColors[collector.badgeName] || badgeColors.Iniciante;

  return (
    <Card className={cn('bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)] shadow-[var(--shadow-sm)]', className)}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[9px]">
            Colecionador Vendedor
          </Text>
          <div className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            currentBadgeColor
          )}>
            <Award className="size-3" />
            {collector.badgeName}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Avatar (simulado se nulo) */}
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-inset)] border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] font-bold text-sm">
            {collector.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={collector.avatarUrl} alt={collector.displayName} className="h-full w-full rounded-full object-cover" />
            ) : (
              collector.displayName.charAt(0)
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]">
              <UserCheck className="size-2.5" />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <Text variant="body-sm" className="font-bold truncate text-[var(--color-text-primary)]">
              {collector.displayName}
            </Text>
            
            {/* Avaliação e Reviews */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex items-center text-[var(--color-accent-primary)]">
                <Star className="size-3 fill-current" />
                <span className="ml-1 text-xs font-mono font-bold text-[var(--color-text-primary)]">
                  {collector.avgRating.toFixed(1)}
                </span>
              </div>
              <span className="text-[var(--color-text-tertiary)] text-[10px]">·</span>
              <Text variant="caption" color="tertiary">
                {collector.totalReviews} avaliações
              </Text>
            </div>
          </div>
        </div>

        {/* Informações adicionais do colecionador */}
        <div className="text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-bg-inset)] rounded-[var(--radius-sm)] p-2 font-mono flex flex-col gap-1 border border-[var(--color-border-subtle)]">
          <div>Geek Points: <span className="text-[var(--color-accent-primary)] font-bold">{collector.geekPoints} XP</span></div>
          <div>Envio Pontual: <span className="text-[var(--color-accent-success)] font-bold">100%</span></div>
        </div>
      </CardContent>
    </Card>
  );
}

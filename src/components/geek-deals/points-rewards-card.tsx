'use client';

import { useState, useTransition } from 'react';
import { Award, Sparkles, CheckCircle2, Ticket } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { convertPointsToDiscount } from '@/server/actions/curation';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';

interface PointsRewardsCardProps {
  geekPoints: number;
  activeCoupons: Array<{
    code: string;
    amount: number;
    pointsUsed: number;
    createdAt: string;
    status: string;
  }>;
  isAuthenticated: boolean;
  className?: string;
}

export function PointsRewardsCard({
  geekPoints,
  activeCoupons,
  isAuthenticated,
  className,
}: PointsRewardsCardProps) {
  const [isPending, startTransition] = useTransition();
  const [pointsToConvert, setPointsToConvert] = useState(100);

  // Calcula conversão estilo milhas (100 pontos = R$ 1.00)
  const totalDiscountAvailable = geekPoints / 100;
  const currentConversionValue = pointsToConvert / 100;

  const handleConvert = () => {
    if (!isAuthenticated) {
      toast.error('Faça login para converter seus pontos.');
      return;
    }

    if (geekPoints < pointsToConvert) {
      toast.error('Saldo de Geek Points insuficiente.');
      return;
    }

    startTransition(async () => {
      const res = await convertPointsToDiscount(pointsToConvert);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        // Reseta o seletor para o mínimo
        setPointsToConvert(100);
      }
    });
  };

  if (!isAuthenticated) {
    return (
      <Card className={cn('bg-[var(--color-bg-inset)]/50 border-[var(--color-border-subtle)]', className)}>
        <CardContent className="p-6 text-center flex flex-col items-center gap-3">
          <Award className="size-10 text-[var(--color-text-tertiary)] animate-pulse" />
          <Text variant="body-sm" className="font-semibold">Resgate de Milhas Geek</Text>
          <Text variant="caption" color="secondary" className="max-w-[28ch]">
            Faça login para ver seu saldo de Geek Points e convertê-los em descontos.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-gradient-to-br from-[var(--color-bg-surface)] to-[var(--color-bg-inset)] border-[var(--color-border-default)] shadow-[var(--shadow-md)] overflow-hidden relative', className)}>
      {/* Detalhes de brilho decorativos */}
      <div className="absolute -top-10 -right-10 size-24 rounded-full bg-[var(--color-accent-primary)]/5 blur-xl pointer-events-none" />

      <CardContent className="p-6 flex flex-col gap-5">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
              <Award className="size-5" />
            </div>
            <div>
              <Text variant="body-sm" className="font-bold text-[var(--color-text-primary)]">
                Minhas Milhas Geek
              </Text>
              <Text variant="caption" color="tertiary" className="text-[10px]">
                Programa de fidelidade Espaço Geek 86
              </Text>
            </div>
          </div>
          <Text variant="mono-lg" className="text-2xl font-black text-[var(--color-accent-primary)]">
            {geekPoints} <span className="text-xs font-sans font-semibold text-[var(--color-text-tertiary)]">XP</span>
          </Text>
        </div>

        {/* Equivalente em Dinheiro */}
        <div className="bg-[var(--color-bg-inset)]/60 border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] p-4 flex justify-between items-center">
          <div>
            <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[8px] block">
              Valor Disponível para Resgate
            </Text>
            <Text variant="body-md" className="font-bold text-[var(--color-text-primary)] mt-0.5">
              {formatBRL(totalDiscountAvailable * 100)} de desconto
            </Text>
          </div>
          <div className="flex items-center text-[var(--color-accent-success)] gap-1 text-xs font-semibold">
            <Sparkles className="size-3.5" />
            100 XP = R$ 1,00
          </div>
        </div>

        {/* Formulário de Resgate */}
        {geekPoints >= 100 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex justify-between">
                <span>Escolha a quantidade para resgatar</span>
                <span className="text-[var(--color-text-primary)] font-mono font-bold">{pointsToConvert} XP</span>
              </label>
              
              <input
                type="range"
                min={100}
                max={Math.floor(geekPoints / 100) * 100}
                step={100}
                value={pointsToConvert}
                onChange={(e) => setPointsToConvert(parseInt(e.target.value) || 100)}
                className="w-full h-1.5 rounded-lg bg-[var(--color-bg-inset)] accent-[var(--color-accent-primary)] cursor-pointer"
              />
            </div>

            <Button
              onClick={handleConvert}
              disabled={isPending}
              variant="primary"
              size="sm"
              className="w-full font-bold h-9"
            >
              {isPending ? 'Gerando Cupom...' : `Gerar Cupom de R$ ${currentConversionValue.toFixed(2)}`}
            </Button>
          </div>
        ) : (
          <Text variant="caption" color="tertiary" className="text-center italic text-[11px] py-1">
            Acumule pelo menos 100 XP curando itens para liberar cupons de desconto.
          </Text>
        )}

        {/* Cupons Ativos do Usuário */}
        {activeCoupons.length > 0 && (
          <div className="border-t border-[var(--color-border-subtle)] pt-4 flex flex-col gap-2">
            <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[9px] mb-1 block">
              Cupons Ativos ({activeCoupons.length})
            </Text>
            <div className="flex flex-col gap-2 max-h-36 overflow-y-auto pr-1">
              {activeCoupons.map((coupon, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-2 rounded-[var(--radius-sm)] text-xs relative overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <Ticket className="size-3.5 text-[var(--color-accent-primary)]" />
                    <div>
                      <span className="font-mono font-bold text-[var(--color-text-primary)] tracking-wide">{coupon.code}</span>
                      <span className="text-[9px] text-[var(--color-text-tertiary)] block">Equivale a {coupon.pointsUsed} XP</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[var(--color-accent-success)]">
                      {formatBRL(coupon.amount * 100)}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(coupon.code);
                        toast.success('Código do cupom copiado!');
                      }}
                      className="text-[10px] text-[var(--color-accent-primary)] font-semibold hover:underline bg-[var(--color-accent-primary)]/5 px-2 py-0.5 rounded border border-[var(--color-accent-primary)]/20"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

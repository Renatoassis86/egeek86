'use client';

import { useState, useEffect, useCallback } from 'react';
import { Ticket, Copy, Check, ChevronUp, ChevronDown, Sparkles, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DisplayCoupon } from '@/server/queries/affiliate';

export function CouponCarousel({ coupons }: { coupons: DisplayCoupon[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const total = coupons.length;

  const nextCoupon = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevCoupon = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  useEffect(() => {
    if (total <= 1 || isPaused) return;
    const interval = setInterval(nextCoupon, 3500);
    return () => clearInterval(interval);
  }, [nextCoupon, total, isPaused]);

  if (!coupons || total === 0) return null;

  const coupon = coupons[activeIndex];

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      toast.success(`Cupom ${code} copiado para a área de transferência!`);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      toast.error('Não foi possível copiar o código.');
    }
  };

  const discountLabel =
    coupon.discountType === 'percentage'
      ? `${coupon.discountValue}% OFF`
      : `${formatBRL(coupon.discountValue * 100)} OFF`;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full max-w-full sm:max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/90 p-3.5 sm:p-4 shadow-2xl backdrop-blur-xl transition-all hover:border-[var(--color-accent-primary)]/60 min-w-0"
    >
      {/* Glow de fundo por loja */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full blur-3xl opacity-20 transition-all duration-500"
        style={{ backgroundColor: coupon.networkColorHex || '#D4AF37' }}
      />

      {/* Header do Card */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-3 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className="size-2.5 rounded-full shrink-0 animate-pulse"
            style={{ backgroundColor: coupon.networkColorHex || '#D4AF37' }}
          />
          <Badge
            variant="outline"
            className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-[var(--color-bg-inset)] border-[var(--color-border-subtle)] text-[var(--color-text-primary)] truncate max-w-[110px] sm:max-w-none"
          >
            {coupon.networkName}
          </Badge>
          {coupon.badgeText && (
            <Badge variant="hype" size="sm" className="text-[10px] gap-1 py-0 px-1.5 font-bold uppercase tracking-wider truncate max-w-[90px] sm:max-w-none">
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">{coupon.badgeText}</span>
            </Badge>
          )}
        </div>

        {/* Controles de Navegação */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={prevCoupon}
            aria-label="Cupom anterior"
            className="size-7 rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <ChevronUp className="size-4" />
          </Button>
          <span className="text-[11px] font-mono font-bold text-[var(--color-text-tertiary)] px-0.5">
            {activeIndex + 1}/{total}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={nextCoupon}
            aria-label="Próximo cupom"
            className="size-7 rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>
      </div>

      {/* Conteúdo Principal do Cupom */}
      <div key={coupon.id} className="my-3 flex flex-col gap-2 transition-all duration-300 animate-fadeIn min-w-0">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-xl sm:text-2xl font-black tracking-tight text-[var(--color-accent-primary)] font-mono truncate">
            {discountLabel}
          </span>
          {coupon.minOrderCents && (
            <span className="text-[10px] sm:text-[11px] font-medium text-[var(--color-text-tertiary)] shrink-0">
              Mín. {formatBRL(coupon.minOrderCents)}
            </span>
          )}
        </div>

        {coupon.description && (
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)] line-clamp-2">
            {coupon.description}
          </p>
        )}
      </div>

      {/* Caixa do Código + Botão Copiar */}
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-accent-primary)]/50 bg-[var(--color-bg-inset)] p-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Ticket className="size-4 text-[var(--color-accent-primary)] shrink-0" aria-hidden />
          <span className="font-mono text-sm font-black tracking-wider text-[var(--color-text-primary)] truncate">
            {coupon.code}
          </span>
        </div>
        <Button
          size="sm"
          variant={copiedId === coupon.id ? 'secondary' : 'primary'}
          className={cn(
            'h-8 px-3 text-xs font-bold gap-1.5 shrink-0 transition-all',
            copiedId === coupon.id && 'bg-[var(--color-accent-success)]/20 text-[var(--color-accent-success)] border border-[var(--color-accent-success)]/40'
          )}
          onClick={() => handleCopy(coupon.code, coupon.id)}
        >
          {copiedId === coupon.id ? (
            <>
              <Check className="size-3.5" /> Copiado!
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copiar
            </>
          )}
        </Button>
      </div>

      {/* Barra de Progresso / Indicadores */}
      <div className="mt-3 flex justify-center gap-1.5">
        {coupons.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            aria-label={`Ir para cupom ${idx + 1}`}
            className={cn(
              'h-1 rounded-full transition-all',
              idx === activeIndex
                ? 'w-6 bg-[var(--color-accent-primary)]'
                : 'w-2 bg-[var(--color-border-subtle)] hover:bg-[var(--color-text-tertiary)]'
            )}
          />
        ))}
      </div>
    </div>
  );
}

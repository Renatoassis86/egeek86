'use client';

import { useState, useEffect, useCallback } from 'react';
import { Ticket, Copy, Check, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
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
      className="relative w-full max-w-full sm:max-w-sm overflow-hidden rounded-[var(--radius-xl)] border-2 border-emerald-500/50 bg-[#04261c] text-white p-4 sm:p-5 shadow-2xl backdrop-blur-xl transition-all hover:border-emerald-400 hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] min-w-0"
    >
      {/* Glow verde de fundo */}
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-500/20 blur-3xl transition-all duration-500" />

      {/* Header do Card */}
      <div className="flex items-center justify-between gap-2 border-b border-emerald-800/60 pb-3 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="size-2.5 rounded-full shrink-0 animate-pulse bg-emerald-400" />
          <span className="text-[11px] font-black uppercase tracking-wider bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 px-2.5 py-0.5 rounded-md truncate max-w-[120px] sm:max-w-none">
            {coupon.networkName}
          </span>
          {coupon.badgeText && (
            <Badge className="text-[10px] gap-1 py-0 px-1.5 font-bold uppercase tracking-wider bg-blue-500 text-black border-blue-400 truncate max-w-[90px] sm:max-w-none">
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">{coupon.badgeText}</span>
            </Badge>
          )}
        </div>

        {/* Controles de Navegação */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={prevCoupon}
            aria-label="Cupom anterior"
            className="size-7 rounded-full bg-emerald-900/60 hover:bg-emerald-500 hover:text-black text-emerald-300 flex items-center justify-center transition-all"
          >
            <ChevronUp className="size-4" />
          </button>
          <span className="text-[11px] font-mono font-bold text-emerald-300 px-1">
            {activeIndex + 1}/{total}
          </span>
          <button
            onClick={nextCoupon}
            aria-label="Próximo cupom"
            className="size-7 rounded-full bg-emerald-900/60 hover:bg-emerald-500 hover:text-black text-emerald-300 flex items-center justify-center transition-all"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      {/* Conteúdo Principal do Cupom */}
      <div key={coupon.id} className="my-3 flex flex-col gap-1.5 transition-all duration-300 animate-fadeIn min-w-0">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-400 font-mono truncate drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
            {discountLabel}
          </span>
          {coupon.minOrderCents && (
            <span className="text-[10px] sm:text-[11px] font-mono text-emerald-200/80 shrink-0">
              Mín. {formatBRL(coupon.minOrderCents)}
            </span>
          )}
        </div>

        {coupon.description && (
          <p className="text-xs leading-relaxed text-emerald-100/90 font-medium line-clamp-2">
            {coupon.description}
          </p>
        )}
      </div>

      {/* Caixa do Código + Botão Copiar */}
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-emerald-400/60 bg-black/40 p-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Ticket className="size-4 text-emerald-400 shrink-0" aria-hidden />
          <span className="font-mono text-base font-black tracking-widest text-blue-300 truncate">
            {coupon.code}
          </span>
        </div>
        <Button
          size="sm"
          className={cn(
            'h-8 px-3.5 text-xs font-black gap-1.5 shrink-0 transition-all shadow-md',
            copiedId === coupon.id
              ? 'bg-blue-400 text-black border border-blue-300'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400'
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
              'h-1.5 rounded-full transition-all duration-300',
              idx === activeIndex
                ? 'w-7 bg-emerald-400 shadow-[0_0_8px_#34d399]'
                : 'w-2 bg-emerald-900 hover:bg-emerald-700'
            )}
          />
        ))}
      </div>
    </div>
  );
}

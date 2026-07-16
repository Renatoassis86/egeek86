'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';

/**
 * Número de preço que pisca em verde/vermelho quando o valor muda — a
 * resposta concreta pro pedido de "tela mais animada, menos chata" no
 * monitoramento. Some sozinho depois de ~700ms, sem estado permanente.
 */
export function AnimatedPrice({ cents, className }: { cents: number; className?: string }) {
  const prevRef = useRef(cents);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (cents !== prevRef.current) {
      setFlash(cents > prevRef.current ? 'up' : 'down');
      prevRef.current = cents;
      const timeout = setTimeout(() => setFlash(null), 700);
      return () => clearTimeout(timeout);
    }
  }, [cents]);

  return (
    <motion.span
      animate={{
        // Preço de compra: queda pisca verde (boa notícia), alta pisca vermelho (ruim).
        backgroundColor:
          flash === 'down'
            ? 'rgb(16 185 129 / 0.18)'
            : flash === 'up'
              ? 'rgb(239 68 68 / 0.18)'
              : 'rgb(0 0 0 / 0)',
      }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className={cn('inline-block rounded-[var(--radius-xs)] px-1 tabular', className)}
    >
      {formatBRL(cents)}
    </motion.span>
  );
}

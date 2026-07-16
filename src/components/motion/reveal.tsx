'use client';

import { motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { fadeUp } from '@/lib/motion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Defina como false para animar a entrada sempre (não só na viewport). */
  inView?: boolean;
}

/**
 * Reveal — anima opacity+translateY quando entra na viewport.
 * Respeita prefers-reduced-motion zerando a duração da transição (em vez de
 * trocar pra um <div> simples) — useReducedMotion() retorna null no SSR e só
 * resolve o valor real após o mount, então alternar o TIPO de elemento com
 * base nisso causava mismatch de hidratação (React descartava o subtree
 * inteiro, deixando seções da página em branco pra quem tem essa preferência
 * ativa). Manter sempre o mesmo motion.div e só zerar a transição é seguro:
 * isso é resolvido em tempo de animação, não na marcação inicial.
 */
export function Reveal({ children, className, delay = 0, inView = true }: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="initial"
      whileInView={inView ? 'animate' : undefined}
      animate={inView ? undefined : 'animate'}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ delay: reduce ? 0 : delay, duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

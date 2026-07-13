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
 * Respeita prefers-reduced-motion.
 */
export function Reveal({ children, className, delay = 0, inView = true }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="initial"
      whileInView={inView ? 'animate' : undefined}
      animate={inView ? undefined : 'animate'}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

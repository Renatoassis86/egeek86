/**
 * Motion presets reutilizáveis para Framer Motion.
 *
 * Importe variants daqui SEMPRE — nunca inline.
 * Sempre verifique prefers-reduced-motion via `usePrefersReducedMotion()`.
 */

import type { Transition, Variants } from 'framer-motion';
import { duration, easing, spring } from '@/design-system/tokens/motion';

/* ============================================================
 * TRANSITIONS — combinações de duração + easing reutilizáveis.
 * ============================================================ */

export const transition = {
  fast: { duration: duration.fast / 1000, ease: easing.out } satisfies Transition,
  base: { duration: duration.base / 1000, ease: easing.out } satisfies Transition,
  medium: { duration: duration.medium / 1000, ease: easing.out } satisfies Transition,
  slow: { duration: duration.slow / 1000, ease: easing.out } satisfies Transition,
  cinematic: { duration: duration.cinematic / 1000, ease: easing.out } satisfies Transition,
  springSoft: spring.soft satisfies Transition,
  springBouncy: spring.bouncy satisfies Transition,
  springStiff: spring.stiff satisfies Transition,
} as const;

/* ============================================================
 * VARIANTS — usadas em <motion.div variants={...}/>
 * ============================================================ */

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: 8, transition: transition.fast },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: transition.springSoft },
  exit: { opacity: 0, scale: 0.96, transition: transition.fast },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: transition.base },
  exit: { opacity: 0, x: 24, transition: transition.fast },
};

export const slideInBottom: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: 24, transition: transition.fast },
};

export const drawerSlideRight: Variants = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { duration: duration.base / 1000, ease: easing.out } },
  exit: { x: '100%', transition: { duration: duration.fast / 1000, ease: easing.in } },
};

export const drawerSlideBottom: Variants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: duration.medium / 1000, ease: easing.out } },
  exit: { y: '100%', transition: { duration: duration.fast / 1000, ease: easing.in } },
};

export const stagger: Variants = {
  animate: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

export const staggerChild: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transition.base },
};

/* ============================================================
 * TAP / HOVER feedback comum em botões e cards.
 * ============================================================ */

export const tap = { scale: 0.97 } as const;
export const hoverLift = { y: -2 } as const;

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina classes Tailwind com merge inteligente de conflitos.
 * Use em todo componente que aceita className externa.
 *
 * @example
 * <div className={cn('px-4 py-2', isActive && 'bg-accent-primary', className)} />
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

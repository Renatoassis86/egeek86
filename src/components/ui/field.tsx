import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Wrapper label + control + hint pra campos de formulário — extrai o padrão
 * repetido (`<label className="text-body-sm ..."> ... </label>`) que estava
 * duplicado em todo formulário do admin (ofertas/novo, cupons/novo, redes...).
 * Sem estado/client hooks — server-safe, usa direto em Server Components.
 */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-body-sm font-medium text-[var(--color-text-secondary)]">
        {label}
        {required && <span className="text-[var(--color-accent-danger)]"> *</span>}
      </label>
      {children}
      {hint && (
        <p className="text-caption text-[var(--color-text-tertiary)]">{hint}</p>
      )}
    </div>
  );
}

/** Título de seção dentro de um form longo — separa grupos de campos relacionados. */
export function FieldGroupTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-label uppercase text-[var(--color-text-tertiary)] tracking-wide', className)}>
      {children}
    </p>
  );
}

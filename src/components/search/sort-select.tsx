'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';

export interface SortOption {
  value: string;
  label: string;
  href: string;
}

/** Ordenação: <select> nativo (melhor no mobile e leitor de tela); troca de opção navega para a URL já montada no servidor. */
export function SortSelect({ options, value }: { options: SortOption[]; value: string }) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[14px] text-[var(--color-text-secondary)]">
        Ordenar por
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value);
          if (opt) router.push(opt.href);
        }}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 text-[15px] text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

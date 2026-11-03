import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface SectionNavItem {
  id: string;
  label: string;
  count?: number;
}

export interface FilterChip {
  key: string;
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

const chipBase =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border px-3.5 text-[13px] font-semibold transition-colors';
const chipIdle =
  'border-[var(--color-border-default)] bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)]';
const chipActive =
  'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] text-[var(--color-text-primary)]';

/**
 * Navegação da vitrine: (1) âncoras para as seções que realmente existem;
 * (2) filtros de tipo e de fabricante (links, compartilháveis por URL).
 * Componente de servidor: só links, sem estado.
 */
export function OfferSectionNav({
  sections,
  typeChips,
  makerChips,
}: {
  sections: SectionNavItem[];
  typeChips: FilterChip[];
  makerChips: FilterChip[];
}) {
  const row =
    'no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain pr-6 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]';
  return (
    <nav aria-label="Seções e filtros da vitrine" className="flex min-w-0 flex-col gap-2">
      {sections.length > 0 && (
        <div className={row}>
          <span className="shrink-0 text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Ir para</span>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={cn(chipBase, chipIdle)}>
              {s.label}
              {s.count != null && <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{s.count}</span>}
            </a>
          ))}
        </div>
      )}
      <div className={row}>
        <span className="shrink-0 text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Tipo</span>
        {typeChips.map((c) => (
          <Link key={c.key} href={c.href} scroll={false} aria-current={c.active ? 'true' : undefined} className={cn(chipBase, c.active ? chipActive : chipIdle)}>
            {c.label}
          </Link>
        ))}
        <span className="ml-2 shrink-0 text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Fabricante</span>
        {makerChips.map((c) => (
          <Link key={c.key} href={c.href} scroll={false} aria-current={c.active ? 'true' : undefined} className={cn(chipBase, c.active ? chipActive : chipIdle)}>
            {c.label}
            {c.count != null && <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{c.count}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

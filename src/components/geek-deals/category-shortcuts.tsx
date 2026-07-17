import Link from 'next/link';
import { Gamepad2, Flame, Joystick, Boxes } from 'lucide-react';
import { Text } from '@/components/ui/text';

interface CategoryShortcut {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SHORTCUTS: CategoryShortcut[] = [
  { href: '/ofertas?ordenar=price_asc', label: 'Ofertas do dia', icon: Flame },
  { href: '/ofertas?geracao=switch_2', label: 'Switch 2', icon: Gamepad2 },
  { href: '/ofertas?geracao=switch_1', label: 'Switch', icon: Gamepad2 },
  { href: '/ofertas?geracao=ps5', label: 'PS5', icon: Gamepad2 },
  { href: '/ofertas?geracao=ps4', label: 'PS4', icon: Gamepad2 },
  { href: '/ofertas?geracao=xbox_series', label: 'Xbox Series', icon: Gamepad2 },
  { href: '/ofertas?geracao=xbox_one', label: 'Xbox One', icon: Gamepad2 },
  { href: '/ofertas?tipo=console', label: 'Consoles', icon: Joystick },
  { href: '/ofertas?formato=digital', label: 'Digital', icon: Boxes },
];

/**
 * Atalho de categorias em ícone circular, estilo vitrine de marketplace
 * (Magazine Luiza etc) — navegação rápida antes dos carrosséis de destaque
 * individuais. Cada item já é um filtro real de /ofertas (mesmos query
 * params que OfferFilters usa), não é decorativo.
 */
export function CategoryShortcuts() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-8 lg:py-10">
      <div className="flex gap-5 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:gap-4 lg:grid-cols-9 lg:overflow-visible">
        {SHORTCUTS.map(({ href, label, icon: Icon }) => (
          <Link key={label} href={href} className="group flex shrink-0 flex-col items-center gap-2 sm:shrink">
            <span
              className={
                'flex size-14 items-center justify-center rounded-full border border-[var(--color-border-subtle)] ' +
                'bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] ' +
                'group-hover:border-[var(--color-accent-primary)]/50 group-hover:text-[var(--color-accent-primary)]'
              }
            >
              <Icon className="size-6" aria-hidden />
            </span>
            <Text
              variant="caption"
              color="secondary"
              className="w-16 text-center leading-tight group-hover:text-[var(--color-text-primary)]"
            >
              {label}
            </Text>
          </Link>
        ))}
      </div>
    </section>
  );
}

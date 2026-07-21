'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Tag, BarChart3, Flame, User } from 'lucide-react';
import { cn } from '@/lib/cn';

const tabs = [
  { href: '/', label: 'Início', Icon: Home },
  { href: '/ofertas', label: 'Ofertas', Icon: Tag },
  { href: '/monitoramento', label: 'Monitorar', Icon: BarChart3 },
  { href: '/hype-zone', label: 'Hype', Icon: Flame, highlight: true },
  { href: '/conta', label: 'Perfil', Icon: User },
];

/**
 * BottomTabBar — exclusiva mobile (oculta lg+).
 * Sticky no rodapé, blur backdrop, respeita safe-area.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação inferior"
      className={cn(
        'lg:hidden fixed bottom-0 inset-x-0 z-30',
        'h-[var(--bottom-tab-bar)] pb-safe',
        'bg-[var(--color-bg-canvas)]/85 backdrop-blur-xl backdrop-saturate-150',
        'border-t border-[var(--color-border-subtle)]'
      )}
    >
      <ul className="flex h-[var(--bottom-tab-bar)] items-center justify-around px-2">
        {tabs.map(({ href, label, Icon, highlight }) => {
          const active =
            href === '/' ? pathname === '/' : pathname?.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5',
                  'h-12 mx-auto min-w-[64px] rounded-[var(--radius-md)]',
                  'text-[var(--color-text-tertiary)]',
                  'hover:text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)]',
                  active && 'text-[var(--color-text-primary)]',
                  highlight && active && 'text-[var(--color-accent-hype)]',
                  highlight && !active && 'text-[var(--color-accent-hype)]/70'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-tab-active"
                    className={cn(
                      'absolute -top-0.5 h-1 w-8 rounded-full',
                      highlight
                        ? 'bg-[var(--color-accent-hype)]'
                        : 'bg-[var(--color-accent-primary)]'
                    )}
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <Icon className="size-5" aria-hidden />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

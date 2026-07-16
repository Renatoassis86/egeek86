'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Tags, Network, Ticket, MessageSquareText, Newspaper, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const adminNavItems: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/ofertas', label: 'Ofertas', icon: Tags },
  { href: '/admin/redes', label: 'Redes', icon: Network },
  { href: '/admin/cupons', label: 'Cupons', icon: Ticket },
  { href: '/admin/noticias', label: 'Notícias', icon: Newspaper },
  { href: '/admin/mensagens', label: 'Mensagens', icon: MessageSquareText },
];

/**
 * Lista de navegação do admin com destaque do item ativo (usePathname).
 * Reaproveitada tanto na sidebar desktop quanto no Drawer mobile — é a única
 * parte do AdminShell que precisa ser client component.
 */
export function AdminNavLinks({
  onNavigate,
  className,
  itemClassName,
}: {
  onNavigate?: () => void;
  className?: string;
  itemClassName?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="Navegação admin">
      {adminNavItems.map((item) => {
        const isActive = item.href === '/admin' ? pathname === item.href : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-[var(--radius-sm)] px-3 h-11 lg:h-10',
              'text-body-sm font-medium transition-colors duration-[var(--duration-fast)]',
              isActive
                ? 'bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]',
              itemClassName
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

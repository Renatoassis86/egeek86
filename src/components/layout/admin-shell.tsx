import * as React from 'react';
import Link from 'next/link';
import { LayoutDashboard, Tags, Network, Ticket, MessageSquareText } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/ofertas', label: 'Ofertas', icon: Tags },
  { href: '/admin/redes', label: 'Redes', icon: Network },
  { href: '/admin/cupons', label: 'Cupons', icon: Ticket },
  { href: '/admin/mensagens', label: 'Mensagens', icon: MessageSquareText },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[var(--color-bg-canvas)]">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border-subtle)] p-4 lg:block">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <div className="size-7 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] flex items-center justify-center text-xs font-bold text-[var(--color-text-inverse)]">
            86
          </div>
          <Text variant="heading-sm">Geek Deals</Text>
        </Link>

        <nav className="flex flex-col gap-1" aria-label="Navegação admin">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 h-10',
                'text-body-sm font-medium text-[var(--color-text-secondary)]',
                'hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]',
                'transition-colors duration-[var(--duration-fast)]'
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 lg:p-8">{children}</main>
    </div>
  );
}

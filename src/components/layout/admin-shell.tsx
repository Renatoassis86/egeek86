import * as React from 'react';
import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { AdminNavLinks } from '@/components/layout/admin-nav-links';
import { AdminMobileNav } from '@/components/layout/admin-mobile-nav';

function AdminLogo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="size-7 shrink-0 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] flex items-center justify-center text-xs font-bold text-[var(--color-text-inverse)]">
        86
      </div>
      <Text variant="heading-sm">Geek Deals</Text>
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg-canvas)] lg:flex-row">
      {/* Topbar mobile — só aparece abaixo de lg, é o substituto da sidebar que
          some no mobile (hidden lg:block). Sticky pra ficar acessível ao rolar. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)]/95 backdrop-blur px-3 py-2.5 pt-safe lg:hidden">
        <AdminMobileNav />
        <AdminLogo />
      </header>

      {/* Sidebar desktop — fixa, sem substituto era a lacuna original. */}
      <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border-subtle)] p-4 lg:block">
        <div className="mb-6 px-2">
          <AdminLogo />
        </div>
        <AdminNavLinks />
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

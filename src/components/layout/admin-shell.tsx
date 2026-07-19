import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Text } from '@/components/ui/text';
import { AdminNavLinks } from '@/components/layout/admin-nav-links';
import { AdminMobileNav } from '@/components/layout/admin-mobile-nav';

function AdminLogo() {
  return (
    <Link 
      href="/" 
      className="flex items-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded-[var(--radius-xs)]"
      aria-label="Espaço Geek 86, início"
    >
      <Image
        src="/geek 86.webp"
        alt="Espaço Geek 86"
        width={4220}
        height={1568}
        priority
        className="theme-logo h-6 lg:h-7 w-auto transition-transform group-hover:scale-105"
      />
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

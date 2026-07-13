'use client';

import Link from 'next/link';
import { Search, ShoppingBag, Heart, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { cn } from '@/lib/cn';

const navLinks = [
  { href: '/universos', label: 'Universos' },
  { href: '/categorias', label: 'Categorias' },
  { href: '/hype-zone', label: 'Hype Zone', highlight: true },
  { href: '/ofertas', label: 'Ofertas' },
  { href: '/sellers', label: 'Sellers' },
];

export function AppHeader() {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 w-full',
        'h-[var(--header-mobile)] lg:h-[var(--header-desktop)]',
        'bg-[var(--color-bg-canvas)]/80 backdrop-blur-xl backdrop-saturate-150',
        'border-b border-[var(--color-border-subtle)]',
        'pt-safe'
      )}
    >
      <div className="mx-auto h-full max-w-7xl px-4 lg:px-8 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded-[var(--radius-xs)]"
          aria-label="Espaço Geek 86 — Início"
        >
          <div className="size-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] flex items-center justify-center font-bold text-[var(--color-text-inverse)] text-sm transition-transform group-hover:scale-105">
            86
          </div>
          <Text variant="heading-sm" className="hidden sm:inline-block font-display tracking-tight">
            ESPAÇO GEEK
          </Text>
        </Link>

        {/* Nav desktop */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Navegação principal">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 h-9 inline-flex items-center rounded-[var(--radius-sm)]',
                'text-body-sm font-medium text-[var(--color-text-secondary)]',
                'hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
                'transition-colors duration-[var(--duration-fast)]',
                link.highlight && 'text-[var(--color-accent-hype)] hover:text-[var(--color-accent-hype)]'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Buscar">
            <Search className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Wishlist" className="hidden sm:inline-flex">
            <Heart className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Conta" className="hidden sm:inline-flex" asChild>
            <Link href="/conta">
              <User className="size-5" />
            </Link>
          </Button>
          <ThemeToggle className="hidden lg:inline-flex" />
          <Button variant="ghost" size="icon" aria-label="Carrinho" className="relative">
            <ShoppingBag className="size-5" />
            {/* Badge de quantidade — futuro */}
          </Button>
        </div>
      </div>
    </header>
  );
}

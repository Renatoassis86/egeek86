'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { ShoppingBag, Heart, User, Sliders, LogIn, Gavel, ShieldCheck, Menu, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { HeaderSearchModal } from '@/components/layout/header-search-modal';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { cn } from '@/lib/cn';

interface NavChild {
  href: string;
  label: string;
}

interface NavItem {
  href: string;
  label: string;
  highlight?: boolean;
  /** Presente = vira mega-menu (mesmo padrão visual, item raiz continua clicável direto). */
  children?: NavChild[];
}

/**
 * Nível superior enxuto (4 itens) — os 7 destinos originais continuam todos
 * acessíveis, só agrupados por jornada (comparar preço / módulo hype-zone /
 * notícias) em vez de listados um a um. Reduz a carga cognitiva do nav sem
 * remover nenhuma página.
 */
const navLinks: NavItem[] = [
  {
    href: '/ofertas',
    label: 'Ofertas & Preços',
    children: [
      { href: '/ofertas', label: 'Vitrine de Ofertas' },
      { href: '/tabela-de-precos', label: 'Tabela de Preços' },
      { href: '/monitoramento', label: 'Bolsa Gamer (Monitoramento)' },
    ],
  },
  {
    href: '/hype-zone',
    label: 'Hype Zone',
    highlight: true,
    children: [
      { href: '/hype-zone', label: 'Hype Zone & Drops' },
      { href: '/leiloes', label: 'Leilões Geek' },
    ],
  },
  {
    href: '/inteligencia-gamer',
    label: 'Observatório Gamer',
    children: [
      { href: '/inteligencia-gamer?categoria=artigos', label: 'Artigos & Opinião' },
      { href: '/inteligencia-gamer?categoria=teoricas', label: 'Dossiês de Mercado' },
      { href: '/inteligencia-gamer?categoria=empiricas', label: 'Radar de Preços & Dados' },
      { href: '/inteligencia-gamer?categoria=descritivas', label: 'Panorama & Tendências' },
    ],
  },
  {
    href: '/noticias',
    label: 'Notícias',
  },
];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!item.children) {
    return (
      <Link
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'px-3 h-9 inline-flex items-center rounded-[var(--radius-sm)]',
          'text-body-sm font-medium text-[var(--color-text-secondary)]',
          'hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
          'transition-colors duration-[var(--duration-fast)]',
          item.highlight && !isActive && 'text-[var(--color-accent-hype)] hover:text-[var(--color-accent-hype)]',
          isActive && 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]'
        )}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="relative group/nav"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={cn(
          'px-3 h-9 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] transition-all cursor-pointer',
          'text-body-sm font-medium text-[var(--color-text-secondary)]',
          'hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
          item.highlight && !isActive && 'text-[var(--color-accent-hype)] hover:text-[var(--color-accent-hype)]',
          (isActive || isOpen) && 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]'
        )}
      >
        <span>{item.label}</span>
        <svg
          className={cn('size-3.5 opacity-60 transition-transform duration-200', isOpen && 'rotate-180')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full pt-1.5 w-60 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="flex flex-col p-1.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] shadow-2xl backdrop-blur-xl">
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors group/item"
              >
                <span>{child.label}</span>
                <svg
                  className="size-3 opacity-0 group-hover/item:opacity-100 transition-opacity text-[var(--color-accent-primary)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppHeader({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  return (
    <header
      data-theme="dark"
      className={cn(
        'sticky top-0 z-30 w-full',
        'bg-[#0F0C08]/95 backdrop-blur-xl backdrop-saturate-150',
        'border-b border-[#262018]',
        'pt-safe'
      )}
    >
        <div className="mx-auto h-[var(--header-mobile)] lg:h-[var(--header-desktop)] max-w-7xl px-4 lg:px-8 flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-2">
            {/* Botão de Menu Hambúrguer (Três traços no mobile) */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden flex shrink-0"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Abrir menu de módulos"
            >
              <Menu className="size-5 text-[var(--color-text-primary)]" />
            </Button>

            {/* Logo */}
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
            className="h-6 lg:h-7 w-auto transition-transform group-hover:scale-105"
          />
        </Link>
      </div>

        {/* Nav desktop */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Navegação principal">
          {navLinks.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              item.children?.some((c) => pathname === c.href.split('?')[0]);
            return <NavLink key={item.href} item={item} isActive={Boolean(isActive)} />;
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <HeaderSearchModal />
          <Button variant="ghost" size="icon" aria-label="Ranking de Vendedores" className="hidden sm:inline-flex" asChild>
            <Link href="/ranking">
              <Trophy className="size-5 text-[var(--color-accent-gold)]" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Jogos acompanhados" className="hidden sm:inline-flex" asChild>
            <Link href="/conta?aba=jogos">
              <Heart className="size-5" />
            </Link>
          </Button>
          {/* User Icon Dropdown */}
          <div className="relative group/user hidden sm:block">
            <Button variant="ghost" size="icon" aria-label="Conta / Perfil" asChild>
              <Link href="/conta">
                <User className="size-5" />
              </Link>
            </Button>

            {/* Dropdown Menu do Perfil */}
            <div className="absolute right-0 top-full pt-1.5 w-64 opacity-0 pointer-events-none group-hover/user:opacity-100 group-hover/user:pointer-events-auto transition-all duration-200 z-50">
              <div className="flex flex-col p-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-xl)] backdrop-blur-md">

                {/* Cabeçalho do Perfil */}
                <div className="p-3 border-b border-[var(--color-border-subtle)] flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--color-text-primary)]">Perfil do Colecionador</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-accent-gold)]/20 text-[var(--color-accent-gold)]">Nível 12</span>
                  </div>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">Acesse seus dados, drops e leilões</span>
                </div>

                {/* Links Principais */}
                <div className="flex flex-col py-1">
                  <Link href="/conta" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors">
                    <User className="size-3.5 text-[var(--color-accent-primary)]" />
                    <span>Meu Perfil & Gamificação</span>
                  </Link>

                  <Link href="/conta?aba=dados" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors">
                    <Sliders className="size-3.5 text-[var(--color-accent-primary)]" />
                    <span>Dados Cadastrais & Editar</span>
                  </Link>

                  <Link href="/conta?aba=compras" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors">
                    <ShoppingBag className="size-3.5 text-[var(--color-accent-primary)]" />
                    <span>Minhas Compras</span>
                  </Link>

                  <Link href="/conta?aba=vendas" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors">
                    <ShieldCheck className="size-3.5 text-[var(--color-accent-hype)]" />
                    <span>Meus Drops & Vendas</span>
                  </Link>

                  <Link href="/conta?aba=leiloes" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors">
                    <Gavel className="size-3.5 text-[var(--color-accent-gold)]" />
                    <span>Meus Leilões & Lances</span>
                  </Link>
                </div>

                <div className="h-px bg-[var(--color-border-subtle)] my-1" />

                {/* Opções de Cadastro / Login */}
                <div className="flex flex-col gap-1 p-1">
                  <Link href="/entrar?role=colecionador" className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-[var(--color-accent-hype)] hover:bg-[var(--color-accent-hype)]/10 rounded-[var(--radius-xs)] transition-colors">
                    <span>🚀 Cadastrar Colecionador / Leiloeiro</span>
                  </Link>
                  <Link href="/entrar" className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] rounded-[var(--radius-xs)] transition-colors">
                    <LogIn className="size-3.5" />
                    <span>Entrar / Fazer Login</span>
                  </Link>
                </div>

              </div>
            </div>
          </div>
          <ThemeToggle className="inline-flex" />
          <Button variant="ghost" size="icon" aria-label="Carrinho" className="relative" asChild>
            <Link href="/carrinho">
              <ShoppingBag className="size-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--color-accent-primary)] text-[10px] font-bold text-[var(--color-text-inverse)]">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>
      <MobileNavDrawer isOpen={isMobileDrawerOpen} onClose={() => setIsMobileDrawerOpen(false)} />
    </header>
  );
}

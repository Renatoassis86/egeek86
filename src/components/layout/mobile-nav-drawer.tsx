'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Tag,
  BarChart3,
  Flame,
  Trophy,
  Gavel,
  Newspaper,
  User,
  Sliders,
  ShoppingBag,
  ShieldCheck,
  LogIn,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { cn } from '@/lib/cn';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const mainModules = [
  { href: '/', label: 'Início / Home', icon: Home },
  { href: '/ofertas', label: 'Todas as Ofertas', icon: Tag },
  { href: '/monitoramento', label: 'Monitoramento de Preços', icon: BarChart3 },
  { href: '/hype-zone', label: 'Hype Zone & Drops', icon: Flame, highlight: true },
  { href: '/ranking', label: 'Ranking de Vendedores', icon: Trophy, highlight: true },
  { href: '/leiloes', label: 'Leilões Geek', icon: Gavel, highlight: true },
  { href: '/noticias', label: 'Notícias & Matérias', icon: Newspaper },
];

const userModules = [
  { href: '/conta', label: 'Meu Perfil & Gamificação', icon: User },
  { href: '/conta?aba=vendas', label: 'Central do Vendedor / Drops', icon: ShieldCheck },
  { href: '/conta?aba=compras', label: 'Minhas Compras', icon: ShoppingBag },
  { href: '/conta?aba=dados', label: 'Dados Cadastrais', icon: Sliders },
];

export function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop de fundo escuro */}
      <div
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Painel lateral deslisante (Drawer) */}
      <div className="relative z-10 w-[85vw] max-w-xs h-full bg-[var(--color-bg-elevated)] border-r border-[var(--color-border-default)] shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-300">
        <div>
          {/* Topo do Drawer */}
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <Link href="/" onClick={onClose} className="flex items-center gap-2">
              <Image
                src="/geek 86.webp"
                alt="Espaço Geek 86"
                width={200}
                height={70}
                className="h-6 w-auto theme-logo"
              />
            </Link>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar menu">
              <X className="size-5" />
            </Button>
          </div>

          {/* Banner Rápido de Colecionador */}
          <div className="p-3 bg-[var(--color-bg-surface)] border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--color-accent-gold)]" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[var(--color-text-primary)]">Modo Aplicativo Mobile</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Todas as funções na sua mão</span>
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Seção 1: Módulos da Plataforma */}
          <div className="p-3">
            <span className="px-2 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Módulos da Plataforma
            </span>
            <nav className="mt-2 flex flex-col gap-1">
              {mainModules.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors',
                      isActive
                        ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] font-bold'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
                      item.highlight && !isActive && 'text-[var(--color-accent-hype)]'
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="h-px bg-[var(--color-border-subtle)] mx-3 my-1" />

          {/* Seção 2: Minha Conta & Vendedor */}
          <div className="p-3">
            <span className="px-2 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Minha Conta & Vendedor
            </span>
            <nav className="mt-2 flex flex-col gap-1">
              {userModules.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-colors"
                  >
                    <Icon className="size-4 shrink-0 text-[var(--color-accent-primary)]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Rodapé do Drawer */}
        <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex flex-col gap-2">
          <Link
            href="/entrar?role=colecionador"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-[var(--radius-sm)] bg-[var(--color-accent-hype)] text-white text-xs font-bold shadow-md text-center"
          >
            <span>Cadastrar Colecionador</span>
          </Link>

          <Link
            href="/entrar"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-[var(--radius-sm)] border border-[var(--color-border-default)] text-xs font-semibold text-[var(--color-text-primary)] text-center hover:bg-[var(--color-bg-elevated)]"
          >
            <LogIn className="size-3.5" />
            <span>Entrar / Fazer Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

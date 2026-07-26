'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Info,
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
  BookOpen,
  FileText,
  TrendingUp,
  Heart,
  HelpCircle,
  Shield,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { cn } from '@/lib/cn';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const mainMarketModules = [
  { href: '/', label: 'Início / Home', icon: Home },
  { href: '/ofertas', label: 'Vitrine de Ofertas', icon: Tag },
  { href: '/tabela-de-precos', label: 'Tabela Geral de Preços', icon: BarChart3 },
  { href: '/monitoramento', label: 'Bolsa Gamer (Monitoramento)', icon: BarChart3 },
  { href: '/ranking', label: 'Ranking de Vendedores', icon: Trophy },
];

const hypeZoneModules = [
  { href: '/hype-zone', label: 'Hype Zone & Drops', icon: Flame, highlight: true },
  { href: '/leiloes', label: 'Leilões Geek (Hammer)', icon: Gavel, highlight: true },
  { href: '/conta/vendedor/novo-drop', label: '✨ Cadastrar Novo Drop', icon: Sparkles, highlight: true },
];

const observatorioModules = [
  { href: '/inteligencia-gamer', label: 'Observatório Gamer (Hub)', icon: Sparkles },
  { href: '/inteligencia-gamer?categoria=artigos', label: 'Artigos & Opinião', icon: BookOpen },
  { href: '/inteligencia-gamer?categoria=teoricas', label: 'Dossiês de Mercado', icon: FileText },
  { href: '/inteligencia-gamer?categoria=empiricas', label: 'Radar de Preços & Dados', icon: TrendingUp },
  { href: '/inteligencia-gamer?categoria=descritivas', label: 'Panorama & Tendências', icon: Sparkles },
];

const newsModules = [
  { href: '/noticias', label: 'Notícias & Matérias', icon: Newspaper },
];

const userModules = [
  { href: '/conta', label: 'Meu Perfil & Gamificação', icon: User },
  { href: '/conta?aba=dados', label: 'Dados Cadastrais & Editar', icon: Sliders },
  { href: '/conta?aba=compras', label: 'Minhas Compras', icon: ShoppingBag },
  { href: '/conta?aba=vendas', label: 'Meus Drops & Vendas', icon: ShieldCheck },
  { href: '/conta?aba=leiloes', label: 'Meus Leilões & Lances', icon: Gavel },
  { href: '/conta?aba=jogos', label: 'Meus Jogos Acompanhados', icon: Heart },
  { href: '/carrinho', label: 'Meu Carrinho', icon: ShoppingBag },
];

const institutionalModules = [
  { href: '/sobre', label: 'Quem Somos', icon: Info },
  { href: '/contatos', label: 'Contatos & Suporte', icon: HelpCircle },
  { href: '/termos', label: 'Termos de Uso', icon: FileCheck },
  { href: '/privacidade', label: 'Política de Privacidade', icon: Shield },
];

function NavGroup({
  items,
  onClose,
  pathname,
  subheading,
}: {
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean }[];
  onClose: () => void;
  pathname: string;
  subheading?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {subheading && (
        <span className="px-2 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {subheading}
        </span>
      )}
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors',
              isActive
                ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] font-bold'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
              item.highlight && !isActive && 'text-[var(--color-accent-hype)] font-bold'
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop de fundo escuro */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 z-40"
        onClick={onClose}
      />

      {/* Painel lateral deslizante (Drawer) */}
      <div className="relative z-50 w-[88vw] max-w-xs h-full bg-[var(--color-bg-elevated)] border-r border-[var(--color-border-default)] shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-300">
        <div>
          {/* Topo do Drawer */}
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-[var(--color-bg-inset)]">
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
                <span className="text-xs font-bold text-[var(--color-text-primary)]">Menu da Plataforma</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Todas as seções do site</span>
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Módulos do Site */}
          <div className="p-3 pb-6 flex flex-col gap-1">
            <NavGroup items={mainMarketModules} onClose={onClose} pathname={pathname} subheading="Mercado & Ofertas" />
            <NavGroup items={hypeZoneModules} onClose={onClose} pathname={pathname} subheading="Hype Zone & Drops" />
            <NavGroup items={observatorioModules} onClose={onClose} pathname={pathname} subheading="Observatório Gamer" />
            <NavGroup items={newsModules} onClose={onClose} pathname={pathname} subheading="Notícias" />
            <NavGroup items={userModules} onClose={onClose} pathname={pathname} subheading="Minha Conta" />
            <NavGroup items={institutionalModules} onClose={onClose} pathname={pathname} subheading="Institucional & Suporte" />
          </div>
        </div>

        {/* Rodapé do Drawer */}
        <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex flex-col gap-2 shrink-0">
          <Link
            href="/entrar?role=colecionador"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-[var(--radius-sm)] bg-[var(--color-accent-hype)] text-white text-xs font-bold shadow-md text-center"
          >
            <span>🚀 Cadastrar Colecionador</span>
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
    </div>,
    document.body
  );
}

import * as React from 'react';
import { AppHeader } from './app-header';
import { TopUtilityBar } from './top-utility-bar';
import { BottomTabBar } from './bottom-tab-bar';
import { SiteFooter } from './site-footer';
import { NeuralWatermarkBackground } from '@/components/ui/neural-watermark-background';
import { TopProgressBar } from './top-progress-bar';
import type { ShellViewer } from './shell-viewer';

interface AppShellProps {
  children: React.ReactNode;
  /** Esconde header (ex: rotas auth fullscreen). */
  hideHeader?: boolean;
  /** Esconde bottom tab bar mobile (ex: checkout). */
  hideBottomBar?: boolean;
  /** Esconde footer (ex: app-like rotas). */
  hideFooter?: boolean;
  /** Contagem de itens da lista de acompanhamento (tabela affiliate_cart_items) — buscada no servidor pelo layout, repassada pro badge do ícone. */
  cartCount?: number;
  /** Quem está logado (nome e papel), lido no servidor pelo layout; null = visitante. */
  viewer?: ShellViewer | null;
}

/**
 * AppShell — wrapper visual padrão das rotas (shop).
 * Garante:
 * - Header sticky com pt-safe
 * - Main com padding-bottom suficiente para bottom tab bar
 * - Footer condicional
 */
export function AppShell({
  children,
  hideHeader,
  hideBottomBar,
  hideFooter,
  cartCount,
  viewer,
}: AppShellProps) {
  return (
    <div className="relative min-h-dvh flex flex-col bg-[var(--color-bg-canvas)] w-full max-w-[100vw] overflow-x-hidden">
      {/* Barra de Progresso Ultrarrápida no Topo (Elimina Sensação de Demora) */}
      <React.Suspense fallback={null}>
        <TopProgressBar />
      </React.Suspense>

      {/* Marca d'Água Transparente Global (EG86 / ESPAÇO GEEK 86) + Brushes de Circuitos */}
      <NeuralWatermarkBackground />

      {!hideHeader && (
        <>
          <TopUtilityBar />
          <AppHeader cartCount={cartCount} viewer={viewer ?? null} />
        </>
      )}

      {/* items-stretch explícito: "normal" (o default do navegador) não estava
          resolvendo como stretch nessa combinação Tailwind v4/Turbopack —
          cada <section> filha encolhia pro tamanho do próprio conteúdo
          (shrink-to-fit) em vez de ocupar a largura cheia do <main>, mesmo
          usando mx-auto max-w-7xl. Bug real, achado via inspeção de layout
          computado, não só visual. */}
      <main
        className="flex-1 flex flex-col items-stretch w-full max-w-[100vw] overflow-x-hidden"
        style={{
          paddingBottom: hideBottomBar
            ? 'env(safe-area-inset-bottom)'
            : 'calc(var(--bottom-tab-bar) + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>

      {!hideFooter && <SiteFooter />}
      {!hideBottomBar && <BottomTabBar />}
    </div>
  );
}

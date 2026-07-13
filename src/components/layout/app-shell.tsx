import * as React from 'react';
import { AppHeader } from './app-header';
import { BottomTabBar } from './bottom-tab-bar';
import { SiteFooter } from './site-footer';

interface AppShellProps {
  children: React.ReactNode;
  /** Esconde header (ex: rotas auth fullscreen). */
  hideHeader?: boolean;
  /** Esconde bottom tab bar mobile (ex: checkout). */
  hideBottomBar?: boolean;
  /** Esconde footer (ex: app-like rotas). */
  hideFooter?: boolean;
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
}: AppShellProps) {
  return (
    <div className="relative min-h-dvh flex flex-col bg-[var(--color-bg-canvas)]">
      {!hideHeader && <AppHeader />}

      <main
        className="flex-1 flex flex-col"
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

import type { ReactNode } from 'react';
import { assertMarketplaceVisible } from '@/lib/auth/marketplace-gate';

// Marketplace (leilão e usados) fechado ao público (dono, 2026-11-11): a trava fica no layout para a resposta sair com status 404 de verdade
// (no page.tsx, com loading.tsx, o status já teria saído como 200). Admin continua entrando.
export const dynamic = 'force-dynamic';

export default async function MarketplaceGateLayout({ children }: { children: ReactNode }) {
  await assertMarketplaceVisible();
  return children;
}

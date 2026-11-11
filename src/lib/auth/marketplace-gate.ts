import 'server-only';
import { notFound } from 'next/navigation';
import { MARKETPLACE_PUBLIC } from '@/lib/features';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/** Papel admin sem redirecionar (diferente de requireAdmin). */
export async function isAdminViewer(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin' || profile?.role === 'super_admin';
}

/** Paginas do marketplace: 404 para quem nao e admin enquanto a chave estiver fechada. */
export async function assertMarketplaceVisible(): Promise<void> {
  if (MARKETPLACE_PUBLIC) return;
  if (!(await isAdminViewer())) notFound();
}

/** Server actions de mutacao: true = pode prosseguir. */
export async function marketplaceActionAllowed(): Promise<boolean> {
  if (MARKETPLACE_PUBLIC) return true;
  return isAdminViewer();
}

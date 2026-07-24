import { AppShell } from '@/components/layout/app-shell';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getCartItemCount } from '@/server/queries/cart';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const cartCount = profile ? await getCartItemCount(profile.id) : 0;

  return <AppShell cartCount={cartCount}>{children}</AppShell>;
}

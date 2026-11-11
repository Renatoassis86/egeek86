import { AppShell } from '@/components/layout/app-shell';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getCartItemCount } from '@/server/queries/cart';
import { isAdminRole } from '@/components/layout/shell-viewer';
import { departamentosVisiveis } from '@/server/departamentos';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const cartCount = profile ? await getCartItemCount(profile.id) : 0;

  const viewer = profile ? { name: profile.name, role: profile.role } : null;

  // Menu "Departamentos": só existe se algum departamento estiver aberto (chave no banco + MERCADO_UI).
  // Com a trava mestra desligada não toca no banco; qualquer falha => sem item (nunca quebra o layout games).
  let departamentos: { slug: string; label: string }[] = [];
  try {
    departamentos = (await departamentosVisiveis(isAdminRole(profile?.role))).map((d) => ({ slug: d.slug, label: d.rotulo }));
  } catch (err) {
    console.error('[layout] falha ao ler departamentos abertos', err);
  }

  return (
    <AppShell cartCount={cartCount} viewer={viewer} departamentos={departamentos}>
      {children}
    </AppShell>
  );
}

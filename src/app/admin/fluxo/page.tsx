import { requireAdmin } from '@/lib/auth/require-admin';
import { carregarFluxo } from '@/server/queries/fluxo';
import { FluxoView } from '@/components/admin/fluxo-view';

export const metadata = { title: 'Admin: Fluxo ao vivo' };
export const dynamic = 'force-dynamic';

/** Fluxo corrente dos processos (somente leitura). A checagem de admin fica AQUI, não só no layout (layouts não re-renderizam na navegação). */
export default async function AdminFluxoPage() {
  await requireAdmin();
  const inicial = await carregarFluxo();
  return <FluxoView inicial={inicial} />;
}

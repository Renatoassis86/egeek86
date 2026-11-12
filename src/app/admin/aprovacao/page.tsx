import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db';
import { historico, painel, proximosCartoes } from '@/server/aprovacao/aprovacao';
import { AprovacaoView } from '@/components/admin/aprovacao-view';

export const metadata = { title: 'Admin: Aprovação' };
export const dynamic = 'force-dynamic';

/** Central de aprovação do dono (cartão, lote com prévia, desfazer). A checagem de admin fica AQUI, não só no layout (layouts não re-renderizam na navegação). */
export default async function AdminAprovacaoPage() {
  const admin = await requireAdmin();
  const [p, h, c] = await Promise.all([painel(db, admin.id), historico(db, 50), proximosCartoes(db, { limit: 20 })]);
  return <AprovacaoView painel={p} historico={h} cartoes={c} />;
}

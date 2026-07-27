import { Text } from '@/components/ui/text';
import { listMessagesForAdmin } from '@/server/queries/affiliate';
import { AdminMessagesList } from '@/components/admin/admin-messages-list';

// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  const messages = await listMessagesForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Mensagens divulgadas
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Gerencie, edite textos ou exclua mensagens do histórico de envios para redes sociais e canais VIP.
        </Text>
      </div>

      <AdminMessagesList initialMessages={messages} />
    </div>
  );
}

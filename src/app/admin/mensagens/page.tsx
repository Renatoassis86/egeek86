import { Text } from '@/components/ui/text';
import { listMessagesForAdmin } from '@/server/queries/affiliate';
import { AdminMessagesList } from '@/components/admin/admin-messages-list';
import { GroupMessagesPanel } from '@/components/admin/group-messages-panel';
import { requireAdmin } from '@/lib/auth/require-admin';
import { canSendTelegram, getAdTag, getGroupMessagesMode, isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { detectGroupCandidates, groupMessagesTableExists } from '@/server/messaging/group-offers';
import { listQueue } from '@/server/messaging/group-queue';
import { queueToViewItems, toViewItem, type GroupViewItem } from '@/server/messaging/group-view';

// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdminMessagesPage() {
  await requireAdmin();

  const tableExists = await groupMessagesTableExists().catch(() => false);
  let items: GroupViewItem[] = [];
  let loadError: string | null = null;
  try {
    // Com a tabela: fila persistida. Sem ela: modo ao vivo, o detector roda na hora (só leitura).
    items = tableExists ? queueToViewItems(await listQueue()) : (await detectGroupCandidates()).candidates.map(toViewItem);
  } catch (e) {
    loadError = e instanceof Error ? e.message.slice(0, 200) : 'erro ao calcular';
  }
  const messages = await listMessagesForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Mensagens para grupos
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Propostas calculadas do banco (preço, média e menor preço reais). Aprove, copie ou envie. Nada sai sem você.
        </Text>
      </div>

      {loadError && <Text variant="body-sm">Não foi possível calcular agora: {loadError}</Text>}

      <GroupMessagesPanel
        items={items}
        flags={{
          enabled: isGroupMessagesEnabled(),
          mode: getGroupMessagesMode(),
          telegramReady: canSendTelegram().ok,
          adTag: getAdTag(),
          tableExists,
        }}
      />

      <div className="flex flex-col gap-2 pt-4">
        <Text as="h2" variant="heading-lg">
          Mensagens divulgadas (histórico)
        </Text>
        <Text variant="body-sm" color="secondary">
          Gerencie, edite textos ou exclua mensagens do histórico de envios para redes sociais e canais VIP.
        </Text>
        <AdminMessagesList initialMessages={messages} />
      </div>
    </div>
  );
}

export const metadata = { title: 'Admin: Mensagens' };

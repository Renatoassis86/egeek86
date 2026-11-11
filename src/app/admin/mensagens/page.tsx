import { Text } from '@/components/ui/text';
import { listMessagesForAdmin } from '@/server/queries/affiliate';
import { AdminMessagesList } from '@/components/admin/admin-messages-list';
import { GroupMessagesPanel } from '@/components/admin/group-messages-panel';
import { requireAdmin } from '@/lib/auth/require-admin';
import { canSendTelegram, getAdTag, getGroupMessagesMode, isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { detectGroupCandidates, groupMessagesTableExists } from '@/server/messaging/group-offers';
import { listQueue } from '@/server/messaging/group-queue';
import { queueToViewItems, toViewItem, type GroupViewItem } from '@/server/messaging/group-view';
import { loadAutomationOverview } from '@/server/messaging/group-overview';
import { loadQueuePlan } from '@/server/messaging/group-plan';
import { getStores } from '@/server/stores';
import { GroupSendPlan } from '@/components/admin/group-send-plan';
import { CouponAgulhaPanel } from '@/components/admin/coupon-agulha-panel';
import { saudeAgulha } from '@/server/coupons/agulha-health';

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
  const overview = await loadAutomationOverview();
  const queuePlan = await loadQueuePlan();
  const saudeCupons = await saudeAgulha().catch(() => null);
  const groupLinks: Record<string, { name: string; url: string }> = {};
  for (const s of await getStores({ fresh: true }).catch(() => [])) {
    if (!s.whatsappGroupUrl) continue;
    for (const v of s.verticals) groupLinks[v] = { name: s.name, url: s.whatsappGroupUrl };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Mensagens para grupos
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Decisões calculadas do banco (preço, série e menor preço reais). O Telegram pode sair sozinho nas classes seguras quando a automação está em &ldquo;ligada&rdquo;; desconto acima de 30% da média, queda acima de 30%, Shopee com queda acima de 20%, vendedor sem reputação e nichos novos esperam a sua aprovação. O WhatsApp é sempre assistido.
        </Text>
      </div>

      {loadError && <Text variant="body-sm">Não foi possível calcular agora: {loadError}</Text>}

      <GroupSendPlan plan={queuePlan} />

      <CouponAgulhaPanel saude={saudeCupons} />

      <GroupMessagesPanel
        items={items}
        groupLinks={groupLinks}
        overview={overview}
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

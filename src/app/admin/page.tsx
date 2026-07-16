import { Tags, Ticket, MousePointerClick, MessageSquareText, Clock3, PackageCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ClicksSparkline } from '@/components/admin/clicks-sparkline';
import { getAdminDashboardMetrics, getDailyClicks } from '@/server/queries/affiliate';

// Dashboard com dado ao vivo, sem searchParams — força dinâmica pra não
// tentar pré-renderizar como estática (travava buscando no banco no build).
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [metrics, dailyClicks] = await Promise.all([getAdminDashboardMetrics(), getDailyClicks(14)]);

  const secondaryCards = [
    { label: 'Ofertas cadastradas', value: metrics.totalOffersCount, icon: PackageCheck },
    { label: 'Cupons ativos', value: metrics.activeCouponsCount, icon: Ticket },
    { label: 'Cupons expirando (7d)', value: metrics.couponsExpiringSoon, icon: Clock3 },
    { label: 'Cliques (30 dias)', value: metrics.clicks30d, icon: MousePointerClick },
    { label: 'Mensagens geradas (7d)', value: metrics.messagesThisWeek, icon: MessageSquareText },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Geek Deals: Dashboard
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Visão geral das ofertas de afiliado monitoradas manualmente.
        </Text>
      </div>

      {/* KPIs principais — maior destaque visual que o resto */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card variant="elevated">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
              <Tags className="size-4 shrink-0" />
              <Text variant="label">Ofertas ativas</Text>
            </div>
            <Text variant="display-md" className="tabular mt-2">
              {metrics.activeOffersCount}
            </Text>
            <Text variant="caption" color="tertiary" className="mt-1">
              de {metrics.totalOffersCount} cadastradas no total
            </Text>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
              <MousePointerClick className="size-4 shrink-0" />
              <Text variant="label">Cliques (7 dias)</Text>
            </div>
            <Text variant="display-md" className="tabular mt-2">
              {metrics.clicks7d}
            </Text>
            <ClicksSparkline data={dailyClicks} className="mt-3" />
          </CardContent>
        </Card>
      </div>

      {/* KPIs secundários — tiles menores e mais densos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {secondaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <card.icon className="size-4 text-[var(--color-text-tertiary)]" aria-hidden />
              <Text variant="mono-lg" className="tabular mt-2 block">
                {card.value}
              </Text>
              <Text variant="caption" color="tertiary" className="mt-0.5">
                {card.label}
              </Text>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

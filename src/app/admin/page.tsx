import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { getAdminDashboardMetrics } from '@/server/queries/affiliate';

export default async function AdminDashboardPage() {
  const metrics = await getAdminDashboardMetrics();

  const cards = [
    { label: 'Ofertas ativas', value: metrics.activeOffersCount },
    { label: 'Ofertas cadastradas', value: metrics.totalOffersCount },
    { label: 'Cupons ativos', value: metrics.activeCouponsCount },
    { label: 'Cupons expirando (7d)', value: metrics.couponsExpiringSoon },
    { label: 'Cliques (7 dias)', value: metrics.clicks7d },
    { label: 'Cliques (30 dias)', value: metrics.clicks30d },
    { label: 'Mensagens geradas (7 dias)', value: metrics.messagesThisWeek },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Geek Deals — Dashboard
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Visão geral das ofertas de afiliado monitoradas manualmente.
        </Text>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <Text variant="mono-lg" className="tabular">
                {card.value}
              </Text>
              <Text variant="caption" color="tertiary" className="mt-1">
                {card.label}
              </Text>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { Tags, Ticket, MousePointerClick, MessageSquareText, Clock3, PackageCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ClicksSparkline } from '@/components/admin/clicks-sparkline';
import { getAdminDashboardMetrics, getDailyClicks } from '@/server/queries/affiliate';
import { AdminAnalyticsDashboard } from '@/components/admin/admin-analytics-dashboard';
import { getAdminCatalogMetrics } from '@/server/queries/admin-metrics';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getFilaClassificacao } from '@/server/queries/fila-classificacao';
import { FilaClassificacaoPopup } from '@/components/admin/fila-classificacao-popup';

export const metadata = { title: 'Admin: Painel' };

// Dashboard com dado ao vivo, sem searchParams — força dinâmica pra não
// tentar pré-renderizar como estática (travava buscando no banco no build).
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAdmin();
  const fila = await getFilaClassificacao();
  const [metrics, dailyClicks, catalog] = await Promise.all([
    getAdminDashboardMetrics(),
    getDailyClicks(14),
    getAdminCatalogMetrics(),
  ]);

  const secondaryCards = [
    { label: 'Ofertas cadastradas', value: metrics.totalOffersCount, icon: PackageCheck },
    { label: 'Cupons ativos', value: metrics.activeCouponsCount, icon: Ticket },
    { label: 'Cupons expirando (7d)', value: metrics.couponsExpiringSoon, icon: Clock3 },
    { label: 'Cliques (30 dias)', value: metrics.clicks30d, icon: MousePointerClick },
    { label: 'Mensagens geradas (7d)', value: metrics.messagesThisWeek, icon: MessageSquareText },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Text as="h1" variant="heading-xl">
          Painel administrativo
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Ofertas, cliques e cotações registradas, lidos direto do banco. Onde não há dado, a seção aparece vazia.
        </Text>
        <div className="mt-3">
          <FilaClassificacaoPopup initialCards={fila.cards} pendentes={fila.pendentes} regrasAprendidas={fila.regrasAprendidas} />
        </div>
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

      {/* Dashboard Analítico Completo (Histogramas, Mapa do Brasil, Lojas & Insights) */}
      <AdminAnalyticsDashboard catalog={catalog} />
    </div>
  );
}

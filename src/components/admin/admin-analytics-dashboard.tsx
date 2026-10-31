import Link from 'next/link';
import { Layers, Store, BarChart3, PieChart, Newspaper, Vote, Database, Clock3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import type { AdminCatalogMetrics } from '@/server/queries/admin-metrics';

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'sem coleta registrada';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

/**
 * Painel analítico do admin. Todo número vem de `getAdminCatalogMetrics`
 * (SELECTs reais). Onde não há dado, a seção mostra estado vazio em vez de
 * valores de exemplo. Escopo dos indicadores: oferta (um anúncio), não produto.
 */
export function AdminAnalyticsDashboard({ catalog }: { catalog: AdminCatalogMetrics }) {
  const totalBand = catalog.priceBands.reduce((acc, b) => acc + b.count, 0);
  const totalNetwork = catalog.networkShare.reduce((acc, n) => acc + n.count, 0);

  const kpis = [
    { label: 'Cotações registradas', value: catalog.priceSnapshots.toLocaleString('pt-BR'), hint: 'Histórico de preço (snapshots)', Icon: Layers },
    { label: 'Cotações nas últimas 24 h', value: catalog.snapshotsLast24h.toLocaleString('pt-BR'), hint: 'Coletadas pela API oficial', Icon: Database },
    { label: 'Produtos no catálogo', value: catalog.masterProducts.toLocaleString('pt-BR'), hint: 'Um registro por jogo e plataforma', Icon: Store },
    { label: 'Última coleta', value: formatDateTime(catalog.lastSnapshotAt), hint: 'Snapshot mais recente', Icon: Clock3 },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, hint, Icon }) => (
          <Card key={label} variant="elevated">
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-[var(--color-text-tertiary)]">
                <Text variant="label">{label}</Text>
                <Icon className="size-4" aria-hidden />
              </div>
              <Text variant="heading-lg" className="mt-3 tabular font-bold text-[var(--color-accent-gold)]">
                {value}
              </Text>
              <Text variant="caption" color="tertiary" className="mt-1">
                {hint}
              </Text>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="border-b border-[var(--color-border-subtle)] pb-4">
              <Text variant="heading-md" className="flex items-center gap-2 font-bold">
                <BarChart3 className="size-5 text-[var(--color-accent-gold)]" aria-hidden />
                Ofertas ativas por faixa de preço
              </Text>
              <Text variant="caption" color="tertiary" className="mt-0.5">
                Escopo: oferta (cada anúncio de cada loja conta uma vez) · {totalBand.toLocaleString('pt-BR')} ofertas
              </Text>
            </div>
            {totalBand === 0 ? (
              <Text variant="body-sm" color="secondary">Nenhuma oferta ativa com preço coletado.</Text>
            ) : (
              <ul className="flex flex-col gap-3">
                {catalog.priceBands.map((band) => (
                  <li key={band.label} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--color-text-primary)]">{band.label}</span>
                      <span className="font-mono text-[var(--color-text-secondary)]">
                        {band.count.toLocaleString('pt-BR')} ({pct(band.count, totalBand).toFixed(1).replace('.', ',')}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-inset)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent-gold)]"
                        style={{ width: `${pct(band.count, totalBand)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="border-b border-[var(--color-border-subtle)] pb-4">
              <Text variant="heading-md" className="flex items-center gap-2 font-bold">
                <PieChart className="size-5 text-[var(--color-accent-gold)]" aria-hidden />
                Ofertas ativas por loja
              </Text>
              <Text variant="caption" color="tertiary" className="mt-0.5">
                Escopo: oferta · {catalog.networkShare.length} {catalog.networkShare.length === 1 ? 'loja com' : 'lojas com'} oferta ativa
              </Text>
            </div>
            {totalNetwork === 0 ? (
              <Text variant="body-sm" color="secondary">Nenhuma oferta ativa com preço coletado.</Text>
            ) : (
              <ul className="flex flex-col gap-3">
                {catalog.networkShare.map((n) => (
                  <li key={n.networkName} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--color-text-primary)]">{n.networkName}</span>
                      <span className="font-mono text-[var(--color-text-secondary)]">
                        {n.count.toLocaleString('pt-BR')} ({pct(n.count, totalNetwork).toFixed(1).replace('.', ',')}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-inset)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent-primary)]"
                        style={{ width: `${pct(n.count, totalNetwork)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div>
            <Text variant="heading-md" className="font-bold">Atalhos editoriais</Text>
            <Text variant="caption" color="tertiary" className="mt-0.5">
              Não há geração automática de pautas ou enquetes: o conteúdo é escrito por pessoas.
            </Text>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/noticias/novo">
                <Newspaper className="mr-1 size-3.5" aria-hidden /> Nova notícia
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/pesquisa">
                <Vote className="mr-1 size-3.5" aria-hidden /> Enquetes
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

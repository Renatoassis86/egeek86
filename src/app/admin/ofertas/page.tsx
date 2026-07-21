import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronRight, PackageSearch } from 'lucide-react';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { AdminOfferFilters } from '@/components/admin/admin-offer-filters';
import { AdminMeliExtractor } from '@/components/admin/admin-meli-extractor';
import { AdminAutomatedScraperMonitor } from '@/components/admin/admin-automated-scraper-monitor';
import { GAME_FORMAT_LABELS, GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { formatBRL } from '@/lib/format';
import { listOffersForAdminFiltered, listNetworks, type AdminOffersFilter } from '@/server/queries/affiliate';
import { pruneMerchandiseProducts } from '@/server/collector/discover-products';
import type { AffiliateOffer, GameFormat, GamePlatformGen, GameEditionType } from '@/db/schema';

const STATUS_VALUES: readonly AffiliateOffer['status'][] = ['draft', 'active', 'paused', 'expired', 'archived'];
const FORMAT_VALUES: readonly GameFormat[] = ['physical', 'digital', 'unknown'];
const GEN_VALUES: readonly GamePlatformGen[] = [
  'switch_1',
  'switch_2',
  'ps4',
  'ps5',
  'xbox_one',
  'xbox_series',
  'xbox_360',
  'unknown',
];
const EDITION_VALUES: readonly GameEditionType[] = ['full_game', 'upgrade_pack', 'dlc', 'bundle', 'unknown'];

const statusVariant = {
  draft: 'default',
  active: 'primary',
  paused: 'outline',
  expired: 'danger',
  archived: 'default',
} as const;

const statusLabel: Record<AffiliateOffer['status'], string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  expired: 'Expirada',
  archived: 'Arquivada',
};

function parseEnumParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Limpa souvenirs e chaveiros legados do catálogo
  await pruneMerchandiseProducts();

  const sp = await searchParams;

  const filter: AdminOffersFilter = {
    status: parseEnumParam(sp.status, STATUS_VALUES),
    gameFormat: parseEnumParam(sp.formato, FORMAT_VALUES),
    gamePlatformGen: parseEnumParam(sp.geracao, GEN_VALUES),
    gameEditionType: parseEnumParam(sp.edicao, EDITION_VALUES),
    networkId: typeof sp.rede === 'string' && sp.rede ? sp.rede : undefined,
    sortBy: sp.ordenar === 'price_asc' || sp.ordenar === 'price_desc' ? sp.ordenar : 'recent',
  };

  const [offers, networks, masterRes, offersRes, snapshotsRes, recentRes] = await Promise.all([
    listOffersForAdminFiltered(filter),
    listNetworks(),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM master_products`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM affiliate_offers WHERE status = 'active'`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM affiliate_price_snapshots`),
    db.execute<any>(sql`
      SELECT o.id, o.title, o.current_price_cents, o.image_url, o.published_at, n.name as network_name
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      ORDER BY o.published_at DESC
      LIMIT 5
    `),
  ]);

  const stats = {
    totalMasterProducts: masterRes[0]?.count ?? 0,
    totalActiveOffers: offersRes[0]?.count ?? 0,
    totalPriceSnapshots: snapshotsRes[0]?.count ?? 0,
    lastIngestedItems: recentRes.map((r) => ({
      id: r.id,
      title: r.title,
      priceCents: Number(r.current_price_cents || 0),
      imageUrl: r.image_url,
      networkName: r.network_name,
      publishedAt: r.published_at ? new Date(r.published_at).toLocaleTimeString('pt-BR') : 'Hoje',
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Text as="h1" variant="heading-xl">
            Ofertas & Extração Mercado Livre
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-1">
            {offers.length} {offers.length === 1 ? 'oferta encontrada' : 'ofertas encontradas'}
          </Text>
        </div>
        <Button asChild fullWidth className="sm:w-fit">
          <Link href="/admin/ofertas/novo">Nova oferta</Link>
        </Button>
      </div>

      <AdminAutomatedScraperMonitor stats={stats} />

      <AdminMeliExtractor />

      <Suspense fallback={null}>
        <AdminOfferFilters networks={networks} />
      </Suspense>

      {offers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <PackageSearch className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
            <Text variant="body-md">Nenhuma oferta encontrada.</Text>
            <Text variant="body-sm" color="secondary">
              Tente ajustar os filtros ou cadastre uma nova oferta.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: tabela densa e escaneável */}
          <div className="hidden overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Oferta</th>
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Rede</th>
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Classificação</th>
                  <th className="px-4 py-3 text-right text-caption font-medium text-[var(--color-text-tertiary)]">Preço</th>
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr
                    key={offer.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-surface)] transition-colors duration-[var(--duration-fast)]"
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <Link href={`/admin/ofertas/${offer.id}`} className="hover:underline">
                        <Text variant="body-sm" className="line-clamp-1">
                          {offer.title}
                        </Text>
                      </Link>
                      <Text variant="caption" color="tertiary" className="line-clamp-1">
                        {offer.masterProduct.name}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <Text variant="body-sm" color="secondary">
                        {offer.network.name}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {offer.masterProduct.gameFormat !== 'unknown' && (
                          <Badge variant="outline" size="sm">
                            {GAME_FORMAT_LABELS[offer.masterProduct.gameFormat]}
                          </Badge>
                        )}
                        {offer.masterProduct.gamePlatformGen !== 'unknown' && (
                          <Badge variant="outline" size="sm">
                            {GAME_PLATFORM_GEN_LABELS[offer.masterProduct.gamePlatformGen]}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Text variant="mono-md" className="tabular">
                        {formatBRL(offer.currentPriceCents)}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={statusVariant[offer.status]} size="sm">
                          {statusLabel[offer.status]}
                        </Badge>
                        {offer.affiliateLinkPending && (
                          <Badge variant="danger" size="sm" title="Sem link de afiliado real ainda — clique fica desabilitado pro público">
                            Link pendente
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1 text-right">
                      <Button asChild variant="ghost" size="icon-sm" aria-label="Ver detalhes da oferta">
                        <Link href={`/admin/ofertas/${offer.id}`}>
                          <ChevronRight className="size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados */}
          <div className="flex flex-col gap-2 lg:hidden">
            {offers.map((offer) => (
              <Link key={offer.id} href={`/admin/ofertas/${offer.id}`}>
                <Card interactive>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Text variant="body-md" className="line-clamp-1">
                          {offer.title}
                        </Text>
                      </div>
                      <Text variant="caption" color="tertiary" className="mt-0.5 line-clamp-1">
                        {offer.network.name} · {offer.masterProduct.name}
                      </Text>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Badge variant={statusVariant[offer.status]} size="sm">
                          {statusLabel[offer.status]}
                        </Badge>
                        {offer.affiliateLinkPending && (
                          <Badge variant="danger" size="sm">
                            Link pendente
                          </Badge>
                        )}
                        {offer.masterProduct.gameFormat !== 'unknown' && (
                          <Badge variant="outline" size="sm">
                            {GAME_FORMAT_LABELS[offer.masterProduct.gameFormat]}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Text variant="mono-md" className="tabular">
                        {formatBRL(offer.currentPriceCents)}
                      </Text>
                      <ChevronRight className="size-4 text-[var(--color-text-tertiary)]" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

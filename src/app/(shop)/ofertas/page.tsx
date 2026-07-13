import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { OfferCard } from '@/components/affiliate/offer-card';
import { OfferFilters } from '@/components/affiliate/offer-filters';
import {
  listRankedOffers,
  listNetworks,
  getOfferListingMetrics,
  type OfferWithRelations,
  type OfferListingMetrics,
} from '@/server/queries/affiliate';
import type { GameFormat, GamePlatformGen } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Ofertas',
  description: 'Os melhores preços em cultura geek nos principais marketplaces, com histórico de preço e cupons.',
};

const FORMAT_VALUES: readonly GameFormat[] = ['physical', 'digital', 'unknown'];
const GEN_VALUES: readonly GamePlatformGen[] = ['switch_1', 'switch_2', 'unknown'];

function parseEnumParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const gameFormat = parseEnumParam(sp.formato, FORMAT_VALUES);
  const gamePlatformGen = parseEnumParam(sp.geracao, GEN_VALUES);
  const networkId = typeof sp.rede === 'string' && sp.rede ? sp.rede : undefined;
  const sortBy = sp.ordenar === 'price_desc' ? 'price_desc' : 'price_asc';

  const [networks, pool] = await Promise.all([
    listNetworks(),
    listRankedOffers({ gameFormat, gamePlatformGen, networkId, sortBy, limit: 60 }),
  ]);

  const metricsMap = await getOfferListingMetrics(pool.map((o) => o.id));

  // Prioridade pedida pelo produto: Físico sempre antes de Digital.
  const physical = pool.filter((o) => o.masterProduct.gameFormat === 'physical');
  const digital = pool.filter((o) => o.masterProduct.gameFormat === 'digital');
  const other = pool.filter((o) => o.masterProduct.gameFormat === 'unknown');

  const featured = [...pool]
    .filter((o) => {
      const m = metricsMap.get(o.id);
      return m ? m.isLowestEver || (m.discountPercent ?? 0) > 0 : false;
    })
    .sort((a, b) => {
      const ma = metricsMap.get(a.id);
      const mb = metricsMap.get(b.id);
      const scoreA = (ma?.isLowestEver ? 1000 : 0) + (ma?.discountPercent ?? 0);
      const scoreB = (mb?.isLowestEver ? 1000 : 0) + (mb?.discountPercent ?? 0);
      return scoreB - scoreA;
    })
    .slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-12 lg:py-16">
      <Reveal>
        <Text as="h1" variant="heading-xl">
          Ofertas
        </Text>
        <Text variant="body-md" color="secondary" className="mt-2 max-w-[60ch]">
          Preços monitorados nos principais marketplaces, com histórico e cupons — pra você comprar
          na hora certa.
        </Text>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-6">
          <Suspense fallback={null}>
            <OfferFilters networks={networks} />
          </Suspense>
        </div>
      </Reveal>

      {pool.length === 0 ? (
        <Text variant="body-sm" color="secondary" className="mt-10">
          Nenhuma oferta encontrada com esses filtros. Tente outra combinação.
        </Text>
      ) : (
        <div className="mt-10 flex flex-col gap-14">
          {featured.length > 0 && (
            <OfferSection
              title="Melhores ofertas agora"
              icon={<Flame className="size-4 text-[var(--color-accent-hype)]" aria-hidden />}
              badgeLabel="Diferencial Geek 86"
              offers={featured}
              metricsMap={metricsMap}
            />
          )}

          {physical.length > 0 && <OfferSection title="Físico" offers={physical} metricsMap={metricsMap} />}

          {digital.length > 0 && <OfferSection title="Digital" offers={digital} metricsMap={metricsMap} />}

          {other.length > 0 && (
            <OfferSection title="Outras ofertas" offers={other} metricsMap={metricsMap} />
          )}
        </div>
      )}
    </section>
  );
}

function OfferSection({
  title,
  icon,
  badgeLabel,
  offers,
  metricsMap,
}: {
  title: string;
  icon?: ReactNode;
  badgeLabel?: string;
  offers: OfferWithRelations[];
  metricsMap: Map<string, OfferListingMetrics>;
}) {
  return (
    <div>
      <Reveal>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {icon}
          <Text as="h2" variant="heading-lg">
            {title}
          </Text>
          {badgeLabel && (
            <Badge variant="hype" size="sm">
              <Sparkles className="size-3" />
              {badgeLabel}
            </Badge>
          )}
        </div>
      </Reveal>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {offers.map((offer, i) => (
          <Reveal key={offer.id} delay={Math.min(i * 0.03, 0.3)}>
            <OfferCard offer={offer} metrics={metricsMap.get(offer.id)} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

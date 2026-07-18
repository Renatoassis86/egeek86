import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Flame, LineChart, Sparkles } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { OfferCard } from '@/components/affiliate/offer-card';
import { OfferFilters } from '@/components/affiliate/offer-filters';
import { cn } from '@/lib/cn';
import {
  listRankedOffers,
  listNetworks,
  getOfferListingMetrics,
  type OfferWithRelations,
  type OfferListingMetrics,
} from '@/server/queries/affiliate';
import type { GameFormat, GamePlatformGen, ProductType } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Ofertas',
  description: 'Os melhores preços em cultura geek nos principais marketplaces, com histórico de preço e cupons.',
};

const FORMAT_VALUES: readonly GameFormat[] = ['physical', 'digital', 'unknown'];
const GEN_VALUES: readonly GamePlatformGen[] = [
  'switch_1',
  'switch_2',
  'ps4',
  'ps5',
  'xbox_one',
  'xbox_series',
  'unknown',
];
const TYPE_VALUES: readonly ProductType[] = ['game', 'console', 'accessory'];

function parseEnumParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Cards de plataforma (Home) linkam com `?geracao=ps4,ps5` pra cobrir a marca inteira. */
function parseEnumListParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T[] | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (v == null) return undefined;
  const parsed = v.split(',').filter((item): item is T => (allowed as readonly string[]).includes(item));
  return parsed.length > 0 ? parsed : undefined;
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const gameFormat = parseEnumParam(sp.formato, FORMAT_VALUES);
  const gamePlatformGen = parseEnumListParam(sp.geracao, GEN_VALUES);
  const productType = parseEnumParam(sp.tipo, TYPE_VALUES);
  const networkId = typeof sp.rede === 'string' && sp.rede ? sp.rede : undefined;
  const sortBy = sp.ordenar === 'price_desc' ? 'price_desc' : 'price_asc';

  const [networks, pool] = await Promise.all([
    listNetworks(),
    listRankedOffers({ gameFormat, gamePlatformGen, productType, networkId, sortBy, limit: 60 }),
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

  const lowestEverCount = pool.filter((o) => metricsMap.get(o.id)?.isLowestEver).length;

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16">
      <div className="relative overflow-hidden rounded-[var(--radius-xl)]">
        <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.28} />
        <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.14} />

        {/* EG86 — marca completa na mesma fonte do logotipo, mesma imagem
            recortada dentro de cada letra. Fica só em xl+, onde sobra folga
            real ao lado do texto (que já é limitado a max-w-2xl/60ch, então
            nunca disputa espaço com o glifo). */}
        <div className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 xl:flex">
          {['E', 'G', '8', '6'].map((letter) => (
            <TextImageMask
              key={letter}
              text={letter}
              src="/images/ofertas/header-collage.png"
              className="text-[80px]"
            />
          ))}
        </div>

        <div className="relative xl:max-w-[65%]">
          <Reveal>
            <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
              <LineChart className="size-3.5" aria-hidden />
              Geek Deals · Inteligência de preço
            </Text>
            <Text as="h1" variant="display-md" className="mt-3 max-w-2xl">
              Ofertas
            </Text>
            <Text variant="body-md" color="secondary" className="mt-3 max-w-[60ch]">
              Preços monitorados nos principais marketplaces, com histórico e cupons, pra você
              comprar na hora certa.
            </Text>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
              <StatBlock value={pool.length} label="ofertas monitoradas" />
              <StatBlock value={lowestEverCount} label="no menor preço histórico" accent="hype" />
              <StatBlock value={networks.length} label="lojas parceiras" />
            </div>
          </Reveal>
        </div>
      </div>

      <div className="sticky top-[calc(var(--header-mobile)+8px)] lg:top-[calc(var(--header-desktop)+12px)] z-20 mt-8">
        <Suspense fallback={null}>
          <OfferFilters networks={networks} resultCount={pool.length} />
        </Suspense>
      </div>

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
              cardVariant="feature"
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

function StatBlock({
  value,
  label,
  accent = 'gold',
}: {
  value: number;
  label: string;
  accent?: 'gold' | 'hype';
}) {
  return (
    <div className="flex flex-col">
      <Text
        variant="mono-lg"
        className={cn(
          'text-[26px] leading-none tabular',
          accent === 'hype' ? 'text-[var(--color-accent-hype)]' : 'text-[var(--color-accent-primary)]'
        )}
      >
        {value}
      </Text>
      <Text variant="caption" color="tertiary" className="mt-1.5">
        {label}
      </Text>
    </div>
  );
}

function OfferSection({
  title,
  icon,
  badgeLabel,
  offers,
  metricsMap,
  cardVariant = 'grid',
}: {
  title: string;
  icon?: ReactNode;
  badgeLabel?: string;
  offers: OfferWithRelations[];
  metricsMap: Map<string, OfferListingMetrics>;
  cardVariant?: 'grid' | 'feature';
}) {
  return (
    <div>
      <Reveal>
        <div className="flex flex-wrap items-center gap-2.5 mb-5">
          {icon}
          <Text as="h2" variant="heading-lg">
            {title}
          </Text>
          <Badge variant="outline" size="sm">
            {offers.length}
          </Badge>
          {badgeLabel && (
            <Badge variant="hype" size="sm">
              <Sparkles className="size-3" />
              {badgeLabel}
            </Badge>
          )}
        </div>
      </Reveal>
      <div
        className={cn(
          cardVariant === 'feature'
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-4'
            : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4'
        )}
      >
        {offers.map((offer, i) => (
          <Reveal key={offer.id} delay={Math.min(i * 0.03, 0.3)}>
            <OfferCard offer={offer} metrics={metricsMap.get(offer.id)} variant={cardVariant} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

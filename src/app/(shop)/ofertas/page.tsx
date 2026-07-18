import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import Image from 'next/image';
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

  // Separados por plataforma de jogos por padrão
  const playstation = pool.filter((o) => o.masterProduct.gamePlatformGen === 'ps5' || o.masterProduct.gamePlatformGen === 'ps4');
  const nintendo = pool.filter((o) => o.masterProduct.gamePlatformGen === 'switch' || o.masterProduct.gamePlatformGen === 'switch_2');
  const xbox = pool.filter((o) => o.masterProduct.gamePlatformGen === 'xbox_series' || o.masterProduct.gamePlatformGen === 'xbox_one');
  const other = pool.filter((o) => 
    o.masterProduct.gamePlatformGen !== 'ps5' && 
    o.masterProduct.gamePlatformGen !== 'ps4' && 
    o.masterProduct.gamePlatformGen !== 'switch' && 
    o.masterProduct.gamePlatformGen !== 'switch_2' && 
    o.masterProduct.gamePlatformGen !== 'xbox_series' && 
    o.masterProduct.gamePlatformGen !== 'xbox_one'
  );

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

        {/* Imagem do banner inteira com recorte diagonal na esquerda (igual Hype Zone) */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[48%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
          <div 
            className="relative w-full h-full"
            style={{
              clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)',
            }}
          >
            <Image
              src="/images/ofertas/header-collage.png"
              alt="Geek Deals Banner"
              fill
              className="object-cover object-center"
              priority
            />
            {/* Gradiente sutil de fade na junção do corte diagonal */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-transparent to-transparent opacity-80 pointer-events-none" />
          </div>
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

          {playstation.length > 0 && <OfferSection title="PlayStation" offers={playstation} metricsMap={metricsMap} />}

          {nintendo.length > 0 && <OfferSection title="Nintendo" offers={nintendo} metricsMap={metricsMap} />}

          {xbox.length > 0 && <OfferSection title="Xbox" offers={xbox} metricsMap={metricsMap} />}

          {other.length > 0 && (
            <OfferSection title="Geral / Outros" offers={other} metricsMap={metricsMap} />
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

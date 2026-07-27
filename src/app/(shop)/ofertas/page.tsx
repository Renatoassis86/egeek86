import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Flame, TrendingDown, Gamepad2, Monitor, Headphones, Sparkles, LineChart } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { OfferFilters } from '@/components/affiliate/offer-filters';
import { MarketplaceHeroBanner } from '@/components/affiliate/marketplace-hero-banner';
import { GroupedOfferShelf } from '@/components/affiliate/grouped-offer-shelf';
import {
  listRankedOffers,
  listNetworks,
  getOfferListingMetrics,
  getFeaturedOffers,
  getActiveCouponsForDisplay,
  type OfferWithRelations,
  type OfferListingMetrics,
} from '@/server/queries/affiliate';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import type { GameFormat, GamePlatformGen, ProductType } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Ofertas & Preços Monitorados',
  description: 'Os melhores preços em cultura geek nos principais marketplaces, com histórico autêntico e cupons do dia.',
};

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
const TYPE_VALUES: readonly ProductType[] = ['game', 'console', 'accessory'];

function parseEnumParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

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
  const search = typeof sp.q === 'string' ? sp.q.trim() : '';

  const baseFilter = { gameFormat, productType, networkId, sortBy: sortBy as 'price_asc' | 'price_desc' };

  const [networks, coupons] = await Promise.all([listNetworks(), getActiveCouponsForDisplay()]);

  // Se houver busca por texto ativa, exibe visualização de resultados de busca
  if (search) {
    const results = await listRankedOffers({ ...baseFilter, gamePlatformGen, search, limit: 60 });
    const metricsMap = await getOfferListingMetrics(results.map((o) => o.id));

    return (
      <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16">
        <Reveal>
          <Text as="h1" variant="display-md">
            Resultados para &quot;{search}&quot;
          </Text>
        </Reveal>

        <div className="sticky top-[calc(var(--header-mobile)+8px)] lg:top-[calc(var(--header-desktop)+12px)] z-20 mt-8">
          <Suspense fallback={null}>
            <OfferFilters networks={networks} resultCount={results.length} />
          </Suspense>
        </div>

        {results.length === 0 ? (
          <Text variant="body-sm" color="secondary" className="mt-10">
            Nenhuma oferta encontrada para &quot;{search}&quot;. Tente outro termo ou remova os filtros.
          </Text>
        ) : (
          <div className="mt-10">
            <GroupedOfferShelf
              title={`Resultados para "${search}"`}
              offers={results}
              metricsMap={metricsMap}
            />
          </div>
        )}
      </section>
    );
  }

  // Carregamento dos dados gerais e prateleiras comerciais
  const [broadPool, featured] = await Promise.all([
    listRankedOffers({ ...baseFilter, gamePlatformGen, limit: 200 }),
    getFeaturedOffers({ ...baseFilter, gamePlatformGen }, 6),
  ]);

  const allOfferIds = [
    ...broadPool.map((o) => o.id),
    ...featured.map((o) => o.id),
  ];
  const metricsMap = await getOfferListingMetrics(allOfferIds);

  const lowestEverOffers = broadPool.filter((o) => metricsMap.get(o.id)?.isLowestEver);
  const nintendoOffers = broadPool.filter(
    (o) => o.masterProduct.gamePlatformGen === 'switch_1' || o.masterProduct.gamePlatformGen === 'switch_2'
  );
  const psXboxOffers = broadPool.filter(
    (o) =>
      o.masterProduct.gamePlatformGen === 'ps5' ||
      o.masterProduct.gamePlatformGen === 'ps4' ||
      o.masterProduct.gamePlatformGen === 'xbox_series' ||
      o.masterProduct.gamePlatformGen === 'xbox_one'
  );
  const accessoryOffers = broadPool.filter((o) => o.masterProduct.productType === 'accessory');

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-8 lg:py-12 flex flex-col gap-10">
      {/* Banner Principal com Carrossel de Cupons do Dia no Lado Direito */}
      <MarketplaceHeroBanner
        title="Vitrine de Ofertas"
        subtitle="Preços monitorados nos principais marketplaces, histórico de cotações autêntico e cupons ativos para você comprar na hora certa."
        categoryTag="Geek Deals · Inteligência de Mercado"
        stats={{
          monitoredProducts: broadPool.length,
          lowestPriceCount: lowestEverOffers.length,
          partnerStores: networks.length,
        }}
        coupons={coupons}
      />

      {/* Barra de Filtros de Catálogo */}
      <div className="sticky top-[calc(var(--header-mobile)+8px)] lg:top-[calc(var(--header-desktop)+12px)] z-20">
        <Suspense fallback={null}>
          <OfferFilters networks={networks} resultCount={broadPool.length} />
        </Suspense>
      </div>

      {/* Prateleiras Agrupadas de Produtos Estilo Marketplace */}
      {broadPool.length === 0 ? (
        <Text variant="body-sm" color="secondary" className="mt-6">
          Nenhuma oferta encontrada com esses filtros. Tente outra combinação.
        </Text>
      ) : (
        <div className="flex flex-col gap-12 mt-4">
          {/* Seção 1: Tá vendendo muito */}
          {featured.length > 0 && (
            <GroupedOfferShelf
              title="Tá Vendendo Muito · Destaques da Semana"
              subtitle="Ofertas mais procuradas e populares com ótimas condições de preço"
              icon={<Flame className="size-5 text-[var(--color-accent-hype)]" aria-hidden />}
              badgeLabel="Destaque Geek 86"
              offers={featured}
              metricsMap={metricsMap}
              cardVariant="feature"
            />
          )}

          {/* Seção 2: No Menor Preço Histórico */}
          {lowestEverOffers.length > 0 && (
            <GroupedOfferShelf
              title="No Menor Preço Histórico"
              subtitle="Produtos que atingiram o menor valor já registrado no nosso monitoramento"
              icon={<TrendingDown className="size-5 text-[var(--color-accent-success)]" aria-hidden />}
              badgeLabel="Oportunidade Real"
              offers={lowestEverOffers.slice(0, 8)}
              metricsMap={metricsMap}
            />
          )}

          {/* Seção 3: Universo Nintendo Switch */}
          {nintendoOffers.length > 0 && (
            <GroupedOfferShelf
              title="Universo Nintendo Switch"
              subtitle="Jogos em mídia física e acessórios para Nintendo Switch"
              icon={<Gamepad2 className="size-5 text-red-500" aria-hidden />}
              offers={nintendoOffers.slice(0, 8)}
              metricsMap={metricsMap}
            />
          )}

          {/* Seção 4: Ecossistema PlayStation & Xbox */}
          {psXboxOffers.length > 0 && (
            <GroupedOfferShelf
              title="Ecossistema PlayStation & Xbox"
              subtitle="Títulos e lançamentos para PS5, PS4 e Xbox Series X|S"
              icon={<Monitor className="size-5 text-blue-500" aria-hidden />}
              offers={psXboxOffers.slice(0, 8)}
              metricsMap={metricsMap}
            />
          )}

          {/* Seção 5: Hardware & Acessórios Gamer */}
          {accessoryOffers.length > 0 && (
            <GroupedOfferShelf
              title="Hardware, Joysticks & Acessórios Gamer"
              subtitle="Controles, headsets e equipamentos de alta performance"
              icon={<Headphones className="size-5 text-[var(--color-accent-hype)]" aria-hidden />}
              offers={accessoryOffers.slice(0, 8)}
              metricsMap={metricsMap}
            />
          )}
        </div>
      )}
    </section>
  );
}

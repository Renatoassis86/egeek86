import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { OfferCard } from '@/components/affiliate/offer-card';
import { listRankedOffers, getOfferListingMetrics, type RankedOffersFilter } from '@/server/queries/affiliate';

async function fetchRow(title: string, href: string, filter: RankedOffersFilter) {
  const offers = await listRankedOffers({ ...filter, limit: 6, sortBy: filter.sortBy ?? 'price_asc' });
  return { title, href, offers };
}

/**
 * Módulo de vendas em destaque — dado real (listRankedOffers), não mockup.
 * Segmentado por preço e por geração de console. Só físico aqui de propósito
 * (decisão do produto): digital fica reservado pro filtro em /ofertas, não
 * disputa espaço de destaque na home. Cada linha só aparece quando existe
 * pelo menos 1 oferta real daquela geração — PS4/PS5/Xbox somem sozinhos até
 * a descoberta automática (discover-products.ts, já busca esses termos)
 * popular catálogo real pra eles, sem precisar mexer neste componente.
 */
export async function SalesHighlights() {
  const [cheapest, consoles, switch2, switch1, ps5, ps4, xboxSeries, xboxOne] = await Promise.all([
    fetchRow('Menor preço agora', '/ofertas?ordenar=price_asc&formato=physical', { sortBy: 'price_asc', gameFormat: 'physical' }),
    // Consoles (hardware) — productType='console' cruza todas as plataformas
    // na mesma linha, não segmenta por geração como as linhas de jogo abaixo.
    fetchRow('Consoles', '/ofertas', { productType: 'console' }),
    fetchRow('Switch 2', '/ofertas?geracao=switch_2&formato=physical', { gamePlatformGen: 'switch_2', gameFormat: 'physical' }),
    fetchRow('Switch 1', '/ofertas?geracao=switch_1&formato=physical', { gamePlatformGen: 'switch_1', gameFormat: 'physical' }),
    fetchRow('PS5', '/ofertas?geracao=ps5&formato=physical', { gamePlatformGen: 'ps5', gameFormat: 'physical' }),
    fetchRow('PS4', '/ofertas?geracao=ps4&formato=physical', { gamePlatformGen: 'ps4', gameFormat: 'physical' }),
    fetchRow('Xbox Series', '/ofertas?geracao=xbox_series&formato=physical', { gamePlatformGen: 'xbox_series', gameFormat: 'physical' }),
    fetchRow('Xbox One', '/ofertas?geracao=xbox_one&formato=physical', { gamePlatformGen: 'xbox_one', gameFormat: 'physical' }),
  ]);

  const rows = [cheapest, consoles, switch2, switch1, ps5, ps4, xboxSeries, xboxOne].filter((r) => r.offers.length > 0);
  if (rows.length === 0) return null;

  const allOfferIds = rows.flatMap((r) => r.offers.map((o) => o.id));
  const metricsMap = await getOfferListingMetrics(allOfferIds);

  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
      <Reveal>
        <div className="mb-10 max-w-[46ch]">
          <Text variant="label" color="tertiary">
            Destaques de venda
          </Text>
          <Text as="h2" variant="display-lg" className="mt-2">
            Jogos em alta, por preço e por geração.
          </Text>
          <Text variant="body-md" color="secondary" className="mt-3">
            Essa é só a vitrine de destaque. Pra ver tudo com todos os filtros de consultoria, a busca completa
            mora em <Link href="/ofertas" className="underline hover:text-[var(--color-text-primary)]">ofertas</Link>.
          </Text>
        </div>
      </Reveal>

      <div className="flex flex-col gap-14">
        {rows.map((row, i) => (
          <Reveal key={row.title} delay={i * 0.05}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <Text as="h3" variant="heading-lg">
                {row.title}
              </Text>
              <Link
                href={row.href}
                className="inline-flex shrink-0 items-center gap-1 text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Ver todos
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {row.offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} metrics={metricsMap.get(offer.id)} />
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { OfferCard } from '@/components/affiliate/offer-card';
import { listRankedOffers, getFeaturedOffers, getOfferListingMetrics, type RankedOffersFilter } from '@/server/queries/affiliate';

function deduplicateAndFilterOffers(
  offers: OfferWithRelations[],
  metricsMap: Map<string, any>,
  limit = 6
): OfferWithRelations[] {
  const seenMasterProductIds = new Set<string>();
  const filtered: OfferWithRelations[] = [];

  for (const offer of offers) {
    // Evita repetir o mesmo item/produto no carrossel de destaques
    if (seenMasterProductIds.has(offer.masterProductId)) {
      continue;
    }

    const metrics = metricsMap.get(offer.id);
    // Em destaques/melhores ofertas, desconsiderar ofertas com aumento de preço em relação à média
    if (metrics?.avgPriceCents30d && offer.currentPriceCents > metrics.avgPriceCents30d) {
      continue;
    }

    seenMasterProductIds.add(offer.masterProductId);
    filtered.push(offer);

    if (filtered.length >= limit) break;
  }

  // Se a filtragem estrita de desconto deixou a lista muito pequena, aceita os únicos por produto
  if (filtered.length < limit) {
    for (const offer of offers) {
      if (filtered.some((f) => f.masterProductId === offer.masterProductId)) continue;
      filtered.push(offer);
      if (filtered.length >= limit) break;
    }
  }

  return filtered;
}

async function fetchRow(title: string, href: string, filter: RankedOffersFilter) {
  const offers = await listRankedOffers({ ...filter, limit: 30, sortBy: filter.sortBy ?? 'price_asc' });
  return { title, href, rawOffers: offers };
}

/**
 * Módulo de vendas em destaque — dado real (listRankedOffers), não mockup.
 * Desduplicado por produto e filtrado para mostrar apenas a melhor cotação.
 */
export async function SalesHighlights() {
  try {
    const [featuredOffersRaw, consolesRaw, switch2Raw, switch1Raw, ps5Raw, ps4Raw, xboxSeriesRaw, xboxOneRaw] = await Promise.all([
      getFeaturedOffers({ gameFormat: 'physical' }, 30),
      fetchRow('Consoles', '/ofertas', { productType: 'console' }),
      fetchRow('Switch 2', '/ofertas?geracao=switch_2&formato=physical', { gamePlatformGen: 'switch_2', gameFormat: 'physical' }),
      fetchRow('Switch 1', '/ofertas?geracao=switch_1&formato=physical', { gamePlatformGen: 'switch_1', gameFormat: 'physical' }),
      fetchRow('PS5', '/ofertas?geracao=ps5&formato=physical', { gamePlatformGen: 'ps5', gameFormat: 'physical' }),
      fetchRow('PS4', '/ofertas?geracao=ps4&formato=physical', { gamePlatformGen: 'ps4', gameFormat: 'physical' }),
      fetchRow('Xbox Series', '/ofertas?geracao=xbox_series&formato=physical', { gamePlatformGen: 'xbox_series', gameFormat: 'physical' }),
      fetchRow('Xbox One', '/ofertas?geracao=xbox_one&formato=physical', { gamePlatformGen: 'xbox_one', gameFormat: 'physical' }),
    ]);

    const rawRows = [
      { title: 'Melhores ofertas agora', href: '/ofertas', rawOffers: featuredOffersRaw },
      consolesRaw,
      switch2Raw,
      switch1Raw,
      ps5Raw,
      ps4Raw,
      xboxSeriesRaw,
      xboxOneRaw,
    ];

    const allOfferIds = rawRows.flatMap((r) => r.rawOffers.map((o) => o.id));
    const metricsMap = await getOfferListingMetrics(allOfferIds);

    const rows = rawRows
      .map((r) => ({
        title: r.title,
        href: r.href,
        offers: deduplicateAndFilterOffers(r.rawOffers, metricsMap, 6),
      }))
      .filter((r) => r.offers.length > 0);

    if (rows.length === 0) return null;

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
  } catch (e) {
    console.error('Erro em SalesHighlights:', e);
    return null;
  }
}

import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { OfferCard } from '@/components/affiliate/offer-card';
import { getPublicOffers } from '@/server/queries/affiliate';

export const metadata: Metadata = {
  title: 'Ofertas',
  description: 'Os melhores preços em cultura geek nos principais marketplaces, com histórico de preço e cupons.',
};

export default async function OffersPage() {
  const offers = await getPublicOffers();

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

      {offers.length === 0 ? (
        <Text variant="body-sm" color="secondary" className="mt-8">
          Nenhuma oferta publicada ainda. Volte em breve!
        </Text>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {offers.map((offer, i) => (
            <Reveal key={offer.id} delay={Math.min(i * 0.03, 0.3)}>
              <OfferCard offer={offer} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Flame, ShieldCheck, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { formatBRL, formatDiscountLabel } from '@/lib/format';
import { isLowestPrice } from '@/lib/affiliate/message-template';
import { getOfferBySlug, getOfferMetrics, listActiveCouponsByNetwork } from '@/server/queries/affiliate';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) return {};

  return {
    title: offer.title,
    description: `${offer.title} por ${formatBRL(offer.currentPriceCents)} na ${offer.network.name}. Confira histórico de preço e cupons no Espaço Geek 86.`,
  };
}

export default async function OfferDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  const [metrics, coupons] = await Promise.all([
    getOfferMetrics(offer.id),
    listActiveCouponsByNetwork(offer.networkId),
  ]);

  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;
  const isLowest = metrics ? isLowestPrice(offer.currentPriceCents, metrics.lowestPriceCents) : false;

  return (
    <section className="mx-auto max-w-5xl px-4 lg:px-8 py-10 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-2">
        <Reveal>
          <div className="aspect-square rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] flex items-center justify-center overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={offer.title} className="h-full w-full object-cover" />
            ) : (
              <Tag className="size-16 text-[var(--color-text-tertiary)]" aria-hidden />
            )}
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-col gap-4">
            <Badge variant="outline" size="md" className="w-fit">
              {offer.network.name}
            </Badge>
            <Text as="h1" variant="heading-xl">
              {offer.title}
            </Text>

            {isLowest && (
              <Badge variant="hype" size="lg" className="w-fit">
                <Flame className="size-3.5" />
                Menor preço já registrado
              </Badge>
            )}

            <Text variant="display-md" className="tabular">
              {formatBRL(offer.currentPriceCents)}
            </Text>

            {metrics && (
              <Text variant="body-sm" color="secondary">
                Menor histórico: {formatBRL(metrics.lowestPriceCents)} (em{' '}
                {metrics.lowestPriceAt.toLocaleDateString('pt-BR')})
                {metrics.avgPriceCents30d != null && <> · Média 30d: {formatBRL(metrics.avgPriceCents30d)}</>}
              </Text>
            )}

            {coupons.length > 0 && (
              <Card variant="outline">
                <CardContent className="p-4">
                  <Text variant="label" color="tertiary">
                    Cupom disponível
                  </Text>
                  <Text variant="body-md" className="font-mono mt-1">
                    {coupons[0].code} — {formatDiscountLabel(coupons[0].discountType, coupons[0].discountValue)}
                  </Text>
                  {coupons[0].description && (
                    <Text variant="caption" color="secondary">
                      {coupons[0].description}
                    </Text>
                  )}
                </CardContent>
              </Card>
            )}

            <Button asChild size="lg" leftIcon={<ShieldCheck className="size-4" />}>
              <a href={`/go/${offer.slug}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                Ver oferta na {offer.network.name}
              </a>
            </Button>

            {offer.highlightNote && (
              <Text variant="caption" color="hype">
                {offer.highlightNote}
              </Text>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import Link from 'next/link';
import { Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import type { OfferWithRelations } from '@/server/queries/affiliate';

export function OfferCard({ offer }: { offer: OfferWithRelations }) {
  const images = offer.masterProduct.defaultImages as unknown as string[];
  const image = offer.imageUrl ?? images?.[0] ?? null;

  return (
    <Link href={`/ofertas/${offer.slug}`} className="group">
      <Card interactive className="h-full overflow-hidden">
        <div className="aspect-square bg-[var(--color-bg-inset)] flex items-center justify-center overflow-hidden">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={offer.title} className="h-full w-full object-cover" />
          ) : (
            <Tag className="size-10 text-[var(--color-text-tertiary)]" aria-hidden />
          )}
        </div>
        <CardContent className="p-4">
          <Badge variant="outline" size="sm" className="mb-2">
            {offer.network.name}
          </Badge>
          <Text variant="body-sm" className="line-clamp-2 min-h-10">
            {offer.title}
          </Text>
          <Text variant="mono-md" className="tabular mt-2 block">
            {formatBRL(offer.currentPriceCents)}
          </Text>
          {offer.highlightNote && (
            <Text variant="caption" color="hype" className="mt-1 block">
              {offer.highlightNote}
            </Text>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

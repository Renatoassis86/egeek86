import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { listOffersForAdmin } from '@/server/queries/affiliate';

const statusVariant = {
  draft: 'default',
  active: 'primary',
  paused: 'outline',
  expired: 'danger',
  archived: 'default',
} as const;

export default async function AdminOffersPage() {
  const offers = await listOffersForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Text as="h1" variant="heading-xl">
          Ofertas
        </Text>
        <Button asChild>
          <Link href="/admin/ofertas/novo">Nova oferta</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {offers.length === 0 && (
          <Text variant="body-sm" color="secondary">
            Nenhuma oferta cadastrada ainda.
          </Text>
        )}
        {offers.map((offer) => (
          <Link key={offer.id} href={`/admin/ofertas/${offer.id}`}>
            <Card interactive>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Text variant="body-md">{offer.title}</Text>
                    <Badge variant={statusVariant[offer.status]} size="sm">
                      {offer.status}
                    </Badge>
                  </div>
                  <Text variant="caption" color="tertiary" className="mt-0.5">
                    {offer.network.name} · {offer.masterProduct.name}
                  </Text>
                </div>
                <Text variant="mono-md" className="tabular">
                  {formatBRL(offer.currentPriceCents)}
                </Text>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

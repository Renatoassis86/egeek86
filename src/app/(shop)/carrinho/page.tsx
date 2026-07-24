import Image from 'next/image';
import Link from 'next/link';
import { ShoppingBag, Clock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { RemoveCartItemButton } from '@/components/affiliate/remove-cart-item-button';
import { formatBRL } from '@/lib/format';
import { requireCustomer } from '@/lib/auth/require-customer';
import { getCartItemsForUser } from '@/server/queries/cart';

export const metadata = { title: 'Carrinho' };
export const dynamic = 'force-dynamic';

export default async function CarrinhoPage() {
  const profile = await requireCustomer();
  const items = await getCartItemsForUser(profile.id);

  return (
    <section className="mx-auto max-w-2xl px-4 lg:px-8 py-10 lg:py-14">
      <Reveal>
        <Text as="h1" variant="heading-xl">
          Carrinho
        </Text>
        <Text variant="body-md" color="secondary" className="mt-1">
          Itens que você marcou interesse — nosso time vai buscar o link de afiliado de cada um e te
          avisar pelo WhatsApp assim que estiverem prontos.
        </Text>
      </Reveal>

      <Reveal delay={0.05}>
        {items.length === 0 ? (
          <Card className="mt-8">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <ShoppingBag className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
              <Text variant="body-md">Seu carrinho está vazio.</Text>
              <Button asChild size="sm" className="mt-1">
                <Link href="/ofertas">Ver ofertas</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {items.map((item) => (
              <Card key={item.cartItemId}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)]">
                    {item.imageUrl && (
                      <Image src={item.imageUrl} alt={item.title} fill className="object-cover" sizes="56px" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" className="line-clamp-1">
                      {item.title}
                    </Text>
                    <Text variant="caption" color="tertiary" className="line-clamp-1">
                      {item.networkName} · {item.masterProductName}
                    </Text>
                    <div className="mt-1 flex items-center gap-2">
                      <Text variant="mono-md" className="tabular">
                        {formatBRL(item.currentPriceCents)}
                      </Text>
                      {item.affiliateLinkPending ? (
                        <Badge variant="outline" size="sm" className="gap-1">
                          <Clock className="size-3" />
                          Aguardando link
                        </Badge>
                      ) : (
                        <Badge variant="primary" size="sm" className="gap-1">
                          <CheckCircle2 className="size-3" />
                          Pronto
                        </Badge>
                      )}
                    </div>
                  </div>
                  <RemoveCartItemButton cartItemId={item.cartItemId} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}

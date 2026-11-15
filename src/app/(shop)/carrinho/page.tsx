import Link from 'next/link';
import { ShoppingBag, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ProductImage } from '@/components/ui/product-image';
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
          Os jogos que você separou para comprar. Clique em Ir à loja para finalizar a compra direto no site da loja.
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
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <ProductImage src={item.imageUrl} alt={item.title} padding="sm" className="size-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Text variant="body-sm" className="line-clamp-2 font-medium">
                        {item.title}
                      </Text>
                      <Text variant="caption" color="tertiary" className="mt-0.5">
                        {item.networkName}
                      </Text>
                      <Text variant="mono-md" className="tabular mt-1">
                        {formatBRL(item.currentPriceCents)}
                      </Text>
                    </div>
                    <RemoveCartItemButton cartItemId={item.cartItemId} />
                  </div>
                  <Button asChild size="md" className="w-full sm:w-auto">
                    <a href={`/go/${item.offerSlug}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                      <ExternalLink className="size-4" />
                      Ir à loja
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}

import Link from 'next/link';
import { ShoppingBag, ChevronRight, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SendCartMessageButton } from '@/components/admin/send-cart-message-button';
import { formatBRL } from '@/lib/format';
import { getPendingCartsForAdmin } from '@/server/queries/cart';

export const metadata = { title: 'Admin: Carrinhos' };
export const dynamic = 'force-dynamic';

export default async function AdminCartsPage() {
  const groups = await getPendingCartsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Carrinhos
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Compradores que marcaram interesse em itens — resolva o link de afiliado de cada um e envie a
          mensagem com os links prontos.
        </Text>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShoppingBag className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
            <Text variant="body-md">Nenhum carrinho pendente no momento.</Text>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const allReady = group.items.every((i) => !i.affiliateLinkPending);
          return (
            <Card key={group.userId}>
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Text variant="body-md" className="font-bold">
                      {group.userName}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {group.userPhone ?? 'sem telefone cadastrado'} · {group.items.length}{' '}
                      {group.items.length === 1 ? 'item' : 'itens'}
                    </Text>
                  </div>
                  {!group.whatsappOptIn ? (
                    <Badge variant="danger" size="sm" className="gap-1">
                      <AlertTriangle className="size-3" />
                      Comprador não autorizou WhatsApp
                    </Badge>
                  ) : allReady ? (
                    <SendCartMessageButton userId={group.userId} />
                  ) : (
                    <Badge variant="outline" size="sm" className="gap-1">
                      <Clock className="size-3" />
                      Aguardando link(s) de afiliado
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-3"
                    >
                      <div className="min-w-0">
                        <Text variant="body-sm" className="line-clamp-1">
                          {item.title}
                        </Text>
                        <Text variant="caption" color="tertiary">
                          {item.networkName} · {formatBRL(item.currentPriceCents)}
                        </Text>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.affiliateLinkPending ? (
                          <Badge variant="danger" size="sm">
                            Link pendente
                          </Badge>
                        ) : (
                          <Badge variant="primary" size="sm" className="gap-1">
                            <CheckCircle2 className="size-3" />
                            Pronto
                          </Badge>
                        )}
                        <Button asChild variant="ghost" size="icon-sm" aria-label="Resolver link de afiliado">
                          <Link href={`/admin/ofertas/${item.offerId}`}>
                            <ChevronRight className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

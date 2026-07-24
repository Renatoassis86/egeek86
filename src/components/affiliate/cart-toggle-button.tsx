'use client';

import * as React from 'react';
import { ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { toggleCartItem } from '@/server/actions/cart';

export function CartToggleButton({ offerId, initialInCart }: { offerId: string; initialInCart: boolean }) {
  const [inCart, setInCart] = React.useState(initialInCart);
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    const next = !inCart;
    setInCart(next); // otimista
    setPending(true);
    try {
      await toggleCartItem(offerId, next);
      toast.success(next ? 'Adicionado ao carrinho.' : 'Removido do carrinho.');
    } catch {
      setInCart(!next); // desfaz em caso de erro
      toast.error('Não foi possível atualizar agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={inCart ? 'secondary' : 'outline'}
      size="lg"
      disabled={pending}
      leftIcon={<ShoppingBag className={cn('size-4', inCart && 'fill-[var(--color-accent-primary)]/20')} />}
      onClick={handleClick}
      className={inCart ? 'border-[var(--color-accent-primary)]/40 text-[var(--color-accent-primary)]' : undefined}
    >
      {inCart ? 'No carrinho' : 'Adicionar ao carrinho'}
    </Button>
  );
}

'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { removeCartItem } from '@/server/actions/cart';

export function RemoveCartItemButton({ cartItemId }: { cartItemId: string }) {
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await removeCartItem(cartItemId);
    } catch {
      toast.error('Não foi possível remover agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="icon-sm" aria-label="Remover do carrinho" disabled={pending} onClick={handleClick}>
      <X className="size-4" />
    </Button>
  );
}

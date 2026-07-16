'use client';

import * as React from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { toggleWatch } from '@/server/actions/price-watches';

export function WatchToggleButton({
  masterProductId,
  initialWatching,
}: {
  masterProductId: string;
  initialWatching: boolean;
}) {
  const [watching, setWatching] = React.useState(initialWatching);
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    const next = !watching;
    setWatching(next); // otimista
    setPending(true);
    try {
      await toggleWatch(masterProductId, next);
      toast.success(next ? 'Adicionado aos seus jogos acompanhados.' : 'Removido dos acompanhados.');
    } catch {
      setWatching(!next); // desfaz em caso de erro
      toast.error('Não foi possível atualizar agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  // Estado "watching" usa secondary (não primary) de propósito: o CTA principal
  // ("Ver oferta") já é gold/primary — dois botões gold lado a lado leriam como
  // duplicados. O coração acompanhando ganha destaque via cor do ícone/texto.
  return (
    <Button
      variant={watching ? 'secondary' : 'outline'}
      size="lg"
      disabled={pending}
      leftIcon={
        <Heart
          className={cn(
            'size-4 transition-colors duration-[var(--duration-fast)]',
            watching && 'fill-[var(--color-accent-hype)] text-[var(--color-accent-hype)]'
          )}
        />
      }
      onClick={handleClick}
      className={watching ? 'border-[var(--color-accent-hype)]/40 text-[var(--color-accent-hype)]' : undefined}
    >
      {watching ? 'Acompanhando' : 'Acompanhar preço'}
    </Button>
  );
}

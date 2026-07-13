'use client';

import * as React from 'react';
import { Copy, MessageSquareText } from 'lucide-react';
import { unstable_rethrow } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { buildWhatsappMessage } from '@/lib/affiliate/message-template';
import { recordMessageCopied } from '@/server/actions/affiliate';

export interface WhatsappMessageDrawerProps {
  offerId: string;
  title: string;
  networkName: string;
  currentPriceCents: number;
  listPriceCents?: number | null;
  lowestPriceCents: number;
  lowestPriceAt: Date;
  coupon?: { code: string; discountType: string; discountValue: string } | null;
  shortLink: string;
}

export function WhatsappMessageDrawer(props: WhatsappMessageDrawerProps) {
  const initialMessage = React.useMemo(
    () =>
      buildWhatsappMessage({
        title: props.title,
        networkName: props.networkName,
        currentPriceCents: props.currentPriceCents,
        listPriceCents: props.listPriceCents,
        lowestPriceCents: props.lowestPriceCents,
        lowestPriceAt: props.lowestPriceAt,
        coupon: props.coupon,
        shortLink: props.shortLink,
      }),
    [props]
  );

  const [message, setMessage] = React.useState(initialMessage);
  const [destination, setDestination] = React.useState('');
  const [copying, setCopying] = React.useState(false);

  async function handleCopy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(message);
      await recordMessageCopied({
        offerId: props.offerId,
        messageText: message,
        priceCentsAtSend: props.currentPriceCents,
        destination: destination || undefined,
      });
      toast.success('Mensagem copiada!');
    } catch (err) {
      // recordMessageCopied() calls requireAdmin(), que pode disparar redirect()
      // (ex: sessão expirada) — isso lança um erro interno do Next.js que precisa
      // propagar, não ser tratado como falha de clipboard.
      unstable_rethrow(err);
      toast.error('Não foi possível copiar a mensagem.');
    } finally {
      setCopying(false);
    }
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="hype" fullWidth className="sm:w-fit" leftIcon={<MessageSquareText className="size-4" />}>
          Gerar mensagem WhatsApp
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Mensagem para WhatsApp</DrawerTitle>
          <DrawerDescription>Edite se quiser, depois copie e cole no grupo.</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg-inset)] p-3 text-body-sm text-[var(--color-text-primary)]"
          />
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Destino (opcional, ex: Grupo VIP SP)"
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg-inset)] px-3 text-body-sm text-[var(--color-text-primary)]"
          />
        </div>

        <DrawerFooter>
          <Button onClick={handleCopy} loading={copying} leftIcon={<Copy className="size-4" />}>
            Copiar mensagem
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

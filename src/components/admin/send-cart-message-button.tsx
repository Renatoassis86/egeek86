'use client';

import * as React from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendCartMessage } from '@/server/actions/admin-cart';

export function SendCartMessageButton({ userId }: { userId: string }) {
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const result = await sendCartMessage(userId);
      if (!result.ok) {
        toast.error(result.error || 'Não foi possível enviar.');
        return;
      }
      if (result.manualWhatsappUrl) {
        toast.success('Mensagem pronta — abrindo WhatsApp pra você enviar.');
        window.open(result.manualWhatsappUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.success('Mensagem enviada automaticamente pelo WhatsApp.');
      }
    } catch {
      toast.error('Erro ao enviar. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="hype" size="sm" loading={pending} leftIcon={<MessageCircle className="size-4" />} onClick={handleClick}>
      Enviar mensagem
    </Button>
  );
}

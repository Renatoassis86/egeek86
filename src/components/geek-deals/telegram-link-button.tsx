'use client';

import * as React from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { generateTelegramLinkToken } from '@/server/actions/telegram-link';

export function TelegramLinkButton() {
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const url = await generateTelegramLinkToken();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Não foi possível gerar o link agora. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="md" loading={loading} leftIcon={<Send className="size-4" />} onClick={handleClick}>
      Vincular Telegram
    </Button>
  );
}

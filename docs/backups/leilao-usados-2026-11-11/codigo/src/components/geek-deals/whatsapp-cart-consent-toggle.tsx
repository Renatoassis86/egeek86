'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { updateWhatsappCartConsent } from '@/server/actions/notification-preferences';

export function WhatsappCartConsentToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = React.useState(initialEnabled);

  async function handleChange(next: boolean) {
    setEnabled(next);
    try {
      await updateWhatsappCartConsent(next);
    } catch {
      setEnabled(!next);
      toast.error('Não foi possível salvar. Tente de novo.');
    }
  }

  return <Switch checked={enabled} onCheckedChange={handleChange} />;
}

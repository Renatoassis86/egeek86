'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { updatePriceAlertPreference } from '@/server/actions/notification-preferences';

export function NotificationPreferenceToggle({
  channel,
  initialEnabled,
  disabled,
}: {
  channel: 'email' | 'telegram';
  initialEnabled: boolean;
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = React.useState(initialEnabled);

  async function handleChange(next: boolean) {
    setEnabled(next);
    try {
      await updatePriceAlertPreference(channel, next);
    } catch {
      setEnabled(!next);
      toast.error('Não foi possível salvar. Tente de novo.');
    }
  }

  return <Switch checked={enabled} onCheckedChange={handleChange} disabled={disabled} />;
}

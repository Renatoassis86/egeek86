'use server';

import { db } from '@/lib/db';
import { notificationPreferences } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';

type PriceAlertChannel = 'email' | 'telegram';

export async function updatePriceAlertPreference(channel: PriceAlertChannel, enabled: boolean): Promise<void> {
  const profile = await requireCustomer();

  if (channel === 'email') {
    await db
      .insert(notificationPreferences)
      .values({ userId: profile.id, emailPriceAlerts: enabled })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { emailPriceAlerts: enabled, updatedAt: new Date() },
      });
  } else {
    await db
      .insert(notificationPreferences)
      .values({ userId: profile.id, telegramPriceAlerts: enabled })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { telegramPriceAlerts: enabled, updatedAt: new Date() },
      });
  }
}

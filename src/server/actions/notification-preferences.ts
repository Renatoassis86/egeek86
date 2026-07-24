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

/**
 * Consentimento explícito pra receber pelo WhatsApp os links de afiliado dos
 * itens do carrinho — exigência da Meta pra mensagem business-initiated
 * (não é só boa prática). Reaproveita whatsappOrders (já existia na tabela,
 * nunca tinha UI pra setar).
 */
export async function updateWhatsappCartConsent(enabled: boolean): Promise<void> {
  const profile = await requireCustomer();
  await db
    .insert(notificationPreferences)
    .values({ userId: profile.id, whatsappOrders: enabled })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { whatsappOrders: enabled, updatedAt: new Date() },
    });
}

'use server';

import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateCartItems, profiles, notificationPreferences, notificationDeliveries } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getCartItemsForUser } from '@/server/queries/cart';
import { getMasterProductPriceHistory } from '@/server/queries/price-history';
import { listActiveCouponsByNetwork } from '@/server/queries/affiliate';
import { buildCartWhatsappMessage } from '@/lib/affiliate/message-template';
import { sendWhatsappTemplateMessage, hasWhatsappCredentials } from '@/server/notifications/send-whatsapp';

export interface SendCartMessageResult {
  ok: boolean;
  error?: string;
  /** Preenchido quando não há credencial da Meta configurada — admin abre esse link e aperta enviar manualmente. */
  manualWhatsappUrl?: string;
}

export async function sendCartMessage(userId: string): Promise<SendCartMessageResult> {
  await requireAdmin();

  const [buyer] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!buyer) return { ok: false, error: 'Comprador não encontrado.' };
  if (!buyer.phone) return { ok: false, error: 'Comprador sem telefone cadastrado.' };

  const [prefs] = await db
    .select({ whatsappOrders: notificationPreferences.whatsappOrders })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (!prefs?.whatsappOrders) {
    return { ok: false, error: 'Comprador não autorizou receber mensagens pelo WhatsApp.' };
  }

  const items = await getCartItemsForUser(userId);
  if (items.length === 0) return { ok: false, error: 'Carrinho vazio.' };
  if (items.some((i) => i.affiliateLinkPending)) {
    return { ok: false, error: 'Ainda há item(ns) sem link de afiliado real — resolva antes de enviar.' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const messageInputs = await Promise.all(
    items.map(async (item) => {
      const [priceHistory, coupons] = await Promise.all([
        getMasterProductPriceHistory(item.masterProductId, 'Tudo').catch(() => null),
        listActiveCouponsByNetwork(item.networkId).catch(() => []),
      ]);
      const lowestEverCents = priceHistory?.stats.minPriceCents ?? item.currentPriceCents;
      const avgPriceCents = priceHistory?.stats.avgPriceCents ?? null;
      return {
        title: item.title,
        networkName: item.networkName,
        currentPriceCents: item.currentPriceCents,
        avgPriceCents,
        lowestEverCents,
        lowestEverAt: new Date(),
        coupon: coupons[0]
          ? { code: coupons[0].code, discountType: coupons[0].discountType, discountValue: coupons[0].discountValue }
          : null,
        shortLink: `${appUrl}/go/${item.offerSlug}`,
      };
    })
  );

  const message = buildCartWhatsappMessage(buyer.name, messageInputs, appUrl);
  const phone = buyer.phone;

  let result: SendCartMessageResult;

  if (hasWhatsappCredentials()) {
    const sendResult = await sendWhatsappTemplateMessage(phone, [buyer.name, String(items.length)]);
    result = sendResult.ok ? { ok: true } : { ok: false, error: sendResult.error };

    await db.insert(notificationDeliveries).values({
      userId,
      channel: 'whatsapp',
      templateCode: 'cart_links_ready',
      recipient: phone,
      payload: { message, itemCount: items.length },
      status: sendResult.ok ? 'sent' : 'failed',
      provider: 'meta_cloud_api',
      error: sendResult.error ?? null,
      sentAt: sendResult.ok ? new Date() : null,
    });
  } else {
    // Sem credencial da Meta — não falha, devolve o link wa.me com a
    // mensagem completa pronta pro admin abrir e apertar enviar. Mesmo
    // conteúdo rico de sempre, só o clique final é humano.
    const manualWhatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    result = { ok: true, manualWhatsappUrl };

    await db.insert(notificationDeliveries).values({
      userId,
      channel: 'whatsapp',
      templateCode: 'cart_links_ready',
      recipient: phone,
      payload: { message, itemCount: items.length },
      status: 'queued',
      provider: 'manual_wa_me',
    });
  }

  if (result.ok) {
    await db
      .update(affiliateCartItems)
      .set({ sentAt: new Date() })
      .where(and(eq(affiliateCartItems.userId, userId), isNull(affiliateCartItems.sentAt)));
  }

  return result;
}

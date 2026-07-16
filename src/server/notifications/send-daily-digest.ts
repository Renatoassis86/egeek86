import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, notificationPreferences, notificationDeliveries, affiliatePriceWatches } from '@/db/schema';
import { detectQualifyingWatches, type QualifyingDrop } from './detect-price-drops';
import { sendTelegramMessage } from './send-telegram';
import { sendEmail } from './send-email';
import { buildDigestEmailHtml, buildDigestTelegramText } from './templates';

export interface DailyDigestSummary {
  usersConsidered: number;
  usersNotified: number;
  emailsSent: number;
  telegramsSent: number;
  errors: string[];
}

/**
 * Agrupa quedas de preço por cliente (uma mensagem por canal, não uma por
 * jogo) e manda pelos canais habilitados. Só marca last_notified_at se
 * ALGUM canal realmente enviou — se o cliente tiver os dois desligados, não
 * marca cooldown (senão, ao religar um canal depois, perderia silenciosamente
 * o próximo alerta real).
 */
export async function runDailyDigest(): Promise<DailyDigestSummary> {
  const drops = await detectQualifyingWatches();
  const summary: DailyDigestSummary = {
    usersConsidered: 0,
    usersNotified: 0,
    emailsSent: 0,
    telegramsSent: 0,
    errors: [],
  };

  if (drops.length === 0) return summary;

  const byUser = new Map<string, QualifyingDrop[]>();
  for (const drop of drops) {
    const list = byUser.get(drop.userId) ?? [];
    list.push(drop);
    byUser.set(drop.userId, list);
  }
  summary.usersConsidered = byUser.size;

  const userIds = [...byUser.keys()];
  const [profileRows, prefRows] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.id, userIds)),
    db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds)),
  ]);
  const profileById = new Map(profileRows.map((p) => [p.id, p]));
  const prefsById = new Map(prefRows.map((p) => [p.userId, p]));

  for (const [userId, items] of byUser) {
    const profile = profileById.get(userId);
    if (!profile) continue;
    const prefs = prefsById.get(userId);

    let sentAny = false;

    if (prefs?.emailPriceAlerts !== false) {
      const html = buildDigestEmailHtml(profile.name, items);
      const subject = `${items.length} jogo${items.length > 1 ? 's' : ''} com preço bom agora: Geek Deals`;
      const result = await sendEmail({ to: profile.email, subject, html });

      await db.insert(notificationDeliveries).values({
        userId,
        channel: 'email',
        templateCode: 'price_drop_digest',
        recipient: profile.email,
        payload: { masterProductIds: items.map((i) => i.masterProductId) },
        status: result.error ? 'failed' : 'sent',
        provider: 'resend',
        providerId: result.id ?? null,
        error: result.error ?? null,
        sentAt: result.error ? null : new Date(),
      });

      if (result.error) {
        summary.errors.push(`email:${userId}:${result.error}`);
      } else {
        summary.emailsSent++;
        sentAny = true;
      }
    }

    if (prefs?.telegramPriceAlerts !== false && prefs?.telegramChatId) {
      const text = buildDigestTelegramText(profile.name, items);
      const result = await sendTelegramMessage(prefs.telegramChatId, text);

      await db.insert(notificationDeliveries).values({
        userId,
        channel: 'telegram',
        templateCode: 'price_drop_digest',
        recipient: prefs.telegramChatId,
        payload: { masterProductIds: items.map((i) => i.masterProductId) },
        status: result.ok ? 'sent' : 'failed',
        provider: 'telegram',
        error: result.ok ? null : (result.description ?? 'falha ao enviar'),
        sentAt: result.ok ? new Date() : null,
      });

      if (result.ok) {
        summary.telegramsSent++;
        sentAny = true;
      } else {
        summary.errors.push(`telegram:${userId}:${result.description}`);
      }
    }

    if (sentAny) {
      summary.usersNotified++;
      const watchIds = items.map((i) => i.watchId);
      await db
        .update(affiliatePriceWatches)
        .set({ lastNotifiedAt: new Date() })
        .where(inArray(affiliatePriceWatches.id, watchIds));
    }
  }

  return summary;
}

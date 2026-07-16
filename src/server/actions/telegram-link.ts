'use server';

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { telegramLinkTokens } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';

/**
 * Bot do Telegram não pode iniciar conversa — o cliente precisa clicar num
 * link tipo t.me/<bot>?start=<token> pra "dar /start" e aí sim o webhook
 * consegue vincular o chat_id ao userId (ver src/app/api/webhooks/telegram/route.ts).
 */
export async function generateTelegramLinkToken(): Promise<string> {
  const profile = await requireCustomer();
  const token = randomUUID();

  await db.insert(telegramLinkTokens).values({ token, userId: profile.id });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  return `https://t.me/${botUsername}?start=${token}`;
}

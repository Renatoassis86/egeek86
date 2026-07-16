import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { telegramLinkTokens, notificationPreferences } from '@/db/schema';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';

export const dynamic = 'force-dynamic';

const TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

/**
 * Chamado pelo próprio Telegram (não por um usuário nosso) quando alguém
 * manda mensagem pro bot — em especial "/start <token>", que é como o
 * cliente vincula a conta (ver src/server/actions/telegram-link.ts). Não usa
 * o padrão CRON_SECRET porque quem chama aqui é o servidor do Telegram, não
 * nosso próprio cron — a validação é via secret_token configurado no
 * setWebhook (ver docs/pg-cron-setup.md).
 */
export async function POST(request: NextRequest) {
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
  if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const chatId = update.message?.chat.id;
  const text = update.message?.text?.trim();

  if (!chatId || !text?.startsWith('/start')) {
    return NextResponse.json({ ok: true });
  }

  const token = text.replace('/start', '').trim();
  if (!token) {
    await sendTelegramMessage(
      String(chatId),
      'Link inválido. Gere um novo link em "Notificações" na sua conta do Espaço Geek 86.'
    );
    return NextResponse.json({ ok: true });
  }

  const [linkToken] = await db
    .select()
    .from(telegramLinkTokens)
    .where(
      and(
        eq(telegramLinkTokens.token, token),
        isNull(telegramLinkTokens.usedAt),
        gt(telegramLinkTokens.createdAt, new Date(Date.now() - TOKEN_MAX_AGE_MS))
      )
    )
    .limit(1);

  if (!linkToken) {
    await sendTelegramMessage(
      String(chatId),
      'Esse link expirou ou já foi usado. Gere um novo em "Notificações" na sua conta do Espaço Geek 86.'
    );
    return NextResponse.json({ ok: true });
  }

  await db
    .insert(notificationPreferences)
    .values({ userId: linkToken.userId, telegramChatId: String(chatId) })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { telegramChatId: String(chatId), updatedAt: new Date() },
    });

  await db.update(telegramLinkTokens).set({ usedAt: new Date() }).where(eq(telegramLinkTokens.token, token));

  await sendTelegramMessage(
    String(chatId),
    '✅ Conta vinculada! A partir de agora você recebe aqui os alertas de queda de preço dos jogos que você acompanha no Espaço Geek 86.'
  );

  return NextResponse.json({ ok: true });
}

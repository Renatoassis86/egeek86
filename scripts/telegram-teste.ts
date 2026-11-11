/**
 * Teste do bot do Telegram: envia UMA mensagem inofensiva ao grupo/canal e imprime SO o resultado (nunca o token).
 *   npx tsx --env-file=.env.local scripts/telegram-teste.ts
 * Precisa de TELEGRAM_BOT_TOKEN e TELEGRAM_GROUP_CHAT_ID no .env.local. Nao depende de GROUP_MESSAGES_ENABLED
 * (e um comando manual do dono); nao usa o banco; nao envia oferta nenhuma.
 */
import { sendTelegramGroupMessage } from '../src/lib/messaging/telegram-send';

(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  console.log(`TELEGRAM_BOT_TOKEN: ${token ? 'definido' : 'AUSENTE'} | TELEGRAM_GROUP_CHAT_ID: ${chatId ? 'definido' : 'AUSENTE'}`);
  if (!token || !chatId) {
    console.log('Nada enviado. Preencha as duas variaveis no .env.local (veja docs/mensagens-grupos-2026-11-10.md).');
    process.exit(1);
  }
  const r = await sendTelegramGroupMessage({ token, chatId, text: 'Teste do bot do Espaço Geek 86' });
  console.log(JSON.stringify({ ok: r.ok, status: r.status ?? null, messageId: r.messageId ?? null, error: r.error ?? null, retryable: r.retryable ?? null }));
  process.exit(r.ok ? 0 : 1);
})();

import 'server-only';
import { auditarUrlsDeMensagem, resumoViolacoes } from '@/lib/affiliate/link-afiliado';

export interface SendTelegramResult {
  ok: boolean;
  description?: string;
}

/**
 * fetch puro na Bot API do Telegram — não precisa de biblioteca. Bot só
 * consegue mandar mensagem pra chat_id que já deu /start nele antes (ver
 * src/server/actions/telegram-link.ts e o webhook em
 * src/app/api/webhooks/telegram/route.ts pro fluxo de vínculo de conta).
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<SendTelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN não configurado' };
  }

  // R-70 / L4: toda URL de loja precisa ser link de afiliado do dono (aviso privado, resumo diário, alertas); padrão negado.
  const violacoes = auditarUrlsDeMensagem({ texto: text });
  if (violacoes.length) return { ok: false, description: `link_fora_do_padrao_afiliado: ${resumoViolacoes(violacoes)}` };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  const json = (await res.json()) as { ok?: boolean; description?: string };
  return { ok: json.ok === true, description: json.description };
}

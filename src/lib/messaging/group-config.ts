// Configuração das mensagens para grupos. Funções PURAS (recebem o env), sem server-only, testáveis.
// Tudo DESLIGADO por padrão (ata 2026-11-10).

type Env = Record<string, string | undefined>;

export const DEFAULT_AD_TAG = '#publicidade';

/** Palavra proibida em qualquer texto que o cliente vê. */
const FORBIDDEN_WORD = /afiliad/i;

/**
 * Marcação de publicidade. GROUP_MESSAGES_AD_TAG:
 *  - ausente  -> '#publicidade' (padrão);
 *  - ''       -> sem marcação (também 'none' ou 'off', porque a Vercel não aceita valor vazio);
 *  - outro    -> o texto informado (uma linha, até 40 caracteres).
 * Se o texto contiver a palavra proibida ("afiliad..."), cai no padrão.
 */
export function getAdTag(env: Env = process.env): string {
  const raw = env.GROUP_MESSAGES_AD_TAG;
  if (raw === undefined) return DEFAULT_AD_TAG;
  const v = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);
  if (v === '' || /^(none|off)$/i.test(v)) return '';
  if (FORBIDDEN_WORD.test(v.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return DEFAULT_AD_TAG;
  return v;
}

/** Kill-switch. Ausente = desligado. */
export function isGroupMessagesEnabled(env: Env = process.env): boolean {
  const v = (env.GROUP_MESSAGES_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export type GroupMessagesMode = 'dry' | 'send';

/** Só o valor exato 'send' liga o envio; qualquer outra coisa é dry. */
export function getGroupMessagesMode(env: Env = process.env): GroupMessagesMode {
  return (env.GROUP_MESSAGES_MODE ?? '').trim().toLowerCase() === 'send' ? 'send' : 'dry';
}

/** Envio no Telegram só com flag ligada, modo send, token e chat id. Falha fechada. */
export function canSendTelegram(env: Env = process.env): { ok: boolean; reason?: string } {
  if (!isGroupMessagesEnabled(env)) return { ok: false, reason: 'GROUP_MESSAGES_ENABLED desligado' };
  if (getGroupMessagesMode(env) !== 'send') return { ok: false, reason: 'GROUP_MESSAGES_MODE != send (dry)' };
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN ausente' };
  if (!env.TELEGRAM_GROUP_CHAT_ID) return { ok: false, reason: 'TELEGRAM_GROUP_CHAT_ID ausente' };
  return { ok: true };
}

// Envio ao Telegram (Bot API) para o grupo/canal. SEM server-only e com fetch injetável: testável sem rede e sem token.
// Regras: nunca registra nem devolve o token; 429 respeita retry_after; 400 de formatação reenvia em texto simples;
// 401/403/404/"chat not found" não tentam de novo; sem token ou sem chat id nunca chama a rede.

import { TELEGRAM_MAX_CHARS } from '@/lib/messaging/group-messages';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

export interface SendTelegramGroupInput {
  token: string | undefined;
  chatId: string | undefined;
  /** Texto em HTML do Telegram. */
  text: string;
  /** Versão sem formatação, usada se o Telegram recusar o HTML. Padrão: o texto sem tags. */
  plainText?: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Maior espera aceita em um 429 antes de desistir e deixar para a próxima rodada (segundos). */
  maxRetryAfterSec?: number;
}

export interface SendTelegramGroupResult {
  ok: boolean;
  messageId?: string;
  status?: number;
  error?: string;
  /** true = vale tentar de novo depois (429 longo, 5xx, rede). false = erro definitivo. */
  retryable?: boolean;
  retryAfterSec?: number;
  /** Nada foi enviado porque faltou configuração. */
  skipped?: boolean;
  usedPlainText?: boolean;
}

export function stripTelegramHtml(html: string): string {
  return html
    .replace(/<a\s+href="([^"]*)">([^<]*)<\/a>/gi, (_m, href: string, label: string) => (label.trim() === href ? href : `${label} ${href}`))
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function scrub(s: string, token: string): string {
  return s.split(token).join('***').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***');
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface TgBody {
  ok?: boolean;
  description?: string;
  error_code?: number;
  result?: { message_id?: number };
  parameters?: { retry_after?: number };
}

export async function sendTelegramGroupMessage(input: SendTelegramGroupInput): Promise<SendTelegramGroupResult> {
  const { token, chatId } = input;
  if (!token) return { ok: false, skipped: true, error: 'TELEGRAM_BOT_TOKEN ausente', retryable: false };
  if (!chatId) return { ok: false, skipped: true, error: 'TELEGRAM_GROUP_CHAT_ID ausente', retryable: false };
  if (!input.text.trim()) return { ok: false, error: 'texto vazio', retryable: false };
  if (input.text.length > TELEGRAM_MAX_CHARS) return { ok: false, error: `texto acima de ${TELEGRAM_MAX_CHARS} caracteres`, retryable: false };

  const doFetch = input.fetchImpl ?? defaultFetch;
  const sleep = input.sleep ?? defaultSleep;
  const maxWait = input.maxRetryAfterSec ?? 30;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  let plain = false;
  let rateRetried = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    const payload: Record<string, unknown> = { chat_id: chatId, text: plain ? (input.plainText ?? stripTelegramHtml(input.text)) : input.text };
    if (!plain) payload.parse_mode = 'HTML';

    let status = 0;
    let body: TgBody = {};
    try {
      const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      status = res.status;
      body = ((await res.json().catch(() => ({}))) ?? {}) as TgBody;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha de rede';
      return { ok: false, error: `rede: ${scrub(msg, token)}`.slice(0, 300), retryable: true };
    }

    if (status === 200 && body.ok) {
      return { ok: true, status, messageId: body.result?.message_id != null ? String(body.result.message_id) : undefined, usedPlainText: plain || undefined };
    }

    const desc = scrub(String(body.description ?? `HTTP ${status}`), token).slice(0, 300);

    if (status === 429) {
      const wait = Number(body.parameters?.retry_after ?? 1);
      if (!rateRetried && wait <= maxWait) {
        rateRetried = true;
        await sleep(wait * 1000);
        continue;
      }
      return { ok: false, status, error: desc, retryable: true, retryAfterSec: wait };
    }

    if (status === 400 && /parse|entit|tag/i.test(desc) && !plain) {
      plain = true;
      continue;
    }

    // 400 (chat not found, mensagem inválida), 401, 403 (bot removido/sem permissão), 404: definitivos.
    if (status >= 400 && status < 500) return { ok: false, status, error: desc, retryable: false };
    return { ok: false, status, error: desc, retryable: true };
  }
  return { ok: false, error: 'tentativas esgotadas', retryable: true };
}

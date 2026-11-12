// Envio ao Telegram (Bot API) para o grupo/canal. SEM server-only e com fetch injetável: testável sem rede e sem token.
// Regras: nunca registra nem devolve o token; 429 respeita retry_after; 400 de formatação reenvia em texto simples;
// 401/403/404/"chat not found" não tentam de novo; sem token ou sem chat id nunca chama a rede.

import { TELEGRAM_MAX_CHARS } from '@/lib/messaging/group-messages';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | FormData }) => Promise<{
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
  /** Mensagem SILENCIOSA (disable_notification): chega sem som. Padrão false. */
  silent?: boolean;
  /**
   * Cartão de histórico em PNG (gerado em memória por outro módulo). Se vier e a legenda couber (<= 1024 caracteres),
   * vai por sendPhoto com upload multipart (sem URL pública, sem arquivo guardado); senão cai em sendMessage.
   */
  photo?: Uint8Array | null;
  /** Botão de link abaixo da mensagem (inline_keyboard). Também desliga a pré-visualização de links. */
  button?: { text: string; url: string } | null;
}

/** Limite de legenda do Telegram em sendPhoto. */
export const TELEGRAM_CAPTION_MAX = 1024;

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
  /** Saiu como foto (sendPhoto) com a legenda. */
  photoSent?: boolean;
  /** A foto veio mas não foi usada (ex.: legenda maior que 1024); a mensagem saiu só em texto. */
  photoSkipped?: string;
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

/**
 * Tamanho da legenda como o Telegram conta: o limite de 1024 vale para o texto DEPOIS de interpretar o HTML (tags não contam).
 * Contar o HTML cru derrubava o card de mensagens de 1026 a 1088 caracteres crus (17 do G2 em 12 h, 2026-11-12).
 */
export function captionVisibleLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').length;
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
  let photo: Uint8Array | null = input.photo && input.photo.byteLength > 0 ? input.photo : null;
  let photoSkipped: string | undefined;
  if (photo && captionVisibleLength(input.text) > TELEGRAM_CAPTION_MAX) {
    photo = null;
    photoSkipped = `legenda_maior_que_${TELEGRAM_CAPTION_MAX}`;
  }
  const url = `https://api.telegram.org/bot${token}/${photo ? 'sendPhoto' : 'sendMessage'}`;

  let plain = false;
  let rateRetried = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    const text = plain ? (input.plainText ?? stripTelegramHtml(input.text)) : input.text;
    const payload: Record<string, unknown> = photo ? { chat_id: chatId, caption: text } : { chat_id: chatId, text };
    if (!plain) payload.parse_mode = 'HTML';
    if (input.silent) payload.disable_notification = true;
    if (!photo) payload.link_preview_options = { is_disabled: true };
    if (input.button) payload.reply_markup = { inline_keyboard: [[{ text: input.button.text, url: input.button.url }]] };

    let status = 0;
    let body: TgBody = {};
    try {
      let res;
      if (photo) {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'cartao.png');
        res = await doFetch(url, { method: 'POST', body: form });
      } else {
        res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      status = res.status;
      body = ((await res.json().catch(() => ({}))) ?? {}) as TgBody;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha de rede';
      return { ok: false, error: `rede: ${scrub(msg, token)}`.slice(0, 300), retryable: true };
    }

    if (status === 200 && body.ok) {
      return {
        ok: true,
        status,
        messageId: body.result?.message_id != null ? String(body.result.message_id) : undefined,
        usedPlainText: plain || undefined,
        photoSent: photo ? true : undefined,
        photoSkipped,
      };
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

// ---------------------------------------------------------------------------
// Contagem de inscritos (freio automático por saída; ata 2026-11-10 §1.4)
// ---------------------------------------------------------------------------
export interface MemberCountResult {
  ok: boolean;
  count?: number;
  error?: string;
}

/** getChatMemberCount: número de membros do grupo/canal. Nunca devolve nem registra o token. */
export async function getTelegramMemberCount(input: { token: string | undefined; chatId: string | undefined; fetchImpl?: FetchLike }): Promise<MemberCountResult> {
  const { token, chatId } = input;
  if (!token || !chatId) return { ok: false, error: 'token ou chat id ausente' };
  const doFetch = input.fetchImpl ?? defaultFetch;
  try {
    const res = await doFetch(`https://api.telegram.org/bot${token}/getChatMemberCount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
    });
    const body = ((await res.json().catch(() => ({}))) ?? {}) as { ok?: boolean; result?: number; description?: string };
    if (res.status === 200 && body.ok && Number.isInteger(body.result) && (body.result as number) >= 0) return { ok: true, count: body.result as number };
    return { ok: false, error: scrub(String(body.description ?? `HTTP ${res.status}`), token).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: `rede: ${scrub(e instanceof Error ? e.message : 'falha', token)}`.slice(0, 200) };
  }
}

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invalidateStoresCache } from '@/server/stores';

/**
 * Descobre o chat id dos canais das lojas SEM o dono digitar número (plano das lojas, onboarding). A loja guarda o link público
 * (telegram_invite_url = https://t.me/<usuario>); aqui o bot resolve o usuário em chat id, confere se o bot é administrador com
 * permissão de postar e grava. SÓ LEITURA no Telegram: nenhuma mensagem é enviada. Nunca registra nem devolve o token.
 */
const TG = 'https://api.telegram.org';

async function call<T>(token: string, method: string, body: unknown): Promise<{ ok: boolean; result?: T; description?: string }> {
  try {
    const r = await fetch(`${TG}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return (await r.json()) as { ok: boolean; result?: T; description?: string };
  } catch {
    return { ok: false, description: 'rede' };
  }
}

export interface DiscoverResult {
  slug: string;
  username: string;
  status: 'registrado' | 'bot_nao_e_administrador' | 'canal_nao_encontrado' | 'nao_e_canal';
}

export async function discoverStoreChats(token: string | undefined): Promise<DiscoverResult[]> {
  if (!token) return [];
  const rows = await db.execute<{ slug: string; url: string }>(sql`
    SELECT slug, telegram_invite_url AS url FROM store_sections
    WHERE telegram_chat_id IS NULL AND archived_at IS NULL AND telegram_invite_url ~ '^https://t\.me/[A-Za-z0-9_]{4,32}$'
  `);
  if (!rows.length) return [];
  const me = await call<{ id: number }>(token, 'getMe', {});
  if (!me.ok || !me.result) return [];
  const out: DiscoverResult[] = [];
  for (const r of rows) {
    const username = r.url.replace('https://t.me/', '');
    const chat = await call<{ id: number; type: string; title?: string }>(token, 'getChat', { chat_id: `@${username}` });
    if (!chat.ok || !chat.result) {
      out.push({ slug: r.slug, username, status: 'canal_nao_encontrado' });
      continue;
    }
    if (chat.result.type !== 'channel' && chat.result.type !== 'supergroup') {
      out.push({ slug: r.slug, username, status: 'nao_e_canal' });
      continue;
    }
    const member = await call<{ status: string; can_post_messages?: boolean }>(token, 'getChatMember', { chat_id: chat.result.id, user_id: me.result.id });
    const isAdmin = member.ok && member.result?.status === 'administrator' && member.result.can_post_messages !== false;
    if (!isAdmin) {
      await db.execute(sql`UPDATE store_sections SET stage = 'aguardando_canal', updated_at = now() WHERE slug = ${r.slug} AND stage = 'rascunho'`);
      out.push({ slug: r.slug, username, status: 'bot_nao_e_administrador' });
      continue;
    }
    await db.execute(sql`
      UPDATE store_sections
      SET telegram_chat_id = ${String(chat.result.id)}, telegram_chat_title = ${chat.result.title ?? username}, telegram_verified_at = now(),
          telegram_bot_can_post = true,
          stage = CASE WHEN stage IN ('rascunho','aguardando_canal') THEN 'canal_verificado' ELSE stage END, updated_at = now()
      WHERE slug = ${r.slug} AND telegram_chat_id IS NULL
    `);
    out.push({ slug: r.slug, username, status: 'registrado' });
  }
  if (out.some((o) => o.status === 'registrado')) invalidateStoresCache();
  return out;
}

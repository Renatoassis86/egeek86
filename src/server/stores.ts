import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { withTimeout } from '@/lib/cache/swr';
import { readShowcaseAged, writeShowcase } from '@/server/queries/snapshot-store';
import { isVertical, type Vertical } from '@/lib/catalog/verticais';
import {
  GAMES_STORE_LIMITS,
  LOJA_GAMES,
  STORE_STAGES,
  lojaGamesPadrao,
  resolveLimits,
  type StoreSection,
  type StoreStage,
} from '@/lib/stores/lojas';

/**
 * LEITOR DE LOJAS (seções com canal próprio). INERTE: nenhuma rota de envio, fila ou cron chama isto ainda
 * (plano docs/plano-lojas-secoes-canais-2026-11-11.md, A1). Cache curto (30 s, como as flags). Qualquer erro de leitura
 * (tabelas ausentes, rede) => FALHA SEGURA: devolve só a loja games.
 */
export const STORES_CACHE_TTL_MS = 30_000;

export type LojaRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  telegram_chat_id: string | null;
  telegram_chat_title: string | null;
  telegram_verified_at: string | Date | null;
  telegram_bot_can_post: boolean;
  whatsapp_group_url: string | null;
  telegram_invite_url?: string | null;
  limits: unknown;
  ad_tag: string | null;
  brand: unknown;
  archived_at: string | Date | null;
  verticals: string[] | null;
};

const STORES_SNAPSHOT_KEY = 'stores-v1';
let lastStoresWrite = 0;
let cache: { at: number; value: StoreSection[] } | null = null;

export function invalidateStoresCache(): void {
  cache = null;
}

function toDate(v: string | Date | null): Date | null {
  return v ? new Date(v) : null;
}

export function mapLoja(r: LojaRow): StoreSection {
  const stage = (STORE_STAGES as readonly string[]).includes(r.stage) ? (r.stage as StoreStage) : 'rascunho';
  // Games herda os limites de hoje como base (campo ausente no jsonb = valor atual); as demais, o padrão das lojas novas.
  const base = r.slug === LOJA_GAMES ? GAMES_STORE_LIMITS : undefined;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    stage,
    telegramChatId: r.telegram_chat_id,
    telegramChatTitle: r.telegram_chat_title,
    telegramVerifiedAt: toDate(r.telegram_verified_at),
    telegramBotCanPost: r.telegram_bot_can_post,
    whatsappGroupUrl: r.whatsapp_group_url,
    telegramInviteUrl: r.telegram_invite_url ?? null,
    limits: resolveLimits(r.limits, base),
    adTag: r.ad_tag,
    brand: (r.brand && typeof r.brand === 'object' ? r.brand : {}) as Record<string, unknown>,
    verticals: (r.verticals ?? []).filter(isVertical),
    archivedAt: toDate(r.archived_at),
  };
}

/** Todas as lojas não arquivadas. Falha segura: só 'games'. */
export async function getStores(opts: { fresh?: boolean; now?: number } = {}): Promise<StoreSection[]> {
  const t = opts.now ?? Date.now();
  if (!opts.fresh && cache && t - cache.at < STORES_CACHE_TTL_MS) return cache.value;
  let value: StoreSection[];
  // Leitura de PÁGINA (não `fresh`): teto de 3 s; estourou/falhou => última leitura boa (memória, depois snapshot real
  // de até 24 h) e só então a loja games padrão. Falha NÃO fica 30 s no cache (re-tenta em 5 s). Incidente 2026-11-13:
  // a seção de canais da home esperava o SOCKET_TIMEOUT de 30 s do pool.
  const page = !opts.fresh;
  try {
    const query = db.execute<LojaRow>(sql`
      SELECT s.id::text AS id, s.slug, s.name, s.stage, s.telegram_chat_id, s.telegram_chat_title, s.telegram_verified_at,
             s.telegram_bot_can_post, s.whatsapp_group_url, s.telegram_invite_url, s.limits, s.ad_tag, s.brand, s.archived_at,
             COALESCE(array_agg(v.vertical ORDER BY v.vertical) FILTER (WHERE v.vertical IS NOT NULL), '{}') AS verticals
      FROM store_sections s
      LEFT JOIN store_section_verticals v ON v.store_id = s.id
      WHERE s.archived_at IS NULL
      GROUP BY s.id
      ORDER BY s.slug
    `);
    const rows = page ? await withTimeout(query, 3_000, 'store_sections') : await query;
    value = Array.from(rows as unknown as LojaRow[]).map(mapLoja);
    if (!value.some((l) => l.slug === LOJA_GAMES)) value = [lojaGamesPadrao(), ...value];
    if (page && t - lastStoresWrite > 5 * 60_000) {
      lastStoresWrite = t;
      void writeShowcase(STORES_SNAPSHOT_KEY, Array.from(rows as unknown as LojaRow[]));
    }
  } catch {
    let fallback: StoreSection[] | null = cache?.value ?? null;
    if (!fallback && page) {
      const hit = await readShowcaseAged<LojaRow[]>(STORES_SNAPSHOT_KEY, 24 * 3600_000);
      if (hit && Array.isArray(hit.value)) {
        let v = hit.value.map(mapLoja);
        if (!v.some((l) => l.slug === LOJA_GAMES)) v = [lojaGamesPadrao(), ...v];
        fallback = v;
      }
    }
    value = fallback ?? [lojaGamesPadrao()];
    if (page) {
      cache = { at: t - STORES_CACHE_TTL_MS + 5_000, value };
      return value;
    }
  }
  cache = { at: t, value };
  return value;
}

/** Loja dona de uma vertical (uma vertical pertence a UMA loja). Sem loja => null (o gatilho vira "loja não ativa"). */
export async function getStoreByVertical(vertical: Vertical | string, opts: { fresh?: boolean } = {}): Promise<StoreSection | null> {
  const stores = await getStores(opts);
  const dona = stores.find((s) => (s.verticals as string[]).includes(vertical));
  if (dona) return dona;
  return vertical === 'games' ? (stores.find((s) => s.slug === LOJA_GAMES) ?? null) : null;
}

/**
 * Chat do Telegram da loja. NUNCA cai no canal de games para outra loja. Games: o chat gravado na tabela, senão o fallback de
 * transição `TELEGRAM_GROUP_CHAT_ID` do ambiente (regra do plano 1.1).
 */
export function chatForStore(store: Pick<StoreSection, 'slug' | 'telegramChatId'>, env: Record<string, string | undefined> = process.env): string | undefined {
  if (store.telegramChatId) return store.telegramChatId;
  if (store.slug === LOJA_GAMES) return env.TELEGRAM_GROUP_CHAT_ID || undefined;
  return undefined;
}

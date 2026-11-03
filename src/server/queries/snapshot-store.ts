import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { withTimeout } from '@/lib/cache/swr';

/**
 * Pré-cálculo PERSISTIDO da vitrine (Fase 2, ata 2026-11-03-fase2-precalculo.md).
 * Em serverless o cache SWR em memória nasce vazio a cada instância fria; aqui o resultado
 * pronto vive no banco (tabela `showcase_snapshot`, chave -> JSON), escrito pelo cron
 * /api/cron/refresh-snapshots e lido pela página em ~1 consulta de 1 linha.
 *
 * Regras de honestidade:
 *  - o snapshot é o resultado EXATO das mesmas funções de cálculo (fonte única); nada é inventado;
 *  - ausente, vencido, tabela inexistente ou leitura lenta => devolve null e quem chama cai no
 *    comportamento anterior (cálculo ao vivo com timeouts);
 *  - cada linha guarda `computed_at`; `readShowcase` só entrega dentro da idade máxima pedida.
 */

/** Teto de espera da leitura do snapshot (1 linha por PK): estourou, cai no cálculo ao vivo. */
const READ_TIMEOUT_MS = 4_000;

/** JSON com chaves em ordem estável: a mesma pergunta sempre gera a mesma chave (cron e página concordam). */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return val;
  });
}

/** Chave curta e segura para a PK (chaves muito longas viram prefixo + hash). */
export function snapshotKey(key: string): string {
  return key.length <= 160 ? key : `${key.slice(0, 100)}#${createHash('sha1').update(key).digest('hex')}`;
}

export interface ShowcaseHit<T> {
  value: T;
  computedAt: string;
}

/** Lê um bloco pronto com idade <= maxAgeMs. null = não há (ausente, velho, tabela sem migration, erro). */
export async function readShowcase<T>(key: string, maxAgeMs: number): Promise<ShowcaseHit<T> | null> {
  try {
    const rows = await withTimeout(
      db.execute<{ payload: T; computed_at: string | Date }>(sql`
        SELECT payload, computed_at FROM showcase_snapshot
        WHERE key = ${snapshotKey(key)} AND computed_at > now() - (${Math.round(maxAgeMs / 1000)} * interval '1 second')
      `),
      READ_TIMEOUT_MS,
      'showcase_snapshot'
    );
    const r = rows[0];
    if (!r) return null;
    return { value: r.payload, computedAt: new Date(r.computed_at).toISOString() };
  } catch {
    return null;
  }
}

/** Grava (upsert) um bloco pronto. Nunca lança: falha de gravação não pode derrubar a página. */
export async function writeShowcase(key: string, value: unknown): Promise<boolean> {
  try {
    const json = JSON.stringify(value === undefined ? null : value);
    await db.execute(sql`
      INSERT INTO showcase_snapshot (key, payload, computed_at)
      VALUES (${snapshotKey(key)}, ${json}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = now()
    `);
    return true;
  } catch (err) {
    console.error('[snapshot] falha ao gravar', key.slice(0, 80), err instanceof Error ? err.message : err);
    return false;
  }
}

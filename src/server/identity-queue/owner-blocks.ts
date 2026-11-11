import 'server-only';
import { sql } from 'drizzle-orm';
import type { db as Db } from '@/lib/db';

/**
 * Decisoes do dono que a coleta NAO pode desfazer (fila de classificacao, 2026-11-11).
 *  - draft: "nao e este produto" (a decisao guardou prev_status) -> a oferta nao volta a 'active' sozinha;
 *  - quarantine: "preco errado" -> a quarentena nao e liberada pela coleta.
 * So vale decisao nao desfeita (undone_at IS NULL). Desfazer na fila libera de novo.
 */
type Exec = Pick<typeof Db, 'execute'>;

export interface OwnerBlocks { draft: Set<string>; quarantine: Set<string> }

export function ownerBlocksFromRows(rows: Array<{ offer_id: string; draft: boolean; quar: boolean }>): OwnerBlocks {
  const out: OwnerBlocks = { draft: new Set(), quarantine: new Set() };
  for (const r of rows) {
    if (r.draft) out.draft.add(r.offer_id);
    if (r.quar) out.quarantine.add(r.offer_id);
  }
  return out;
}

export async function loadOwnerBlocks(exec: Exec, offerIds: string[]): Promise<OwnerBlocks> {
  const ids = offerIds.map((i) => i.replace(/[^0-9a-f-]/gi, '')).filter((i) => i.length === 36);
  if (!ids.length) return { draft: new Set(), quarantine: new Set() };
  try {
    const r = (await exec.execute(sql`
      SELECT offer_id::text AS offer_id, bool_or(prev_status IS NOT NULL) AS draft, bool_or(axis = 'preco' AND value = 'preco_errado') AS quar
      FROM identity_decisions
      WHERE undone_at IS NULL AND offer_id = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(',')}]::uuid[]`)})
      GROUP BY offer_id`)) as unknown as Array<{ offer_id: string; draft: boolean; quar: boolean }>;
    return ownerBlocksFromRows(Array.isArray(r) ? r : []);
  } catch (e) {
    // Sem a tabela (ambiente sem a migration 0042) a coleta segue como antes; nunca derruba o coletor.
    console.warn('[owner-blocks] leitura das decisoes falhou:', e instanceof Error ? e.message : e);
    return { draft: new Set(), quarantine: new Set() };
  }
}

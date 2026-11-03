/**
 * Reverte uma fusao de masters feita por scripts/merge-duplicate-masters.ts a partir do log dela.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/revert-merge-masters.ts backup/dados/merge-log-<ts>.json
 * Devolve cada oferta ao master de origem, reativa watches desativados e remove a marca mergedInto do arquivado.
 * Nao apaga nada. Tudo numa transacao.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

type Log = Array<{ canonicalId: string; merged: Array<{ masterId: string; movedRows: Record<string, string[]>; deactivatedWatchIds: string[] }> }>;

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error('Informe o log merge-log-*.json.');
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Log;
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      for (const g of log) {
        for (const m of g.merged) {
          for (const [key, ids] of Object.entries(m.movedRows)) {
            if (!ids.length) continue;
            const [table, column] = key.split('.');
            await tx`UPDATE ${tx(table)} SET ${tx(column)} = ${m.masterId} WHERE id = ANY(${ids}::uuid[]) AND ${tx(column)} = ${g.canonicalId}`;
          }
          if (m.deactivatedWatchIds.length) await tx`UPDATE affiliate_price_watches SET is_active = true WHERE id = ANY(${m.deactivatedWatchIds}::uuid[])`;
          await tx`UPDATE master_products SET attributes = attributes - 'mergedInto' - 'archived' - 'mergedAt' - 'mergedOfferIds' - 'mergedWatchIds' - 'deactivatedWatchIds', updated_at = now() WHERE id = ${m.masterId}`;
        }
      }
    });
    console.log('Fusao revertida.');
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });

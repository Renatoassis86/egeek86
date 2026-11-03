/**
 * Desfaz a Etapa 2 da identidade da cesta.
 *
 *   npx tsx scripts/revert-identidade-etapa2.ts backup/dados/identidade-etapa2-log-<ts>.json   # ofertas movidas/rascunhadas + masters criados
 *   npx tsx scripts/revert-identidade-etapa2.ts --merge-log backup/dados/merge-log-<ts>.json   # fusões de master (desarquiva e devolve ofertas/watches)
 *
 * Nada é apagado: ofertas voltam ao master e status antigos; masters criados na etapa são ARQUIVADOS
 * (attributes.archived + mergedInto = master de origem), nunca deletados. Uma transação por execução.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const args = process.argv.slice(2);
const mergeMode = args.includes('--merge-log');
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));

async function main() {
  if (!file) throw new Error('Informe o arquivo de log .json');
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '300s'`;
      if (mergeMode) {
        for (const g of log as any[]) {
          for (const m of g.merged) {
            for (const [key, ids] of Object.entries(m.movedRows as Record<string, string[]>)) {
              const [table, column] = key.split('.');
              if (!ids.length) continue;
              await tx`UPDATE ${tx(table)} SET ${tx(column)} = ${m.masterId} WHERE id = ANY(${ids}::uuid[]) AND ${tx(column)} = ${g.canonicalId}`;
            }
            if (m.deactivatedWatchIds?.length) await tx`UPDATE affiliate_price_watches SET is_active = true WHERE id = ANY(${m.deactivatedWatchIds}::uuid[])`;
            await tx`UPDATE master_products SET attributes = attributes - 'mergedInto' - 'archived' - 'mergedAt' - 'mergedOfferIds' - 'mergedWatchIds' - 'deactivatedWatchIds', updated_at = now() WHERE id = ${m.masterId}`;
          }
          if (g.platformFix) await tx`UPDATE master_products SET game_platform_gen = ${g.platformFix.from}::game_platform_gen WHERE id = ${g.canonicalId}`;
        }
        console.log(`Fusões desfeitas: ${log.length} grupos.`);
        return;
      }
      for (const m of log.movimentos) {
        const u = await tx`UPDATE affiliate_offers SET master_product_id = ${m.master_antigo}, status = ${m.status}::affiliate_offer_status, updated_at = now() WHERE id = ${m.offer_id}`;
        if (u.count !== 1) throw new Error('oferta não encontrada ' + m.offer_id);
      }
      for (const d of log.rascunhos) {
        await tx`UPDATE affiliate_offers SET status = ${d.status_antigo}::affiliate_offer_status, updated_at = now() WHERE id = ${d.offer_id}`;
      }
      for (const c of log.masters_criados) {
        const origin = log.movimentos.find((m: any) => m.master_novo === c.id)?.master_antigo ?? null;
        await tx`UPDATE master_products SET attributes = attributes || ${tx.json({ archived: true, revertedStage2: true, mergedInto: origin })}, updated_at = now() WHERE id = ${c.id}`;
      }
      console.log(`Revertido: ${log.movimentos.length} movimentos, ${log.rascunhos.length} rascunhos, ${log.masters_criados.length} masters arquivados.`);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error('Falha:', e instanceof Error ? e.message : e);
  process.exit(1);
});

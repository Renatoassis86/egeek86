/**
 * Desfaz a separação digital x físico (scripts/separar-formato-digital-fisico.ts) e o enriquecimento de formato pela API
 * (scripts/enriquecer-formato-ml.ts). Ambos gravam o mesmo formato de log.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/revert-separar-formato.ts <log.json> --dry-run   # só mostra o que faria
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/revert-separar-formato.ts <log.json>             # desfaz (uma transação)
 *
 * Ofertas voltam ao master e ao status antigos (cotações acompanham a oferta); game_format volta ao valor antigo;
 * masters criados são ARQUIVADOS (attributes.archived + mergedInto = master de origem), nunca apagados.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));

async function main() {
  if (!file) throw new Error('Informe o arquivo de log .json');
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const movs: any[] = log.movimentos ?? [];
  const drafts: any[] = log.rascunhos ?? [];
  const cols: any[] = log.colunas ?? [];
  const created: any[] = log.masters_criados ?? [];
  console.log(`${DRY ? 'DRY-RUN' : 'REVERTENDO'}: ${movs.length} ofertas movidas, ${drafts.length} rascunhos, ${cols.length} colunas game_format, ${created.length} masters criados a arquivar`);
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '300s'`;
      for (const m of movs) {
        const [cur] = await tx`select master_product_id mid from affiliate_offers where id = ${m.offer_id}`;
        if (!cur) throw new Error('oferta não encontrada ' + m.offer_id);
        if (cur.mid !== m.master_novo) console.log(`  AVISO: oferta ${m.offer_id} não está mais no master novo (está em ${cur.mid}); voltará mesmo assim`);
        if (!DRY) await tx`update affiliate_offers set master_product_id = ${m.master_antigo}, updated_at = now() where id = ${m.offer_id}`;
      }
      for (const d of drafts) {
        if (!DRY) await tx`update affiliate_offers set status = ${d.status_antigo}::affiliate_offer_status, updated_at = now() where id = ${d.offer_id}`;
      }
      for (const c of cols) {
        const [cur] = await tx`select game_format::text f from master_products where id = ${c.master_id}`;
        if (!cur) throw new Error('master não encontrado ' + c.master_id);
        if (cur.f !== c.para) console.log(`  AVISO: master ${c.master_id} tem game_format ${cur.f} (log esperava ${c.para}); voltará para ${c.de}`);
        if (!DRY) {
          await tx`update master_products set game_format = ${c.de}::game_format, updated_at = now() where id = ${c.master_id}`;
          for (const k of (c.removeAttr ?? []) as string[]) await tx`update master_products set attributes = attributes - ${k} where id = ${c.master_id}`;
        }
      }
      for (const g of created) {
        const [{ n }] = await tx`select count(*)::int n from affiliate_offers where master_product_id = ${g.id}`;
        const voltam = movs.filter((m) => m.master_novo === g.id).length; // no dry-run elas ainda não voltaram
        if (n - (DRY ? voltam : 0) > 0) console.log(`  AVISO: master criado ${g.id} ainda tem ${n} oferta(s) (de outra origem); será arquivado mesmo assim`);
        if (!DRY) await tx`update master_products set attributes = attributes || ${tx.json({ archived: true, revertedFormatSplit: true, mergedInto: g.origem })}, updated_at = now() where id = ${g.id}`;
      }
    });
    console.log(DRY ? 'Dry-run concluído; nada gravado.' : 'Revertido.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error('Falha:', e instanceof Error ? e.message : e);
  process.exit(1);
});

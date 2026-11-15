/**
 * #119 (rodada 3): marca como VERIFICADO PELA PÁGINA o link das ofertas cujo último veredito baseado na página do próprio link (item_id_link lido do cartão) existe
 * e cujo link atual é o mesmo link auditado. Grava link_item_id (anúncio real do link) e link_verificado_em = hora da leitura. Depois disso o preço dessas ofertas
 * é verificado pela API (sem captcha) e a página só é relida em link novo, troca de anúncio ou amostra de 1 em 20.
 *   npx tsx --env-file=.env.local scripts/backfill-link-verificado-119.ts                         # dry-run: conta
 *   npx tsx --env-file=.env.local scripts/backfill-link-verificado-119.ts --apply --por=<quem>    # backup NDJSON antes
 *   npx tsx --env-file=.env.local scripts/backfill-link-verificado-119.ts --rollback=docs/backups/<arquivo>.ndjson
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes('--apply');
const ROLLBACK = arg('rollback');

async function main() {
  const sql = connect();
  try {
    if (ROLLBACK) {
      const linhas = fs.readFileSync(ROLLBACK, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
      for (const l of linhas) await sql`UPDATE affiliate_offers SET link_item_id = ${(l.link_item_id as string | null) ?? null}, link_verificado_em = ${(l.link_verificado_em as string | null) ?? null} WHERE id = ${l.id as string}::uuid`;
      console.log(`rollback: ${linhas.length} ofertas restauradas`);
      return;
    }
    const alvo = await sql<{ id: string; item: string; at: Date }[]>`
      SELECT o.id::text AS id, x.item_id_link AS item, x.checked_at AS at
      FROM affiliate_offers o JOIN (
        SELECT DISTINCT ON (offer_id) offer_id, item_id_link, checked_at, link FROM offer_link_audit
        WHERE item_id_link IS NOT NULL AND (note IS NULL OR note NOT LIKE 'fonte=%') AND verdict IN ('ok', 'preco_divergente', 'item_diferente', 'pausado')
        ORDER BY offer_id, checked_at DESC) x ON x.offer_id = o.id
      WHERE o.affiliate_url = x.link AND o.affiliate_url LIKE 'https://meli.la/%' AND o.status = 'active' AND o.link_verificado_em IS NULL`;
    console.log(`links verificáveis pela página já lida: ${alvo.length}`);
    if (!APPLY) return;
    if (!arg('por')) throw new Error('--apply exige --por=<quem>');
    const arq = `docs/backups/backfill-link-verificado-119-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    fs.mkdirSync('docs/backups', { recursive: true });
    const ids = alvo.map((a) => a.id);
    const antes = ids.length ? await sql`SELECT id::text, link_item_id, link_verificado_em FROM affiliate_offers WHERE id IN ${sql(ids)}` : [];
    fs.writeFileSync(arq, antes.map((r) => JSON.stringify(r)).join('\n') + '\n');
    for (const a of alvo) await sql`UPDATE affiliate_offers SET link_item_id = ${a.item}, link_verificado_em = ${a.at} WHERE id = ${a.id}::uuid AND link_verificado_em IS NULL`;
    console.log(`aplicado; backup: ${arq}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
export {};

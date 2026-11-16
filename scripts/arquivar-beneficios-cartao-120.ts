/**
 * "Itaú Mastercard 15%" da Amazon (2026-11-16): arquiva (remove da tabela, com backup NDJSON completo) as linhas de offer_card_benefits que o gatilho anti-isca considera NÃO VERIFICADAS
 * (kind cartao_pct, pix_pct, cashback), a começar pelas 28 do texto genérico da Amazon. Padrão dry-run.
 *   npx tsx --env-file=.env.local scripts/arquivar-beneficios-cartao-120.ts                    # conta
 *   npx tsx --env-file=.env.local scripts/arquivar-beneficios-cartao-120.ts --apply --por=<quem>
 *   npx tsx --env-file=.env.local scripts/arquivar-beneficios-cartao-120.ts --rollback=docs/backups/<arquivo>.ndjson
 * O gatilho no código (card-benefit.ts / card-benefits.ts) já esconde essas linhas; o arquivamento só tira o lixo do banco. Nunca apaga backup.
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
      const linhas = fs.readFileSync(ROLLBACK, 'utf8').split('\n').filter(Boolean);
      let n = 0;
      for (const l of linhas) {
        await sql`INSERT INTO offer_card_benefits SELECT * FROM jsonb_populate_record(NULL::offer_card_benefits, ${l}::jsonb) ON CONFLICT DO NOTHING`;
        n++;
      }
      console.log(`rollback: ${n} linhas reinseridas de ${ROLLBACK}`);
      return;
    }
    const alvo = await sql`SELECT * FROM offer_card_benefits WHERE kind IN ('cartao_pct', 'pix_pct', 'cashback')`;
    const porFonte = await sql`SELECT source, kind, count(*)::int n, count(DISTINCT offer_id)::int ofertas FROM offer_card_benefits WHERE kind IN ('cartao_pct', 'pix_pct', 'cashback') GROUP BY 1, 2`;
    console.table(porFonte);
    console.log(`linhas não verificadas: ${alvo.length}`);
    if (!APPLY) return;
    if (!arg('por')) throw new Error('--apply exige --por=<quem>');
    const arq = `docs/backups/arquivar-beneficios-cartao-120-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    fs.mkdirSync('docs/backups', { recursive: true });
    fs.writeFileSync(arq, alvo.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const del = await sql`DELETE FROM offer_card_benefits WHERE kind IN ('cartao_pct', 'pix_pct', 'cashback') RETURNING 1`;
    console.log(`arquivadas ${del.length} linhas; backup: ${arq}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
export {};

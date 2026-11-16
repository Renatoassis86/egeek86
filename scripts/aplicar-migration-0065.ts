/**
 * Aplica a migration 0065_amazon_leituras_preco (R-82). Aditiva. Padrao DRY-RUN: cria numa transacao, confere e DESFAZ; --apply grava; --rollback remove a tabela.
 *   npx tsx --env-file=.env.local scripts/aplicar-migration-0065.ts [--apply|--rollback]
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
class Desfaz extends Error {}

(async () => {
  const sql = connect();
  try {
    if (ROLLBACK) { await sql.unsafe(fs.readFileSync('drizzle/migrations/0065_amazon_leituras_preco.rollback.sql', 'utf8')); console.log('rollback feito: tabela removida'); return; }
    const ddl = fs.readFileSync('drizzle/migrations/0065_amazon_leituras_preco.sql', 'utf8');
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(ddl);
        const [c] = await tx<{ n: string }[]>`select count(*)::text n from information_schema.columns where table_name = 'amazon_leituras_preco'`;
        await tx`insert into amazon_leituras_preco (asin, fonte, preco_cents, lido_em) values ('B0TESTE123', 'keepa', 100, now())`;
        const [chk] = await tx<{ ok: boolean }[]>`select ('x' !~ '^[A-Z0-9]{10}$') and ('B0GPFC29F2' ~ '^[A-Z0-9]{10}$') ok`;
        const barrou = chk.ok;
        console.log(`colunas: ${c.n}; ASIN invalido barrado: ${barrou}`);
        if (!APPLY) throw new Desfaz();
        await tx`delete from amazon_leituras_preco where asin = 'B0TESTE123'`;
      });
      console.log('APLICADA (0065)');
    } catch (e) { if (e instanceof Desfaz) console.log('DRY-RUN ok: tudo desfeito (rode com --apply para gravar)'); else throw e; }
  } finally { await sql.end(); }
})();

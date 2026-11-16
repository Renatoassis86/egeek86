export {};
/**
 * Aplica a migration 0064_cupom_candidato (R-79; tabelas novas, aditivas). Padrão DRY-RUN: cria dentro de uma transação e DESFAZ.
 * --apply grava; --rollback remove as duas tabelas (só elas).
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
class Desfaz extends Error {}

(async () => {
  const sql = connect();
  try {
    if (ROLLBACK) { await sql.begin(async (tx) => { await tx.unsafe(fs.readFileSync('drizzle/migrations/0064_cupom_candidato.rollback.sql', 'utf8')); }); console.log('migration 0064 revertida.'); return; }
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(fs.readFileSync('drizzle/migrations/0064_cupom_candidato.sql', 'utf8'));
        const [a] = await tx<{ n: string }[]>`select count(*)::text n from cupom_candidato`;
        const [b] = await tx<{ n: string }[]>`select count(*)::text n from cupom_pista_fonte`;
        console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: tabelas criadas (cupom_candidato=${a.n}, cupom_pista_fonte=${b.n})`);
        if (!APPLY) throw new Desfaz();
      });
    } catch (e) { if (e instanceof Desfaz) console.log('dry-run concluído; nada gravado.'); else throw e; }
  } finally { await sql.end(); }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });

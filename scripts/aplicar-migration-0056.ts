export {};
export {};
/**
 * Aplica a migration 0056_offer_link_audit (ADITIVA: tabela offer_link_audit). Padrao dry-run; --apply grava; --rollback desfaz.
 * Backup: retrato do esquema (tabelas existentes e linhas de affiliate_offers) em docs/backups ANTES. Fora do journal do Drizzle (como 0044-0052).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

(async () => {
  const sql = connect();
  try {
    const t = await sql<{ n: string }[]>`select table_name n from information_schema.tables where table_schema='public' and table_name in ('offer_link_audit','affiliate_offers')`;
    const [x] = await sql<{ n: string }[]>`select count(*)::text n from pg_stat_activity where xact_start < now() - interval '30 seconds' and state <> 'idle'`;
    console.log(`${APPLY || ROLLBACK ? 'EXECUTA' : 'DRY-RUN'}: tabelas existentes: ${t.map((r) => r.n).join(',')}; transacoes > 30 s abertas: ${x.n}`);
    if (!APPLY && !ROLLBACK) return;
    if (Number(x.n) > 0) throw new Error('ha transacao longa aberta; tente de novo depois');
    fs.mkdirSync('docs/backups', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const arq = path.join('docs/backups', `migration-0056-esquema-antes-${stamp}.json`);
    fs.writeFileSync(arq, JSON.stringify({ tabelas_antes: t.map((r) => r.n), rollback: 'drizzle/migrations/0056_offer_link_audit.rollback.sql' }, null, 2));
    const ddl = fs.readFileSync(ROLLBACK ? 'drizzle/migrations/0056_offer_link_audit.rollback.sql' : 'drizzle/migrations/0056_offer_link_audit.sql', 'utf8');
    await sql.begin(async (tx) => { await tx.unsafe(ddl); });
    const d = await sql<{ n: string }[]>`select table_name n from information_schema.tables where table_schema='public' and table_name='offer_link_audit'`;
    console.log(ROLLBACK ? 'revertida.' : 'aplicada.', 'offer_link_audit existe:', d.length > 0, '| backup do esquema:', arq);
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });

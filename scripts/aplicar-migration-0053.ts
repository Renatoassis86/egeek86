export {};
export {};
/**
 * Aplica a migration 0053_offer_card_benefits (ADITIVA: tabela nova offer_card_benefits). Padrao dry-run; --apply grava; --rollback desfaz.
 * Backup: retrato do esquema (tabelas existentes e linhas de offer_coupon_reads) em docs/backups ANTES. Fora do journal do Drizzle (como 0044-0052).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

(async () => {
  const sql = connect();
  try {
    const t = await sql<{ n: string }[]>`select table_name n from information_schema.tables where table_schema='public' and table_name in ('offer_card_benefits','offer_coupon_reads')`;
    const [x] = await sql<{ n: string }[]>`select count(*)::text n from pg_stat_activity where xact_start < now() - interval '30 seconds' and state <> 'idle'`;
    console.log(`${APPLY || ROLLBACK ? 'EXECUTA' : 'DRY-RUN'}: tabelas existentes: ${t.map((r) => r.n).join(',')}; transacoes > 30 s abertas: ${x.n}`);
    if (!APPLY && !ROLLBACK) return;
    if (Number(x.n) > 0) throw new Error('ha transacao longa aberta; tente de novo depois');
    fs.mkdirSync('docs/backups', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const arq = path.join('docs/backups', `migration-0053-esquema-antes-${stamp}.json`);
    fs.writeFileSync(arq, JSON.stringify({ tabelas_antes: t.map((r) => r.n), rollback: 'drizzle/migrations/0053_offer_card_benefits.rollback.sql' }, null, 2));
    const ddl = fs.readFileSync(ROLLBACK ? 'drizzle/migrations/0053_offer_card_benefits.rollback.sql' : 'drizzle/migrations/0053_offer_card_benefits.sql', 'utf8');
    await sql.begin(async (tx) => { await tx.unsafe(ddl); });
    const d = await sql<{ n: string }[]>`select table_name n from information_schema.tables where table_schema='public' and table_name='offer_card_benefits'`;
    console.log(ROLLBACK ? 'revertida.' : 'aplicada.', 'offer_card_benefits existe:', d.length > 0, '| backup do esquema:', arq);
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });

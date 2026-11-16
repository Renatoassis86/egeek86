export {};
/**
 * Aplica a migration 0062_tipo_preco_amazon (ADITIVA: 4 colunas nullable). Padrao dry-run; --apply grava; --rollback desfaz.
 * Backup: retrato do esquema antes em docs/backups. Fora do journal do Drizzle (como 0044-0061).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const COLS = ['price_type', 'pix_cents', 'pix_visto_em'];

(async () => {
  const sql = connect();
  try {
    const c = await sql<{ t: string; c: string }[]>`select table_name t, column_name c from information_schema.columns where table_schema='public' and table_name in ('affiliate_price_snapshots','affiliate_offers') and column_name = any(${COLS})`;
    const [x] = await sql<{ n: string }[]>`select count(*)::text n from pg_stat_activity where xact_start < now() - interval '30 seconds' and state <> 'idle'`;
    console.log(`${APPLY || ROLLBACK ? 'EXECUTA' : 'DRY-RUN'}: colunas ja existentes: ${c.map((r) => `${r.t}.${r.c}`).join(',') || '(nenhuma)'}; transacoes > 30 s abertas: ${x.n}`);
    if (!APPLY && !ROLLBACK) return;
    if (Number(x.n) > 0) throw new Error('ha transacao longa aberta; tente de novo depois');
    fs.mkdirSync('docs/backups', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const arq = path.join('docs/backups', `migration-0062-esquema-antes-${stamp}.json`);
    fs.writeFileSync(arq, JSON.stringify({ colunas_antes: c, rollback: 'drizzle/migrations/0062_tipo_preco_amazon.rollback.sql' }, null, 2));
    const ddl = fs.readFileSync(ROLLBACK ? 'drizzle/migrations/0062_tipo_preco_amazon.rollback.sql' : 'drizzle/migrations/0062_tipo_preco_amazon.sql', 'utf8');
    // Tabelas quentes (cotacoes/ofertas): um ALTER por transacao, com repeticao se houver deadlock/lock_timeout.
    const cmds = ddl.split(String.fromCharCode(10)).filter((l) => /^ALTER TABLE/i.test(l.trim()));
    for (const c of cmds) {
      for (let t = 1; ; t++) {
        try { await sql.begin(async (tx) => { await tx.unsafe("SET LOCAL lock_timeout = '3s'"); await tx.unsafe(c); }); break; }
        catch (e) { if (t >= 15) throw e; await new Promise((r) => setTimeout(r, 1500 * t)); }
      }
    }
    const d = await sql<{ t: string; c: string }[]>`select table_name t, column_name c from information_schema.columns where table_schema='public' and table_name in ('affiliate_price_snapshots','affiliate_offers') and column_name = any(${COLS})`;
    console.log(ROLLBACK ? 'revertida.' : 'aplicada.', 'colunas agora:', d.map((r) => `${r.t}.${r.c}`).join(','), '| backup do esquema:', arq);
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });

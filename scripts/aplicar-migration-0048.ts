/**
 * Aplica a migration 0048_oferta_variacao_preco (ADITIVA: 3 colunas anulaveis em affiliate_offers, sem DEFAULT; so catalogo, sem reescrever tabela).
 * Padrao dry-run; --apply grava. Backup: retrato do esquema da tabela (colunas) em docs/backups ANTES. Rollback: 0048_oferta_variacao_preco.rollback.sql.
 * Fora do journal do Drizzle de proposito (como 0044/0045/0047). Depois de aplicada, ligar SHOPEE_VARIANTE_COLUNAS=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const colunas = async (sql: ReturnType<typeof connect>) =>
  sql<{ column_name: string; data_type: string; is_nullable: string }[]>`select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='affiliate_offers' order by ordinal_position`;

(async () => {
  const sql = connect();
  try {
    const antes = await colunas(sql);
    const [c] = await sql<{ n: string }[]>`select count(*)::text n from affiliate_offers`;
    const [x] = await sql<{ n: string }[]>`select count(*)::text n from pg_stat_activity where xact_start < now() - interval '30 seconds' and state <> 'idle'`;
    console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: affiliate_offers com ${antes.length} colunas, ${c.n} linhas; transacoes > 30 s abertas: ${x.n}`);
    const ja = antes.filter((a) => a.column_name.startsWith('variant_')).map((a) => a.column_name);
    console.log('colunas variant_* ja existentes:', ja.join(',') || 'nenhuma');
    if (!APPLY) return;
    if (Number(x.n) > 0) throw new Error('ha transacao longa aberta; tente de novo depois');
    fs.mkdirSync('docs/backups', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const arq = path.join('docs/backups', `migration-0048-esquema-antes-${stamp}.json`);
    fs.writeFileSync(arq, JSON.stringify({ tabela: 'affiliate_offers', linhas: Number(c.n), colunas: antes, rollback: 'drizzle/migrations/0048_oferta_variacao_preco.rollback.sql' }, null, 2));
    const ddl = fs.readFileSync('drizzle/migrations/0048_oferta_variacao_preco.sql', 'utf8');
    await sql.begin(async (tx) => { await tx.unsafe(ddl); });
    const depois = (await colunas(sql)).filter((a) => a.column_name.startsWith('variant_'));
    console.log('aplicada. colunas:', depois.map((d) => `${d.column_name}:${d.data_type}`).join(', '), '| backup do esquema:', arq);
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });

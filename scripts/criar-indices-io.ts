/**
 * Indices que cortam leitura de disco (analise de 2026-11-18: pg_stat_statements). SO ADICIONAM (reversivel com DROP INDEX), CONCURRENTLY (nao trava escrita).
 *  1) collector_runs: `SELECT max(COALESCE(finished_at, started_at)) ... WHERE job = $1 AND status = $2` lia 8 MB por chamada (65 GB em 3 dias).
 *  3) affiliate_price_snapshots (collected_at): contagem/leitura incremental de cotacoes novas (o BRIN sozinho levou ~14 s para 1 h de cotacoes).
 *  2) group_messages: historico de envios (`loadSentHistory`, 7 dias por COALESCE(sent_at, created_at)) lia 11,8 MB por chamada (143 GB em 3 dias).
 *  5) collector_runs parcial (cota Plus, R-111): plusCallsUsed lia ~9.000 linhas de 24 h para somar ~500.
 * npx tsx --env-file=.env.local scripts/criar-indices-io.ts [--apply]    (rollback: DROP INDEX CONCURRENTLY IF EXISTS <nome>)
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const INDICES: Array<{ nome: string; sql: string }> = [
  { nome: 'collector_runs_job_status_fim_idx', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS collector_runs_job_status_fim_idx ON collector_runs (job, status, (COALESCE(finished_at, started_at)) DESC)` },
  { nome: 'group_messages_hist_envio_idx', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_messages_hist_envio_idx ON group_messages (channel, (COALESCE(sent_at, created_at)) DESC) WHERE status IN ('enviada', 'enviando', 'simulada')` },
  { nome: 'affiliate_price_snapshots_collected_btree_idx', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS affiliate_price_snapshots_collected_btree_idx ON affiliate_price_snapshots (collected_at)` },
  { nome: 'group_messages_tg_enviada_sent_idx', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_messages_tg_enviada_sent_idx ON group_messages (sent_at DESC) WHERE channel = 'tg' AND status = 'enviada'` },
  { nome: 'collector_runs_plus_calls_idx', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS collector_runs_plus_calls_idx ON collector_runs (started_at DESC) WHERE job LIKE 'collect-vertical:%' OR job LIKE 'semear-vertical:%'` },
];

(async () => {
  const q = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1, prepare: false, connect_timeout: 40, idle_timeout: 20 });
  try {
    for (const i of INDICES) {
      const ex = await q`SELECT 1 FROM pg_indexes WHERE indexname = ${i.nome}`;
      console.log(i.nome, ex.length ? 'JA EXISTE' : APPLY ? 'criando...' : 'dry-run');
      if (ex.length || !APPLY) continue;
      const t0 = Date.now();
      await q`SET statement_timeout = 0`;
      await q.unsafe(i.sql);
      const ok = await q`SELECT indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = ${i.nome}`;
      console.log(i.nome, 'criado em', Math.round((Date.now() - t0) / 1000), 's; valido:', ok[0]?.indisvalid);
    }
  } finally {
    await q.end({ timeout: 3 }).catch(() => undefined);
  }
  process.exit(0);
})().catch((e) => { console.error(String(e.message ?? e).slice(0, 300)); process.exit(1); });

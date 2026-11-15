/**
 * LIMPEZA DE LINHAS PRESAS em collector_runs (dono, 2026-11-14, R2-8): execuções do `refresh-snapshots:stats` que ficaram em 'running'
 * para sempre (o orçamento estourava o teto de 300 s da função; corrigido em 600b702). Marca como 'error' com stopped_because='timeout_antigo'.
 *
 *   # DRY-RUN (padrão): só SELECT
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-running-presos-2026-11-14.ts
 *   # APLICAR: backup NDJSON + log ANTES de gravar; só toca status, finished_at e stopped_because
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-running-presos-2026-11-14.ts --apply
 *   # REVERTER: volta status/finished_at/stopped_because anteriores, só das linhas que ainda têm a marca deste lote
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-running-presos-2026-11-14.ts --rollback docs/backups/limpeza-running-presos-log-<ts>.json [--apply]
 *
 * Alvo: job = 'refresh-snapshots:stats', status = 'running', finished_at IS NULL e started_at há mais de 1 h. NUNCA toca em 'running' recente
 * nem em outros jobs. Guarda otimista: o UPDATE só vale se a linha continua 'running' e sem finished_at.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const JOB = 'refresh-snapshots:stats';
const MOTIVO = 'timeout_antigo';

interface Linha { id: string; job: string; status: string; started_at: string; finished_at: string | null; stopped_because: string | null }

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (rb >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as { alterados: Linha[] };
      const ids = log.alterados.map((l) => l.id);
      const atuais = ids.length ? await sql<{ id: string }[]>`select id::text as id from collector_runs where id = any(${ids}::bigint[]) and status = 'error' and stopped_because = ${MOTIVO}` : [];
      console.log(`a restaurar: ${atuais.length}/${ids.length} (ainda com a marca ${MOTIVO})`);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      const ok = new Set(atuais.map((a) => a.id));
      for (const l of log.alterados) {
        if (!ok.has(l.id)) continue;
        await sql`update collector_runs set status = ${l.status}, finished_at = ${l.finished_at}, stopped_because = ${l.stopped_because} where id = ${l.id}::bigint and status = 'error' and stopped_because = ${MOTIVO}`;
      }
      return void console.log('ROLLBACK aplicado.');
    }
    const alvo = await sql<Linha[]>`
      select id::text as id, job, status, started_at::text as started_at, finished_at::text as finished_at, stopped_because
        from collector_runs
       where job = ${JOB} and status = 'running' and finished_at is null and started_at < now() - interval '1 hour'
       order by started_at`;
    const recentes = await sql<{ n: number }[]>`select count(*)::int as n from collector_runs where job = ${JOB} and status = 'running' and started_at >= now() - interval '1 hour'`;
    console.log(`presas (running, sem finished_at, > 1 h): ${alvo.length} | running recentes preservadas: ${recentes[0]?.n ?? 0}`);
    for (const l of alvo.slice(0, 5)) console.log(`  id=${l.id} iniciada=${l.started_at}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply.');
    if (!alvo.length) return void console.log('nada a fazer.');
    const bk = path.join(DIR, `limpeza-running-presos-${stamp}.ndjson`);
    fs.writeFileSync(bk, alvo.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const logFile = path.join(DIR, `limpeza-running-presos-log-${stamp}.json`);
    const alterados: Linha[] = [];
    for (const l of alvo) {
      const r = await sql`update collector_runs set status = 'error', finished_at = now(), stopped_because = ${MOTIVO}
                           where id = ${l.id}::bigint and status = 'running' and finished_at is null`;
      if (r.count) alterados.push(l);
    }
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), job: JOB, motivo: MOTIVO, backup: path.basename(bk), alterados,
      rollback: `npx tsx --env-file=.env.local scripts/aplicar-limpeza-running-presos-2026-11-14.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`GRAVADO: ${alterados.length}/${alvo.length} | backup: ${path.relative(process.cwd(), bk)} | log: ${path.relative(process.cwd(), logFile)}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });

export {};

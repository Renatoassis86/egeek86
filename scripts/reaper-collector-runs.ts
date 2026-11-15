/**
 * #72: REAPER MANUAL de collector_runs 'running' presas (mesma regra do cron collector-health: maxDuration do job + 2 min).
 *
 *   # DRY-RUN (padrao): so SELECT, mostra por job e idade
 *   npx tsx --env-file=.env.local scripts/reaper-collector-runs.ts
 *   # APLICAR: backup NDJSON + log ANTES de gravar; --por registra quem/por que (obrigatorio com --apply)
 *   npx tsx --env-file=.env.local scripts/reaper-collector-runs.ts --apply --por "fila #72"
 *   # REVERTER: volta status/finished_at/stopped_because/meta anteriores, so das linhas ainda com a marca timeout_reaper
 *   npx tsx --env-file=.env.local scripts/reaper-collector-runs.ts --rollback docs/backups/reaper-collector-runs-log-<ts>.json [--apply]
 *
 * Transacoes curtas (um UPDATE por linha, guarda otimista: so vale se continua 'running' e sem finished_at). Nunca toca em 'running' recente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { LIMITE_MINIMO_S, REAPER_MOTIVO, estaAbandonada, limiteDeAbandonoS } from '../src/lib/collector-runs/reaper-rules';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const iPor = argv.indexOf('--por');
const POR = iPor >= 0 ? argv[iPor + 1] : undefined;
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

interface Linha { id: string; job: string; status: string; started_at: string; started_ms: string; finished_at: string | null; stopped_because: string | null; meta: unknown }

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (rb >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as { alterados: Linha[] };
      const ids = log.alterados.map((l) => l.id);
      const atuais = ids.length ? await sql<{ id: string }[]>`select id::text as id from collector_runs where id = any(${ids}::bigint[]) and status = 'error' and stopped_because = ${REAPER_MOTIVO}` : [];
      console.log(`a restaurar: ${atuais.length}/${ids.length} (ainda com a marca ${REAPER_MOTIVO})`);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      const ok = new Set(atuais.map((a) => a.id));
      for (const l of log.alterados) {
        if (!ok.has(l.id)) continue;
        await sql`update collector_runs set status = ${l.status}, finished_at = ${l.finished_at}, stopped_because = ${l.stopped_because}, meta = ${l.meta == null ? null : JSON.stringify(l.meta)}::jsonb
                   where id = ${l.id}::bigint and status = 'error' and stopped_because = ${REAPER_MOTIVO}`;
      }
      return void console.log('ROLLBACK aplicado.');
    }
    if (APPLY && !POR) throw new Error('--apply exige --por "<motivo/quem>"');
    const cand = await sql<Linha[]>`
      select id::text as id, job, status, started_at::text as started_at, (extract(epoch from started_at) * 1000)::bigint::text as started_ms,
             finished_at::text as finished_at, stopped_because, meta
        from collector_runs
       where status = 'running' and finished_at is null and started_at < now() - make_interval(secs => ${LIMITE_MINIMO_S})
       order by started_at`;
    const agora = Date.now();
    const alvo = cand.filter((l) => estaAbandonada(l.job, Number(l.started_ms), agora));
    const total = (await sql<{ n: number }[]>`select count(*)::int as n from collector_runs where status = 'running'`)[0]?.n ?? 0;
    const porJob = new Map<string, { n: number; maisVelhaH: number }>();
    for (const l of alvo) {
      const h = (agora - Number(l.started_ms)) / 3_600_000;
      const c = porJob.get(l.job) ?? { n: 0, maisVelhaH: 0 };
      c.n++; c.maisVelhaH = Math.max(c.maisVelhaH, h); porJob.set(l.job, c);
    }
    console.log(`running no total: ${total} | acima de maxDuration+2min do job: ${alvo.length} | preservadas (recentes): ${total - alvo.length}`);
    for (const [j, c] of [...porJob].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${j.padEnd(38)} n=${String(c.n).padStart(3)} mais velha=${c.maisVelhaH.toFixed(1)} h (limite ${limiteDeAbandonoS(j)} s)`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "<motivo>".');
    if (!alvo.length) return void console.log('nada a fazer.');
    const bk = path.join(DIR, `reaper-collector-runs-${stamp}.ndjson`);
    fs.writeFileSync(bk, alvo.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const logFile = path.join(DIR, `reaper-collector-runs-log-${stamp}.json`);
    const nota = JSON.stringify({ reaper: { em: new Date().toISOString(), por: POR, motivo: 'running alem de maxDuration + 2 min (script)' } });
    const alterados: Linha[] = [];
    for (const l of alvo) {
      const r = await sql`update collector_runs set status = 'error', finished_at = now(), stopped_because = ${REAPER_MOTIVO}, meta = coalesce(meta, '{}'::jsonb) || ${nota}::jsonb
                           where id = ${l.id}::bigint and status = 'running' and finished_at is null`;
      if (r.count) alterados.push(l);
    }
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), por: POR, motivo: REAPER_MOTIVO, backup: path.basename(bk), alterados,
      rollback: `npx tsx --env-file=.env.local scripts/reaper-collector-runs.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`GRAVADO: ${alterados.length}/${alvo.length} | backup: ${path.relative(process.cwd(), bk)} | log: ${path.relative(process.cwd(), logFile)}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });

export {};

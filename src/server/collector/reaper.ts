import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorRunsEnabled } from './collector-runs';
import { LIMITE_MINIMO_S, REAPER_MOTIVO, estaAbandonada } from '@/lib/collector-runs/reaper-rules';

export interface ReaperResult {
  skipped?: string;
  encontradas: number;
  fechadas: number;
  porJob: Record<string, number>;
}

const LOTE = 50;

/**
 * #72: fecha (status 'error', stopped_because 'timeout_reaper') as execucoes 'running' mais velhas que maxDuration + 2 min do proprio job.
 * Roda dentro do cron collector-health (sem cron novo). So com COLLECTOR_RUNS=1. Nunca lanca. Cada UPDATE e um comando unico e curto
 * (lotes de 50) com guarda otimista: so vale se a linha continua 'running' e sem finished_at. O estado anterior e recuperavel:
 * antes era sempre status='running', finished_at nulo, stopped_because nulo; a meta anterior fica preservada e so ganha a chave `reaper`
 * (rollback: scripts/reaper-collector-runs.ts --rollback, ou por SQL pela marca stopped_because='timeout_reaper').
 */
export async function reapStuckRuns(opts: { por?: string } = {}): Promise<ReaperResult> {
  const vazio: ReaperResult = { encontradas: 0, fechadas: 0, porJob: {} };
  if (!collectorRunsEnabled()) return { ...vazio, skipped: 'COLLECTOR_RUNS desligada' };
  try {
    const rows = await db.execute<{ id: string; job: string; started_ms: string }>(sql`
      SELECT id::text AS id, job, (extract(epoch from started_at) * 1000)::bigint::text AS started_ms
        FROM collector_runs
       WHERE status = 'running' AND finished_at IS NULL AND started_at < now() - make_interval(secs => ${LIMITE_MINIMO_S})
       ORDER BY started_at
       LIMIT 500`);
    const agora = Date.now();
    const alvo = rows.filter((r) => estaAbandonada(r.job, Number(r.started_ms), agora));
    const porJob: Record<string, number> = {};
    let fechadas = 0;
    const nota = JSON.stringify({ reaper: { em: new Date(agora).toISOString(), por: opts.por ?? 'collector-health', motivo: 'running alem de maxDuration + 2 min' } });
    for (let i = 0; i < alvo.length; i += LOTE) {
      const ids = alvo.slice(i, i + LOTE).map((r) => r.id);
      const done = await db.execute<{ id: string; job: string }>(sql`
        UPDATE collector_runs
           SET status = 'error', finished_at = now(), stopped_because = ${REAPER_MOTIVO},
               meta = COALESCE(meta, '{}'::jsonb) || ${nota}::jsonb
         WHERE id = ANY(${sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::bigint[]`})
           AND status = 'running' AND finished_at IS NULL
        RETURNING id::text AS id, job`);
      for (const d of done) { fechadas++; porJob[d.job] = (porJob[d.job] ?? 0) + 1; }
    }
    if (fechadas > 0) console.warn('[reaper] execucoes running presas fechadas:', fechadas, JSON.stringify(porJob));
    return { encontradas: alvo.length, fechadas, porJob };
  } catch (err) {
    console.error('[reaper] falhou (ignorado):', err instanceof Error ? err.message : err);
    return { ...vazio, skipped: 'erro' };
  }
}

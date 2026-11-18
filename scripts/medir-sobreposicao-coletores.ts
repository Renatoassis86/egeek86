/** Mede, so leitura, a sobreposicao dos coletores por departamento nas ultimas 24 h (Arquitetura v2, Fase 0). */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
(async () => {
  const r = await db.execute(sql`
    WITH x AS (SELECT job, started_at, COALESCE(finished_at, started_at + interval '5 minutes') AS fim, status, duration_ms FROM collector_runs WHERE job LIKE 'collect-vertical:%' AND started_at > now() - interval '24 hours')
    SELECT job, count(*)::int execucoes, round(avg(duration_ms)/1000)::int media_s, round(max(duration_ms)/1000)::int max_s,
      string_agg(DISTINCT status, ',') sts, count(*) FILTER (WHERE status <> 'ok')::int nao_ok,
      (SELECT count(*)::int FROM x b WHERE b.job = a.job AND EXISTS (SELECT 1 FROM x c WHERE c.job <> b.job AND c.started_at < b.fim AND c.fim > b.started_at)) AS com_outro_rodando
    FROM x a GROUP BY job ORDER BY job`);
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
})();

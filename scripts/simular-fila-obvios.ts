/**
 * Simula (SOMENTE SELECT, nada e gravado) quantos itens PENDENTES da fila de classificacao o criterio de "casos obvios" liberaria
 * (src/lib/identity-queue/obvio.ts) e lista uma amostra com o motivo. Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/simular-fila-obvios.ts [--amostra=20]
 */
import { db } from '../src/lib/db';
import { selectObvious, type Exec } from '../src/server/identity-queue/queue';
import { sql } from 'drizzle-orm';

async function main() {
  const n = Number((process.argv.find((a) => a.startsWith('--amostra=')) ?? '--amostra=20').split('=')[1]);
  const exec = db as unknown as Exec;
  const tot = (await db.execute(sql`SELECT count(*)::int AS n FROM identity_review_items WHERE status = 'pending'`)) as unknown as Array<{ n: number }>;
  const { avaliados, picks } = await selectObvious(exec);
  const por = (f: (p: (typeof picks)[number]) => string) => {
    const o: Record<string, number> = {};
    for (const p of picks) o[f(p)] = (o[f(p)] ?? 0) + 1;
    return o;
  };
  console.log(JSON.stringify({ pendentesTotal: tot[0].n, avaliados, liberados: picks.length, porCriterio: por((p) => p.criterio), porLoja: por((p) => p.vertical), porValor: por((p) => `${p.axis}:${p.value}`) }, null, 1));
  const step = Math.max(1, Math.floor(picks.length / n));
  console.log('--- amostra ---');
  for (let i = 0, c = 0; i < picks.length && c < n; i += step, c++) {
    const p = picks[i];
    console.log(`[${p.vertical}] ${p.axis}=${p.value} (${p.criterio}) | anuncio: ${p.title.slice(0, 90)} | produto: ${(p.masterName ?? '-').slice(0, 90)} | ${p.motivo}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

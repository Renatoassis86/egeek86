/**
 * Teste de leitura do /admin/fluxo contra o banco real (somente SELECT):
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/teste-fluxo-leitura.ts
 * Imprime o resumo do snapshot, a saude dos nos e os alertas. Sai com codigo 1 se algum bloco falhar ou a fila nao parsear.
 */
import { carregarFluxo } from '../src/server/queries/fluxo';
import { avaliarJobs, avaliarNos, montarAlertas } from '../src/lib/fluxo/avaliar';
import { parseFilaExecucao } from '../src/lib/fluxo/modelo';

async function main() {
  const t0 = Date.now();
  const s = await carregarFluxo();
  const ms = Date.now() - t0;
  const blocos = { jobs: s.jobs, mensagens: s.mensagens, classificacao: s.classificacao, ofertas: s.ofertas, idleTx: s.idleTx, snapshots: s.snapshots, plataforma: s.plataformaDesconhecida };
  for (const [k, b] of Object.entries(blocos)) console.log(k.padEnd(14), b.ok ? 'ok' : `FALHOU ${b.erro}`);
  console.log('fila', s.fila.ok ? `${s.fila.linhas.length} linhas` : `FALHOU ${s.fila.erro}`);
  console.log(`tempo total ${ms} ms`);
  const t1 = Date.now(); await carregarFluxo(); console.log(`2a leitura (cache) ${Date.now() - t1} ms`);
  const agora = Date.now();
  const jobs = avaliarJobs(s, agora);
  const nos = avaliarNos(s, jobs, agora);
  for (const n of nos) console.log('no', n.id.padEnd(16), n.saude.padEnd(9), n.detalhe);
  for (const a of montarAlertas(s, jobs, agora)) console.log('alerta', a.severidade, a.titulo);
  console.log('jobs24h', s.jobs.dados?.totalRuns24h, 'linhas', s.jobs.dados?.linhas.length);
  const amostra = parseFilaExecucao('| # | Prio | Tarefa | Dono | Estado | Critério |\n|---|---|---|---|---|---|\n| 1 | P0 | **a** | x | y | z |\n');
  if (amostra.length !== 1 || amostra[0].tarefa !== 'a') throw new Error('parse da fila falhou');
  if (Object.values(blocos).some((b) => !b.ok) || !s.fila.ok) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

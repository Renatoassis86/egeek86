/** #72/#73: regra do reaper (pura), reaper no banco com linha de teste propria, origem do disparo e health. Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-reaper-collector-runs.ts */
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { REAPER_FOLGA_S, estaAbandonada, limiteDeAbandonoS, tetoDoJobS } from '../src/lib/collector-runs/reaper-rules';
import { origemDoDisparo, rejectUnlessCronAuthorized } from '../src/lib/auth/cron-auth';
import { connect } from './_dup-shared';

let total = 0, fails = 0;
function check(nome: string, ok: boolean) { total++; if (!ok) { fails++; console.log('FALHA:', nome); } else console.log('ok  ', nome); }

async function main() {
  // regra pura: o teto de cada job espelha o maxDuration da rota (le o codigo, nao confia na tabela)
  const rotas: Array<[string, string]> = [
    ['collect-prices', 'src/app/api/cron/collect-prices/route.ts'], ['collect-shopee', 'src/app/api/cron/collect-shopee/route.ts'],
    ['collect-vertical:livros', 'src/app/api/cron/collect-vertical/route.ts'], ['refresh-snapshots:stats', 'src/app/api/cron/refresh-snapshots/route.ts'],
    ['discover-products', 'src/app/api/cron/discover-products/route.ts'], ['semear-vertical:impressao3d', 'src/app/api/cron/semear-vertical/route.ts'],
    ['group-messages', 'src/app/api/cron/group-messages/route.ts'], ['aprovacao-auto', 'src/app/api/cron/aprovacao-auto/route.ts'],
    ['amazon-assistida', 'src/app/api/ingest/amazon-assistida/route.ts'], ['cobertura-shopee', 'src/app/api/cron/cobertura-shopee/route.ts'],
  ];
  for (const [job, f] of rotas) {
    const m = /export const maxDuration = (\d+)/.exec(fs.readFileSync(f, 'utf8'));
    check(`teto de ${job} = maxDuration da rota (${m?.[1]})`, !!m && tetoDoJobS(job) === Number(m[1]));
  }
  check('folga de 2 min', REAPER_FOLGA_S === 120 && limiteDeAbandonoS('collect-prices') === 320);
  check('job desconhecido usa 300 s', tetoDoJobS('x-novo') === 300);
  const now = 1_000_000_000_000;
  check('viva (4 min, collect-prices): preservada', !estaAbandonada('collect-prices', now - 4 * 60_000, now));
  check('abandonada (6 min, collect-prices)', estaAbandonada('collect-prices', now - 6 * 60_000, now));
  check('semear-vertical a 4 min ja abandonada (teto 60 s)', estaAbandonada('semear-vertical:x', now - 4 * 60_000, now));
  check('collect-shopee a 6 min preservada (teto 300 s)', !estaAbandonada('collect-shopee', now - 6 * 60_000, now));

  // origem
  const h = (ua: string, ip = '203.0.113.9') => new Headers({ 'user-agent': ua, 'x-forwarded-for': `${ip}, 10.0.0.1` });
  check('vercel-cron reconhecido', origemDoDisparo(h('vercel-cron/1.0')).vercelCron);
  check('outro UA e externo, IP = primeiro do x-forwarded-for', !origemDoDisparo(h('curl/8')).vercelCron && origemDoDisparo(h('curl/8')).ip === '203.0.113.9');
  const S = 'segredo-de-teste-0123456789abcdef'; const orig = process.env.CRON_SECRET; process.env.CRON_SECRET = S;
  const logs: string[] = []; const w = console.warn; console.warn = (...a: unknown[]) => { logs.push(a.join(' ')); };
  const mk = (ua: string) => new NextRequest('https://x.test/api/cron/collect-prices', { headers: { authorization: `Bearer ${S}`, 'user-agent': ua, 'x-forwarded-for': '198.51.100.7' } });
  check('Bearer + vercel-cron: autoriza sem log de origem', rejectUnlessCronAuthorized(mk('vercel-cron/1.0')) === null && logs.length === 0);
  check('Bearer + curl: autoriza e registra disparo externo (sem segredo)', rejectUnlessCronAuthorized(mk('curl/8')) === null && logs.length === 1 && logs[0]!.includes('ip=198.51.100.7') && !logs[0]!.includes(S));
  console.warn = w; if (orig === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = orig;

  // health usa a regra unica
  const hs = fs.readFileSync('src/app/api/health/route.ts', 'utf8');
  check('/api/health usa rejectUnlessCronAuthorized e nao compara o segredo na mao', hs.includes('rejectUnlessCronAuthorized(request) === null') && !hs.includes('=== `Bearer'));

  // reaper no banco, com linha de teste propria (job fora da producao), removida no fim
  process.env.COLLECTOR_RUNS = '1';
  const { reapStuckRuns } = await import('../src/server/collector/reaper');
  const sql = connect();
  try {
    const ins = await sql<{ id: string }[]>`insert into collector_runs (job, network, started_at, meta) values ('teste-reaper', null, now() - interval '30 minutes', '{"x":1}'::jsonb), ('teste-reaper', null, now() - interval '1 minute', null) returning id::text as id`;
    const [velha, recente] = [ins[0]!.id, ins[1]!.id];
    const r = await reapStuckRuns({ por: 'teste' });
    const ap = await sql<{ id: string; status: string; stopped_because: string | null; fin: boolean; meta: Record<string, unknown> | null }[]>`select id::text as id, status, stopped_because, finished_at is not null as fin, meta from collector_runs where id = any(${[velha, recente]}::bigint[])`;
    const v = ap.find((x) => x.id === velha)!, c = ap.find((x) => x.id === recente)!;
    check('reaper fechou a velha (error, timeout_reaper, finished_at, meta antiga preservada + reaper)', v.status === 'error' && v.stopped_because === 'timeout_reaper' && v.fin && v.meta?.x === 1 && !!v.meta?.reaper);
    check('reaper preservou a recente', c.status === 'running' && !c.fin);
    check('contagem do resultado', r.fechadas >= 1 && r.porJob['teste-reaper'] === 1);
    const r2 = await reapStuckRuns();
    check('idempotente: 2a rodada nao fecha de novo a linha de teste', (r2.porJob['teste-reaper'] ?? 0) === 0);
    await sql`delete from collector_runs where id = any(${[velha, recente]}::bigint[])`;
  } finally { await sql.end(); }
  console.log(`${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
export {};

/**
 * VIGIA DOS LOOPS por BATIMENTO (metodologia Chrome, 2026-11-18): UMA consulta ao banco, sem sondar abas por CDP.
 * Saida: por loop, minutos desde o ultimo batimento, atraso do timer, visibilidade e memoria. Loop sem batimento ha mais de LIMITE min = reinjetar (navegar a aba e injetar).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/vigia-loops.ts [--limite 6]
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const LOOPS = ['amazon-assistida', 'cupons-24h', 'ml-cupons-item', 'ml-links-ui', 'shopee-cupons', 'shopee-vivo'];
const li = process.argv.indexOf('--limite');
const LIMITE = li >= 0 ? Number(process.argv[li + 1]) || 6 : 6;
(async () => {
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (job) job, round(extract(epoch from now() - started_at) / 60, 1)::float AS min, status, meta
    FROM collector_runs WHERE job LIKE 'loop:%' AND started_at > now() - interval '3 hours' ORDER BY job, started_at DESC`)) as unknown as Array<{ job: string; min: number; status: string; meta: Record<string, unknown> | null }>;
  const por = new Map(rows.map((r) => [r.job.replace('loop:', ''), r]));
  const reinjetar: string[] = [];
  for (const l of LOOPS) {
    const r = por.get(l);
    const velho = !r || r.min > LIMITE || r.status === 'error';
    if (velho) reinjetar.push(l);
    console.log(`${velho ? 'REINJETAR' : 'ok       '} ${l.padEnd(18)} ${r ? `${r.min} min` : 'sem batimento'} ${r?.meta ? `v${r.meta.versao ?? '?'} lag ${r.meta.lagMs ?? '?'} ms ${r.meta.visivel ?? ''} ${r.meta.memMb ?? '?'} MB` : ''}`);
  }
  console.log(reinjetar.length ? `REINJETAR: ${reinjetar.join(', ')}` : 'todos os loops batendo');
  // 2026-11-18: a automação do Telegram pausada em silêncio custou ~25 min de envios. O vigia avisa e, se a pausa foi AUTOMÁTICA (nota 'pausa automática') e o
  // motivo não é do bot/canal, religa. Pausa feita pelo dono (sem essa nota) NUNCA é religada por aqui.
  const au = (await db.execute(sql`SELECT rules->>'state' AS s, rules->>'note' AS n, extract(epoch from now() - updated_at)/60 AS min FROM feature_flags WHERE key = 'group_messages_auto'`)) as unknown as Array<{ s: string; n: string | null; min: number }>;
  const a0 = au[0];
  if (a0 && a0.s === 'off') {
    const auto = /^pausa autom/i.test(a0.n ?? '');
    const doBot = /unauthorized|forbidden|chat not found|bot was|not enough rights|token/i.test(a0.n ?? '');
    console.log(`AUTOMACAO OFF ha ${Math.round(Number(a0.min))} min: ${String(a0.n ?? '(sem nota)').slice(0, 120)}${auto && !doBot ? ' => religando (pausa automatica sem causa no bot/canal)' : ' => NAO religo (pausa do dono ou causa no bot/canal)'}`);
    if (auto && !doBot) {
      const { setAutomationState } = await import('../src/server/messaging/group-automation-store');
      await setAutomationState('on', 'religada pelo vigia: pausa automatica sem causa no bot/canal');
    }
  }
  process.exit(0);
})().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });

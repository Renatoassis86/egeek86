/**
 * Simula (SEM enviar, SEM gravar) o plano de envio das lojas Plus com os candidatos REAIS de agora e o historico REAL de envios:
 * repete applyLimits como o ciclo faz (uma mensagem por volta, cada envio simulado entra no historico) e mostra produtos/tipos/
 * gatilhos por loja. Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/simular-plano-diversidade.ts [--sem-achado] [--voltas=N]
 */
import { detectGroupCandidates, loadSentHistory } from '../src/server/messaging/group-offers';
import { applyLimits, type SentRecord } from '../src/lib/messaging/group-rules';

async function main() {
  const achado = !process.argv.includes('--sem-achado');
  const voltas = Number((process.argv.find((a) => a.startsWith('--voltas=')) ?? '--voltas=200').split('=')[1]);
  const t0 = Date.now();
  const now = new Date();
  const r = await detectGroupCandidates({ now, achado });
  const ms = Date.now() - t0;
  const history: SentRecord[] = [...r.history];
  const cands = r.candidates.filter((c) => c.vertical !== 'games' && c.sendable && c.status === 'auto' && !c.held);
  const porTrig: Record<string, number> = {};
  for (const c of cands) porTrig[c.trigger] = (porTrig[c.trigger] ?? 0) + 1;
  const sent: Array<{ v: string; tipo: string; trigger: string; pid: string }> = [];
  let pool = cands;
  for (let i = 0; i < voltas && pool.length; i++) {
    const at = new Date(now.getTime() + i * 4_000);
    const plan = applyLimits(pool, history, at);
    if (!plan.next) break;
    const n = plan.next;
    sent.push({ v: n.vertical, tipo: n.tipo ?? '-', trigger: n.trigger, pid: n.masterProductId });
    history.push({ masterProductId: n.masterProductId, priceCents: n.priceCents, sentAt: at, trigger: n.trigger, cls: n.cls, vertical: n.vertical, tipo: n.tipo ?? null, networkSlug: n.networkSlug });
    pool = pool.filter((c) => c.messageKey !== n.messageKey);
  }
  const por: Record<string, { msgs: number; produtos: Set<string>; tipos: Record<string, number>; ac: number }> = {};
  for (const s of sent) {
    const e = (por[s.v] ??= { msgs: 0, produtos: new Set(), tipos: {}, ac: 0 });
    e.msgs++; e.produtos.add(s.pid); e.tipos[s.tipo] = (e.tipos[s.tipo] ?? 0) + 1; if (s.trigger === 'AC') e.ac++;
  }
  console.log(JSON.stringify({
    achado, detectMs: ms, produtosAvaliados: r.counts.productsEvaluated, candidatosPlusEnviaveis: cands.length, porGatilho: porTrig, voltasSimuladas: sent.length,
    historicoReal24h: r.history.filter((h) => !h.itemOnly && now.getTime() - h.sentAt.getTime() < 86_400_000).length,
    porLoja: Object.fromEntries(Object.entries(por).map(([v, e]) => [v, { msgs: e.msgs, produtosDistintos: e.produtos.size, tiposDistintos: Object.keys(e.tipos).length, achados: e.ac, tipoLider: Object.entries(e.tipos).sort((a, b) => b[1] - a[1])[0], tipos: e.tipos }])),
  }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

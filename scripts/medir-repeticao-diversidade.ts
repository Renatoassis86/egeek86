/**
 * Mede repetição por master e concentração por tipo nas mensagens do grupo (SOMENTE LEITURA).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-repeticao-diversidade.ts [horas=24]
 * Saída JSON: (1) masters com 2+ envios na janela, por loja e par de gatilhos, com intervalo; (2) mensagens por loja x tipo (24 h e 7 d);
 * (3) catálogo ativo por loja x tipo. Usado antes/depois da ata 2026-11-13-diversificacao-e-repeticao.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { eligibleOfferSql } from '../src/server/pricing/eligibility-sql';
import { inAverageSql } from '../src/server/queries/public-offers';
import { masterNoEscopoSql } from '../src/server/queries/escopo-vitrine';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
type Row = Record<string, unknown>;
const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };
async function main() {
  const horas = Number(process.argv[2] ?? 24);
  const sent = await db.execute<Row>(sql`
    SELECT g.master_product_id::text AS mid, g.trigger, g.vertical, g.sent_at, m.name
    FROM group_messages g LEFT JOIN master_products m ON m.id = g.master_product_id
    WHERE g.channel = 'tg' AND g.status = 'enviada' AND g.sent_at >= now() - interval '7 days' AND g.master_product_id IS NOT NULL`);
  const now = Date.now();
  const win = (r: Row, h: number) => now - new Date(String(r.sent_at)).getTime() < h * 3600_000;
  const byMaster = new Map<string, Row[]>();
  for (const r of sent) if (win(r, horas)) (byMaster.get(String(r.mid)) ?? byMaster.set(String(r.mid), []).get(String(r.mid))!).push(r);
  const repLoja: Record<string, number> = {}, repPar: Record<string, number> = {}, gaps: number[] = [];
  let mastersRep = 0, enviosExtra = 0;
  for (const rows of byMaster.values()) {
    if (rows.length < 2) continue;
    mastersRep++; enviosExtra += rows.length - 1;
    const s = rows.slice().sort((a, b) => +new Date(String(a.sent_at)) - +new Date(String(b.sent_at)));
    bump(repLoja, String(s[0].vertical));
    for (let i = 1; i < s.length; i++) { bump(repPar, `${s[i - 1].trigger}>${s[i].trigger}`); gaps.push((+new Date(String(s[i].sent_at)) - +new Date(String(s[i - 1].sent_at))) / 60000); }
  }
  gaps.sort((a, b) => a - b);
  const med = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null;
  const dist = (h: number) => {
    const o: Record<string, Record<string, number>> = {};
    for (const r of sent) if (win(r, h)) { const v = String(r.vertical); const t = classificarTipo(v, String(r.name ?? '')); (o[v] ??= {})[t] = ((o[v] ??= {})[t] ?? 0) + 1; }
    return o;
  };
  const top = (o: Record<string, Record<string, number>>) => Object.fromEntries(Object.entries(o).map(([v, t]) => { const tot = Object.values(t).reduce((a, b) => a + b, 0); const ord = Object.entries(t).sort((a, b) => b[1] - a[1]); return [v, { total: tot, topo: ord.slice(0, 6).map(([k, n]) => `${k}:${n} (${Math.round((n / tot) * 100)}%)`), tipos: ord.length }]; }));
  const trig: Record<string, number> = {}; for (const r of sent) if (win(r, horas)) bump(trig, String(r.trigger));
  const cat = await db.execute<Row>(sql`SELECT DISTINCT m.id, m.vertical, m.name FROM master_products m JOIN affiliate_offers o ON o.master_product_id = m.id WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND ${eligibleOfferSql('o')} AND ${inAverageSql('o')} AND ${masterNoEscopoSql('m')}`);
  const c: Record<string, Record<string, number>> = {};
  for (const r of cat) { const v = String(r.vertical); const t = classificarTipo(v, String(r.name)); (c[v] ??= {})[t] = (c[v][t] ?? 0) + 1; }
  console.log(JSON.stringify({ horas, enviosNaJanela: [...byMaster.values()].reduce((a, b) => a + b.length, 0), mastersComRepeticao: mastersRep, enviosExtra, repPorLoja: repLoja, repPorParDeGatilhos: repPar, intervaloMedianoMin: med, intervaloMinMin: gaps[0] ?? null, enviosPorGatilho: trig, envios24hPorLojaTipo: top(dist(24)), envios7dPorLojaTipo: top(dist(168)), catalogoAtivoPorLojaTipo: top(c) }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

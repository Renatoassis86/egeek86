/**
 * Diagnóstico SOMENTE LEITURA: por que poucas TVs saem nas mensagens (ata 2026-11-12-regua-flexivel-min-max).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-tvs.ts
 * Avalia todo master de TV com oferta ativa pelo juízo puro (detectGroupCandidates, sem histórico de envio) e conta onde cada um para.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { detectGroupCandidates } from '../src/server/messaging/group-offers';
import { RULES } from '../src/lib/messaging/group-rules';

type Row = Record<string, unknown>;
const TV_RE = "(^|[^a-z0-9])(smart ?tv|televis[aã]o|tv)([^a-z0-9]|$)";
const NOT_TV = "(suporte|controle|cabo|antena|conversor|tv box|tvbox|stick|capa |rack|painel|fire tv|chromecast|projetor|jogo|game|ps5|xbox|switch)";
const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - RULES.DETECT_MAX_AGE_MIN * 60_000).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT m.id, m.name, m.vertical, m.attributes -> 'catalogGate' ->> 'verdict' AS gate,
           count(*) AS ativas, count(*) FILTER (WHERE o.last_price_confirmed_at >= ${since}::timestamptz) AS frescas,
           count(DISTINCT n.slug) AS redes, min(o.current_price_cents) AS menor
    FROM master_products m JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0
    LEFT JOIN affiliate_networks n ON n.id = o.network_id
    WHERE m.name ~* ${TV_RE} AND m.name !~* ${NOT_TV}
    GROUP BY m.id, m.name, m.vertical, 4`);
  const ms = rows.map((r) => ({ id: String(r.id), name: String(r.name), v: String(r.vertical), gate: (r.gate as string | null) ?? 'sem_gate', ativas: Number(r.ativas), frescas: Number(r.frescas), redes: Number(r.redes) }));
  const out: Record<string, any> = { masters_tv_com_oferta_ativa: ms.length, porLoja: {}, porGate: {}, comFresca: 0, redes1: 0 };
  for (const m of ms) { bump(out.porLoja, m.v); bump(out.porGate, m.gate); if (m.frescas > 0) out.comFresca++; if (m.redes <= 1) out.redes1++; }

  const verticals = [...new Set(ms.map((m) => m.v))];
  const cand: Record<string, any[]> = {}; const blk: Record<string, string[][]> = {};
  const ids = ms.filter((m) => m.frescas > 0).map((m) => m.id);
  for (let i = 0; i < ids.length; i += 100) {
    const r = await detectGroupCandidates({ now, verticals, productIds: ids.slice(i, i + 100), history: [], includePlatform: false, achado: true });
    for (const c of r.candidates) (cand[c.masterProductId] ??= []).push({ trigger: c.trigger, sendable: c.sendable, status: c.status, nsr: c.notSendableReason, reasons: c.reviewReasons, below: c.belowAvgPct });
    for (const b of r.blocked) (blk[b.masterProductId] ??= []).push(b.reasons);
  }
  const motivos: Record<string, number> = {}; let enviavel = 0, comCand = 0;
  for (const id of ids) {
    const cs = cand[id] ?? []; const bs = blk[id] ?? [];
    if (cs.length) comCand++;
    if (cs.some((c) => c.sendable && c.status === 'auto')) { enviavel++; continue; }
    for (const c of cs) bump(motivos, `candidato_nao_enviavel: ${c.nsr ?? (c.status !== 'auto' ? 'review:' + (c.reasons ?? []).join('+') : '?')}`.replace(/\d+(\.\d+)?/g, 'N'));
    if (!cs.length) for (const r of new Set(bs.map((x) => x.filter((y) => y !== 'mercado' && y !== 'amazon').join('+').replace(/\d+(\.\d+)?/g, 'N')))) bump(motivos, `bloqueado: ${r || 'sem_motivo'}`);
    if (!cs.length && !bs.length) bump(motivos, 'sem_gatilho');
  }
  out.avaliados_frescos = ids.length; out.com_candidato = comCand; out.enviavel_auto = enviavel; out.motivos = motivos;
  const sent = await db.execute<Row>(sql`
    SELECT m.vertical, count(*) FILTER (WHERE g.sent_at >= now() - interval '24 hours')::int AS d1, count(*) FILTER (WHERE g.sent_at >= now() - interval '7 days')::int AS d7, count(DISTINCT g.master_product_id)::int AS masters_7d
    FROM group_messages g JOIN master_products m ON m.id = g.master_product_id
    WHERE g.channel = 'tg' AND g.status = 'enviada' AND m.name ~* ${TV_RE} AND m.name !~* ${NOT_TV} GROUP BY 1`);
  out.enviadasTV = sent;
  const tot = await db.execute<Row>(sql`SELECT vertical, count(*)::int AS n FROM group_messages WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= now() - interval '24 hours' GROUP BY 1`);
  out.enviadas24hTodasLojas = tot;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

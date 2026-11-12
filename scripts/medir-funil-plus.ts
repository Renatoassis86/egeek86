/**
 * Mede o FUNIL REAL de envio ao Telegram das lojas Plus (ata 2026-11-12-diversidade-fluxo-plus). SOMENTE LEITURA.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/medir-funil-plus.ts [--json=saida.json]
 * Etapas por loja e por TIPO: masters com oferta ativa elegivel -> com oferta fresca -> no pool do pickProductIds -> com candidato
 * enviavel/auto -> motivos de bloqueio; mais mensagens enviadas nas ultimas 24 h e produtos/tipos distintos.
 */
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import { db } from '../src/lib/db';
import { eligibleOfferSql } from '../src/server/pricing/eligibility-sql';
import { inAverageSql } from '../src/server/queries/public-offers';
import { masterNoEscopoSql } from '../src/server/queries/escopo-vitrine';
import { detectGroupCandidates, pickProductIds } from '../src/server/messaging/group-offers';
import { RULES } from '../src/lib/messaging/group-rules';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';

type Row = Record<string, unknown>;
const ACHADO = !process.argv.includes('--sem-achado');
const PLUS = ['livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte', 'tecnologia', 'impressao3d'];
const txt = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };

async function main() {
  const now = new Date();
  const confirmedSince = new Date(now.getTime() - RULES.DETECT_MAX_AGE_MIN * 60_000).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT m.id, m.name, m.vertical,
           count(*) FILTER (WHERE true) AS ofertas_ativas,
           count(*) FILTER (WHERE o.last_price_confirmed_at >= ${confirmedSince}::timestamptz) AS ofertas_frescas,
           count(DISTINCT COALESCE(o.seller_id::text, o.id::text)) FILTER (WHERE o.last_price_confirmed_at >= ${confirmedSince}::timestamptz) AS vendedores_frescos
    FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id
    WHERE m.vertical IN (${txt(PLUS)}) AND o.vertical IN (${txt(PLUS)}) AND o.status = 'active' AND o.quarantined_at IS NULL
      AND o.current_price_cents > 0 AND ${eligibleOfferSql('o')} AND ${inAverageSql('o')} AND ${masterNoEscopoSql('m')}
    GROUP BY m.id, m.name, m.vertical
  `);
  const masters = rows.map((r) => ({ id: String(r.id), name: String(r.name), v: String(r.vertical), tipo: classificarTipo(String(r.vertical), String(r.name)), ativas: Number(r.ofertas_ativas), frescas: Number(r.ofertas_frescas), vend: Number(r.vendedores_frescos) }));
  const fresh = masters.filter((m) => m.frescas > 0);
  const freshIds = new Set(fresh.map((m) => m.id));

  const pool = new Set(await pickProductIds({ verticals: PLUS, now, maxAgeMin: RULES.DETECT_MAX_AGE_MIN, amazonMaxAgeMin: RULES.AMAZON_DETECT_MAX_AGE_MIN, eventWindowHours: 24, maxProducts: 900, achado: ACHADO }));

  // Avalia TODOS os masters frescos (ignora o pool), sem historico de envio: mede o juizo puro por produto.
  const cand: Record<string, { sendable: boolean; auto: boolean; trigger: string }[]> = {};
  const blk: Record<string, string[][]> = {};
  const ids = [...freshIds];
  for (let i = 0; i < ids.length; i += 150) {
    const r = await detectGroupCandidates({ now, verticals: PLUS, productIds: ids.slice(i, i + 150), history: [], includePlatform: false, achado: ACHADO });
    for (const c of r.candidates) (cand[c.masterProductId] ??= []).push({ sendable: c.sendable && c.status === 'auto' && !c.held, auto: c.status === 'auto', trigger: c.trigger });
    for (const b of r.blocked) (blk[b.masterProductId] ??= []).push(b.reasons);
  }

  const out: Record<string, any> = {};
  for (const m of masters) {
    const key = `${m.v}|${m.tipo}`;
    const e = (out[key] ??= { loja: m.v, tipo: m.tipo, aprovados_com_oferta: 0, frescos: 0, vend1: 0, vend2mais: 0, no_pool: 0, com_candidato: 0, enviavel_auto: 0, achado_ok: 0, bloqueados: 0, sem_gatilho: 0, motivos: {} as Record<string, number> });
    e.aprovados_com_oferta++;
    if (!freshIds.has(m.id)) continue;
    e.frescos++;
    if (m.vend <= 1) e.vend1++; else e.vend2mais++;
    if (pool.has(m.id)) e.no_pool++;
    const cs = cand[m.id] ?? [];
    const bs = blk[m.id] ?? [];
    if (cs.length) e.com_candidato++;
    if (cs.some((c) => c.sendable)) e.enviavel_auto++;
    if (cs.some((c) => c.trigger === 'AC' && c.sendable)) e.achado_ok++;
    else if (cs.length) for (const c of cs) bump(e.motivos, 'candidato_nao_enviavel(review/retido/regua)');
    if (bs.length && !cs.some((c) => c.sendable)) { e.bloqueados++; for (const r of new Set(bs.map((x) => x.filter((y) => y !== 'mercado' && y !== 'amazon').join('+').replace(/\d+/g, 'N')))) bump(e.motivos, r); }
    if (!cs.length && !bs.length) { e.sem_gatilho++; bump(e.motivos, m.vend <= 1 ? 'sem_gatilho(1 vendedor)' : 'sem_gatilho(sem movimento/media)'); }
  }

  const sent = await db.execute<Row>(sql`
    SELECT vertical, COALESCE(candidate ->> 'name', '') AS nome, master_product_id AS mid, trigger, count(*) AS n
    FROM group_messages WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= now() - interval '24 hours' AND vertical IN (${txt(PLUS)})
    GROUP BY 1, 2, 3, 4
  `);
  const nameById = new Map(masters.map((m) => [m.id, m]));
  const env: Record<string, { msgs: number; produtos: Set<string>; tipos: Record<string, number>; triggers: Record<string, number> }> = {};
  for (const r of sent) {
    const v = String(r.vertical);
    const e = (env[v] ??= { msgs: 0, produtos: new Set(), tipos: {}, triggers: {} });
    const n = Number(r.n);
    e.msgs += n; if (r.mid) e.produtos.add(String(r.mid));
    const t = nameById.get(String(r.mid))?.tipo ?? classificarTipo(v, String(r.nome));
    bump(e.tipos, t, n); bump(e.triggers, String(r.trigger), n);
  }
  const envOut = Object.fromEntries(Object.entries(env).map(([k, e]) => [k, { msgs: e.msgs, produtosDistintos: e.produtos.size, tiposDistintos: Object.keys(e.tipos).length, tipos: e.tipos, triggers: e.triggers }]));

  const porLoja: Record<string, any> = {};
  for (const e of Object.values(out)) {
    const l = (porLoja[e.loja] ??= { aprovados_com_oferta: 0, frescos: 0, vend1: 0, no_pool: 0, com_candidato: 0, enviavel_auto: 0, achado_ok: 0, sem_gatilho: 0, motivos: {} as Record<string, number> });
    for (const k of ['aprovados_com_oferta', 'frescos', 'vend1', 'no_pool', 'com_candidato', 'enviavel_auto', 'achado_ok', 'sem_gatilho']) l[k] += e[k];
    for (const [k, n] of Object.entries(e.motivos as Record<string, number>)) bump(l.motivos, k, n);
  }
  const res = { geradoEm: now.toISOString(), poolTotal: pool.size, porLoja, porTipo: Object.values(out), enviadas24h: envOut };
  const arg = process.argv.find((a) => a.startsWith('--json='));
  if (arg) fs.writeFileSync(arg.slice(7), JSON.stringify(res, null, 2));
  console.log(JSON.stringify({ poolTotal: res.poolTotal, porLoja, enviadas24h: envOut }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

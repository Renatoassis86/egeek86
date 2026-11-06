/**
 * REPROCESSAMENTO REVERSÍVEL dos eventos 'reconstructed' do menor preço (price_min_events): colapsa os eventos
 * transitórios gerados dentro de uma mesma varredura (regra em reconstructMinEvents, janela de agrupamento).
 * Toca SÓ em price_min_events com source = 'reconstructed'. NUNCA toca em source = 'live', nem em cotações/ofertas.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-eventos-minimo.ts                       # --dry-run (padrão): transação READ ONLY, nada é gravado
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-eventos-minimo.ts --apply               # grava (1 transação) + backup NDJSON + log JSON
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-eventos-minimo.ts --revert <log.json>   # dry-run da reversão
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-eventos-minimo.ts --revert <log.json> --apply
 *   opções: --window <ms>        janela do alvo (diff/CSV/apply). Padrão: RECON_BATCH_WINDOW_MS (2000)
 *           --windows 1000,2000,5000   janelas da tabela de sensibilidade do dry-run
 *           --csv <caminho>      CSV do diff (padrão docs/reprocessar-eventos-minimo-diff-<data>.csv)
 *           --report <caminho>   grava o relatório JSON do dry-run
 *           --product <uuid>     limita a um produto (teste)
 *
 * Como funciona: para cada produto com eventos 'reconstructed', recalcula os eventos com reconstructMinEvents (mesmo
 * código do backfill, mesmas ofertas elegíveis de HOJE) na janela alvo e compara com o gravado:
 *   removido = gravado que o alvo não tem; adicionado = alvo que não está gravado; alterado = mesmo (instante, valor)
 *   com prev_min_cents/oferta/qualidade diferentes. Controle (janela 0 = regra antiga) separa a DERIVA natural do
 *   recálculo (elegibilidade/status mudaram desde o backfill) do EFEITO do agrupamento.
 * Cadeia: prev_min_cents dos eventos reconstruídos é religado ao predecessor na cadeia mesclada (live + alvo). Eventos
 * live NUNCA são alterados; se um live ficar com prev apontando para valor removido, o dry-run informa (cadeiaLiveQuebrada).
 * Idempotente: 2ª execução do --apply não encontra diferença e não grava nada. Lock por produto com a mesma chave do
 * syncMinEvent (pme:<id>), então o gancho live não escreve no produto enquanto ele é reprocessado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql as dsql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { connect, csvCell, type Sql, type Tx } from './_dup-shared';
import { PRICE_DAILY_REGIME_START, RECON_BATCH_WINDOW_MS, collapseMinEventBatches, reconstructMinEvents, type MinEventDraft, type ReconOffer } from '../src/lib/pricing/daily-state';
import { eligibleOfferSql } from '../src/server/pricing/eligibility-sql';

const argv = process.argv;
const APPLY = argv.includes('--apply');
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const WINDOW = Number(arg('--window') ?? RECON_BATCH_WINDOW_MS);
const WINDOWS = (arg('--windows') ?? '1000,2000,5000').split(',').map(Number);
const ONLY_PRODUCT = arg('--product');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.resolve('backup/dados');
const CSV_PATH = path.resolve(arg('--csv') ?? `docs/reprocessar-eventos-minimo-diff-${stamp.slice(0, 10)}.csv`);
const FROM_AT = new Date(`${PRICE_DAILY_REGIME_START}T00:00:00-03:00`);
const CHUNK = 150;
/** Corte do escopo: instante do backfill (max created_at dos 'reconstructed'). Eventos do alvo depois dele NÃO são adicionados (o live é quem os cria). */
let CUTOFF = new Date(arg('--cutoff') ?? '9999-12-31T00:00:00Z');
const KNOWN_IDS = [13418, 19768, 12004, 12155, 15438];
const dialect = new PgDialect();

class DryRunRollback extends Error {}

interface Ev {
  id: number;
  at: Date;
  minCents: number;
  prev: number | null;
  offerId: string | null;
  networkId: string | null;
  sellerId: string | null;
  source: string;
  quality: string;
}
type Target = MinEventDraft & { prev: number | null };
type Row = Record<string, unknown>;

/** Executa uma consulta montada com o `sql` do drizzle no cliente postgres.js (mesmas queries do código de produção). */
async function run(tx: Tx | Sql, q: ReturnType<typeof dsql>): Promise<Row[]> {
  const { sql, params } = dialect.sqlToQuery(q);
  return (await (tx as Sql).unsafe(sql, params as never[])) as unknown as Row[];
}
const idList = (l: string[]) => dsql.join(l.map((i) => dsql`${i}`), dsql`, `);
const toEv = (r: Row): Ev => ({
  id: Number(r.id), at: new Date(r.at as string | Date), minCents: Number(r.min_cents), prev: r.prev_min_cents == null ? null : Number(r.prev_min_cents),
  offerId: (r.offer_id as string | null) ?? null, networkId: (r.network_id as string | null) ?? null, sellerId: (r.seller_id as string | null) ?? null,
  source: String(r.source), quality: String(r.quality),
});

/** Mesma consulta de loadReconOffers (src/server/pricing/price-daily.ts), lote de produtos. */
async function loadRecon(tx: Tx | Sql, pids: string[]): Promise<Map<string, ReconOffer[]>> {
  const out = new Map<string, ReconOffer[]>();
  if (!pids.length) return out;
  const rows = await run(tx, dsql`
    SELECT o.master_product_id, o.id AS offer_id, o.status = 'active' AS active, o.network_id, o.seller_id, s.collected_at, s.price_cents
    FROM affiliate_offers o
    INNER JOIN affiliate_price_snapshots s ON s.offer_id = o.id
    WHERE o.master_product_id IN (${idList(pids)}) AND ${eligibleOfferSql('o')}
      AND s.price_cents > 0 AND s.collected_at >= ${FROM_AT.toISOString()}::timestamptz - interval '48 hours'
    ORDER BY o.master_product_id, o.id, s.collected_at, s.id`);
  const by = new Map<string, ReconOffer>();
  for (const r of rows) {
    const oid = String(r.offer_id);
    let o = by.get(oid);
    if (!o) {
      o = { offerId: oid, networkId: (r.network_id as string | null) ?? null, sellerId: (r.seller_id as string | null) ?? null, active: r.active === true, snaps: [] };
      by.set(oid, o);
      const pid = String(r.master_product_id);
      const arr = out.get(pid) ?? [];
      arr.push(o);
      out.set(pid, arr);
    }
    o.snaps.push({ at: new Date(r.collected_at as string | Date), priceCents: Number(r.price_cents) });
  }
  return out;
}

async function loadStored(tx: Tx | Sql, pids: string[]): Promise<Map<string, Ev[]>> {
  const out = new Map<string, Ev[]>();
  if (!pids.length) return out;
  const rows = await run(tx, dsql`SELECT id, master_product_id, at, min_cents, prev_min_cents, offer_id, network_id, seller_id, source, quality
    FROM price_min_events WHERE master_product_id IN (${idList(pids)}) ORDER BY master_product_id, at, id`);
  for (const r of rows) {
    const pid = String(r.master_product_id);
    const a = out.get(pid) ?? [];
    a.push(toEv(r));
    out.set(pid, a);
  }
  return out;
}

const key = (at: Date, m: number) => `${at.getTime()}|${m}`;

/** Cadeia mesclada: live gravado (intacto) + alvo reconstruído. Ordena por instante; reconstruído antes de live no empate. */
function mergeChain(live: Ev[], target: MinEventDraft[]): Array<{ src: 'live' | 'recon'; ev: Ev | null; draft: MinEventDraft | null; at: number; min: number }> {
  const all = [
    ...live.map((e) => ({ src: 'live' as const, ev: e, draft: null, at: e.at.getTime(), min: e.minCents, o: 1, id: e.id })),
    ...target.map((d, i) => ({ src: 'recon' as const, ev: null, draft: d, at: d.at.getTime(), min: d.minCents, o: 0, id: i })),
  ];
  return all.sort((a, b) => a.at - b.at || a.o - b.o || a.id - b.id);
}

interface ProductDiff {
  pid: string;
  removed: Ev[];
  added: Target[];
  altered: Array<{ before: Ev; after: Target }>;
  kept: number;
  storedRecon: number;
  targetRecon: number;
  chainBeforeBroken: number;
  chainAfterBroken: number;
  liveDangling: number;
}

function diffRecompute(pid: string, stored: Ev[], offers: ReconOffer[], windowMs: number): ProductDiff {
  const recon = stored.filter((e) => e.source === 'reconstructed');
  const live = stored.filter((e) => e.source !== 'reconstructed');
  const draft = reconstructMinEvents(offers, FROM_AT, { windowMs }).filter((e) => e.at.getTime() <= CUTOFF.getTime());
  const merged = mergeChain(live, draft);
  // prev final dos eventos reconstruídos = mínimo do predecessor na cadeia mesclada
  const target: Target[] = [];
  merged.forEach((m, i) => {
    if (m.src === 'recon') target.push({ ...(m.draft as MinEventDraft), prev: i === 0 ? null : merged[i - 1].min });
  });
  const tMap = new Map(target.map((t) => [key(t.at, t.minCents), t]));
  const sMap = new Map(recon.map((s) => [key(s.at, s.minCents), s]));
  const removed = recon.filter((s) => !tMap.has(key(s.at, s.minCents)));
  const added = target.filter((t) => !sMap.has(key(t.at, t.minCents)));
  const altered: ProductDiff['altered'] = [];
  for (const s of recon) {
    const t = tMap.get(key(s.at, s.minCents));
    if (t && (t.prev !== s.prev || t.offerId !== s.offerId || (t.networkId ?? null) !== s.networkId || (t.sellerId ?? null) !== s.sellerId || t.quality !== s.quality)) altered.push({ before: s, after: t });
  }
  // integridade da cadeia (todos os eventos do produto, ordem at,id): prev == min do evento anterior
  const broken = (evs: Array<{ prev: number | null; min: number }>) => evs.reduce((n, e, i) => n + ((i === 0 ? null : evs[i - 1].min) !== e.prev ? 1 : 0), 0);
  const chainBefore = [...stored].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id).map((e) => ({ prev: e.prev, min: e.minCents }));
  const chainAfter = merged.map((m, i) => ({ prev: m.src === 'recon' ? (i === 0 ? null : merged[i - 1].min) : (m.ev as Ev).prev, min: m.min }));
  const liveDangling = merged.reduce((n, m, i) => n + (m.src === 'live' && (i === 0 ? null : merged[i - 1].min) !== (m.ev as Ev).prev ? 1 : 0), 0);
  return { pid, removed, added, altered, kept: recon.length - removed.length, storedRecon: recon.length, targetRecon: target.length, chainBeforeBroken: broken(chainBefore), chainAfterBroken: broken(chainAfter), liveDangling };
}

/**
 * PLANO (usado no --apply): subtração pura sobre os eventos 'reconstructed' GRAVADOS (collapseMinEventBatches).
 * Não recalcula nada a partir de ofertas/cotações de hoje, então não traz de volta o que reprocessamentos anteriores
 * apagaram (ex.: eventos dos placeholders da colisão de escrita) e não sofre deriva de elegibilidade.
 * Alvo = kept; prev_min_cents religado ao predecessor na cadeia mesclada (live intacto + mantidos).
 */
function diffCollapse(pid: string, stored: Ev[], windowMs: number): ProductDiff {
  const recon = stored.filter((e) => e.source === 'reconstructed').sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
  const live = stored.filter((e) => e.source !== 'reconstructed');
  const { kept, dropped } = collapseMinEventBatches(recon, windowMs);
  const merged = [...live.map((e) => ({ live: true, e })), ...kept.map((e) => ({ live: false, e }))].sort((a, b) => a.e.at.getTime() - b.e.at.getTime() || Number(a.live) - Number(b.live) || a.e.id - b.e.id);
  const altered: ProductDiff['altered'] = [];
  const after: Array<{ prev: number | null; min: number }> = [];
  let liveDangling = 0;
  merged.forEach((m, i) => {
    const expected = i === 0 ? null : merged[i - 1].e.minCents;
    if (m.live) {
      if (m.e.prev !== expected) liveDangling++;
      after.push({ prev: m.e.prev, min: m.e.minCents });
    } else {
      after.push({ prev: expected, min: m.e.minCents });
      if (m.e.prev !== expected) altered.push({ before: m.e, after: { at: m.e.at, minCents: m.e.minCents, prevMinCents: expected, prev: expected, offerId: m.e.offerId as string, networkId: m.e.networkId, sellerId: m.e.sellerId, quality: m.e.quality as 'complete' | 'partial' } });
    }
  });
  const broken = (evs: Array<{ prev: number | null; min: number }>) => evs.reduce((n, e, i) => n + ((i === 0 ? null : evs[i - 1].min) !== e.prev ? 1 : 0), 0);
  const before = [...stored].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id).map((e) => ({ prev: e.prev, min: e.minCents }));
  return { pid, removed: dropped, added: [], altered, kept: kept.length, storedRecon: recon.length, targetRecon: kept.length, chainBeforeBroken: broken(before), chainAfterBroken: broken(after), liveDangling };
}

const money = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));

async function resolveCutoff(tx: Tx | Sql) {
  if (arg('--cutoff')) return;
  const r = await tx`SELECT max(created_at) AS c FROM price_min_events WHERE source = 'reconstructed'`;
  if (r[0]?.c) CUTOFF = new Date(r[0].c as string | Date);
}

async function loadProducts(tx: Tx | Sql): Promise<string[]> {
  if (ONLY_PRODUCT) return [ONLY_PRODUCT];
  const r = await tx`SELECT DISTINCT master_product_id::text AS id FROM price_min_events WHERE source = 'reconstructed' ORDER BY 1`;
  return r.map((x) => String(x.id));
}

// ----------------------------------------------------------------------------------------------------------
// DRY-RUN
// ----------------------------------------------------------------------------------------------------------
async function dryRun(sql: Sql) {
  const t0 = Date.now();
  const windows = [...new Set([...WINDOWS, WINDOW])].sort((a, b) => a - b);
  const report: Record<string, any> = { mode: 'dry-run', at: new Date().toISOString(), windowAlvo: WINDOW, transacao: 'REPEATABLE READ READ ONLY' };
  const sens: Record<number, { removidos: number; adicionados: number; alterados: number; produtosAfetados: number; storedRecon: number; targetRecon: number; chainBroken: number; liveDangling: number }> = {};
  for (const w of windows) sens[w] = { removidos: 0, adicionados: 0, alterados: 0, produtosAfetados: 0, storedRecon: 0, targetRecon: 0, chainBroken: 0, liveDangling: 0 };
  const targetDiffs: ProductDiff[] = [];
  const storedAll = new Map<string, Ev[]>();
  const ctl: Record<number, { removidos: number; adicionados: number; alterados: number; alvo: number }> = { 0: { removidos: 0, adicionados: 0, alterados: 0, alvo: 0 }, [WINDOW]: { removidos: 0, adicionados: 0, alterados: 0, alvo: 0 } };
  const agree = { droppedByCollapse: 0, alsoAbsentFromRecompute: 0 };
  const byWindowProducts: Record<number, ProductDiff[]> = {};
  for (const w of windows) byWindowProducts[w] = [];

  await sql.begin('isolation level repeatable read read only', async (tx) => {
    await tx`SET LOCAL statement_timeout = '300s'`;
    await resolveCutoff(tx);
    report.corteDoEscopo = CUTOFF.toISOString();
    const pids = await loadProducts(tx);
    report.produtosComEventosReconstruidos = pids.length;
    const stats = await tx`SELECT source, count(*)::int AS n, count(DISTINCT master_product_id)::int AS p FROM price_min_events GROUP BY 1 ORDER BY 1`;
    report.eventosPorOrigem = Object.fromEntries(stats.map((s) => [String(s.source), { eventos: Number(s.n), produtos: Number(s.p) }]));
    for (let i = 0; i < pids.length; i += CHUNK) {
      const chunk = pids.slice(i, i + CHUNK);
      const stored = await loadStored(tx, chunk);
      const recon = await loadRecon(tx, chunk);
      for (const pid of chunk) {
        const st = stored.get(pid) ?? [];
        storedAll.set(pid, st);
        for (const cw of [0, WINDOW]) {
          const c = diffRecompute(pid, st, recon.get(pid) ?? [], cw);
          const x = ctl[cw];
          x.removidos += c.removed.length; x.adicionados += c.added.length; x.alterados += c.altered.length; x.alvo += c.targetRecon;
          if (cw === WINDOW) {
            const absent = new Set(c.removed.map((e) => e.id));
            const dd = diffCollapse(pid, st, WINDOW);
            agree.droppedByCollapse += dd.removed.length;
            agree.alsoAbsentFromRecompute += dd.removed.filter((e) => absent.has(e.id)).length;
          }
        }
        for (const w of windows.filter((w) => w > 0)) {
          const d = diffCollapse(pid, st, w);
          const s = sens[w];
          s.removidos += d.removed.length; s.adicionados += d.added.length; s.alterados += d.altered.length;
          s.storedRecon += d.storedRecon; s.targetRecon += d.targetRecon; s.chainBroken += d.chainAfterBroken; s.liveDangling += d.liveDangling;
          if (d.removed.length || d.added.length || d.altered.length) { s.produtosAfetados++; byWindowProducts[w].push(d); }
          if (w === WINDOW) targetDiffs.push(d);
        }
      }
      process.stderr.write(`  ${Math.min(i + CHUNK, pids.length)}/${pids.length} produtos\r`);
    }
    // sanidade: a transação é READ ONLY; nada a desfazer, mas encerra explicitamente
    throw new DryRunRollback();
  }).catch((e) => { if (!(e instanceof DryRunRollback)) throw e; });
  process.stderr.write('\n');

  // ---- sensibilidade por janela (janela 0 = regra antiga = controle de deriva) ----
  report.metodo = 'PLANO = subtração pura sobre os eventos gravados (collapseMinEventBatches): só remove e religa prev_min_cents; nada é recalculado nem criado.';
  report.sensibilidadePorJanela = Object.fromEntries(windows.map((w) => [`${w} ms`, { ...sens[w], adicionados: undefined }]));
  report.controleRecalculo = {
    nota: 'Controle informativo (NÃO usado no apply): recalcula os eventos com as ofertas elegíveis de HOJE e compara com o gravado. Janela 0 = regra antiga: a diferença é DERIVA (elegibilidade/status/reprocessamentos desde o backfill), e incluiria de volta eventos dos placeholders já reprocessados.',
    janela0_regraAntiga: ctl[0],
    [`janela${WINDOW}`]: ctl[WINDOW],
    concordanciaColapsoVsRecalculo: { removidosPeloColapso: agree.droppedByCollapse, tambemAusentesNoRecalculo: agree.alsoAbsentFromRecompute, pct: agree.droppedByCollapse ? Math.round((agree.alsoAbsentFromRecompute / agree.droppedByCollapse) * 1000) / 10 : null },
  };

  // ---- por produto (janela alvo) ----
  const affected = targetDiffs.filter((d) => d.removed.length || d.added.length || d.altered.length);
  report.porProdutoJanelaAlvo = {
    produtosAfetados: affected.length,
    top15PorRemovidos: [...affected].sort((a, b) => b.removed.length - a.removed.length).slice(0, 15).map((d) => ({ produto: d.pid, gravados: d.storedRecon, removidos: d.removed.length, adicionados: d.added.length, alterados: d.altered.length, alvo: d.targetRecon })),
    distribuicaoRemovidosPorProduto: histogram(affected.map((d) => d.removed.length)),
  };
  // ---- integridade da cadeia ----
  report.cadeiaPrevMinCents = {
    janelaAlvo: WINDOW,
    quebradosAntes: targetDiffs.reduce((n, d) => n + d.chainBeforeBroken, 0),
    quebradosDepoisSimulado: targetDiffs.reduce((n, d) => n + d.chainAfterBroken, 0),
    produtosComCadeiaQuebradaDepois: targetDiffs.filter((d) => d.chainAfterBroken > 0).map((d) => d.pid),
    eventosLiveComPrevDanglingDepois: targetDiffs.reduce((n, d) => n + d.liveDangling, 0),
  };
  // ---- ids conhecidos ----
  const known: Record<string, string> = {};
  for (const id of KNOWN_IDS) {
    let where = 'nao encontrado';
    for (const d of targetDiffs) {
      if (d.removed.some((e) => e.id === id)) where = `removido (produto ${d.pid.slice(0, 8)})`;
      else if (d.altered.some((a) => a.before.id === id)) where = `alterado (produto ${d.pid.slice(0, 8)})`;
      else if ([...(storedAll.get(d.pid) ?? [])].some((e) => e.id === id)) where = `mantido (produto ${d.pid.slice(0, 8)})`;
    }
    if (where === 'nao encontrado') for (const [pid, st] of storedAll) if (st.some((e) => e.id === id)) where = `mantido (produto ${pid.slice(0, 8)})`;
    known[String(id)] = where;
  }
  report.idsInvestigados = known;

  // ---- CSV + amostra ----
  const rows: string[][] = [];
  const header = ['produto', 'janela_ms', 'acao', 'event_id', 'at_antes', 'min_antes', 'prev_antes', 'offer_antes', 'at_depois', 'min_depois', 'prev_depois', 'offer_depois', 'motivo'];
  const diffRows: Array<{ pid: string; acao: string; before: Ev | null; after: Target | null; motivo: string }> = [];
  for (const d of targetDiffs) {
    const st = storedAll.get(d.pid) ?? [];
    const removedIds = new Set(d.removed.map((x) => x.id));
    const recon = st.filter((x) => x.source === 'reconstructed').sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
    for (const e of d.removed) {
      // evento que fica no lote: o primeiro mantido depois dele dentro da janela; sem ele, o lote inteiro foi descartado (valor final = anterior mantido)
      const k = recon.find((x) => !removedIds.has(x.id) && x.at.getTime() >= e.at.getTime() && x.at.getTime() - e.at.getTime() <= WINDOW && x.id !== e.id);
      diffRows.push({ pid: d.pid, acao: 'remover', before: e, after: null, motivo: k ? `transitorio: substituido em ${k.at.getTime() - e.at.getTime()} ms pelo estado final #${k.id} (${money(k.minCents)})` : 'lote descartado: o minimo voltou ao valor do evento mantido anterior' });
    }
    for (const a of d.added) diffRows.push({ pid: d.pid, acao: 'adicionar', before: null, after: a, motivo: 'estado final do lote em instante diferente do gravado' });
    for (const a of d.altered) {
      const why = [a.before.prev !== a.after.prev ? 'prev_min_cents religado' : '', a.before.offerId !== a.after.offerId ? 'oferta' : '', a.before.quality !== a.after.quality ? 'qualidade' : ''].filter(Boolean).join('+');
      diffRows.push({ pid: d.pid, acao: 'alterar', before: a.before, after: a.after, motivo: why || 'rede/vendedor' });
    }
  }
  for (const r of diffRows) {
    rows.push([r.pid, String(WINDOW), r.acao, String(r.before?.id ?? ''), r.before?.at.toISOString() ?? '', money(r.before?.minCents ?? null), money(r.before?.prev ?? null), r.before?.offerId ?? '',
      r.after?.at.toISOString() ?? '', money(r.after?.minCents ?? null), money(r.after?.prev ?? null), r.after?.offerId ?? '', r.motivo]);
  }
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n') + '\n');
  report.csv = { arquivo: CSV_PATH, linhas: rows.length };
  const step = Math.max(1, Math.floor(diffRows.length / 20));
  report.amostra20 = diffRows.filter((_, i) => i % step === 0).slice(0, 20).map((r) => ({
    produto: r.pid.slice(0, 8), acao: r.acao, antes: r.before ? `#${r.before.id} ${r.before.at.toISOString()} ${money(r.before.minCents)} (prev ${money(r.before.prev)})` : '-',
    depois: r.after ? `${r.after.at.toISOString()} ${money(r.after.minCents)} (prev ${money(r.after.prev)})` : '(removido)', motivo: r.motivo,
  }));
  report.contagensJanelaAlvo = { removidos: sens[WINDOW].removidos, adicionados: sens[WINDOW].adicionados, alterados: sens[WINDOW].alterados };
    report.elapsedMs = Date.now() - t0;
  if (arg('--report')) fs.writeFileSync(path.resolve(arg('--report') as string), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

function histogram(v: number[]): Record<string, number> {
  const b: Record<string, number> = { '1': 0, '2-3': 0, '4-9': 0, '10-49': 0, '50+': 0 };
  for (const n of v) {
    if (n < 1) continue;
    b[n === 1 ? '1' : n <= 3 ? '2-3' : n <= 9 ? '4-9' : n <= 49 ? '10-49' : '50+']++;
  }
  return b;
}

// ----------------------------------------------------------------------------------------------------------
// APPLY
// ----------------------------------------------------------------------------------------------------------
async function apply(sql: Sql) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const started = new Date();
  const log: Record<string, any> = { status: 'pending', stamp, appliedAt: started.toISOString(), windowMs: WINDOW, regimeStart: PRICE_DAILY_REGIME_START, products: [] as string[], removedIds: [] as number[], insertedKeys: [] as Array<{ pid: string; at: string; min: number }>, alteredIds: [] as number[], files: {} };
  const bkRows: unknown[] = [];
  let removed = 0, added = 0, altered = 0;
  await sql.begin(async (tx) => {
    await tx`SET LOCAL statement_timeout = '300s'`;
    const pids = await loadProducts(tx);
    for (let i = 0; i < pids.length; i += CHUNK) {
      const chunk = pids.slice(i, i + CHUNK);
      for (const pid of chunk) await tx`SELECT pg_advisory_xact_lock(hashtext(${'pme:' + pid}))`; // bloqueia o gancho live nestes produtos
      const stored = await loadStored(tx, chunk); // leitura APÓS o lock: estado atual
      for (const pid of chunk) {
        const st = stored.get(pid) ?? [];
        const d = diffCollapse(pid, st, WINDOW);
        if (!d.removed.length && !d.added.length && !d.altered.length) continue;
        if (d.liveDangling > 0) throw new Error(`Produto ${pid}: ${d.liveDangling} evento(s) live ficariam com prev_min_cents apontando para valor removido; abortado (live não é tocado).`);
        log.products.push(pid);
        // backup integral dos eventos reconstruídos do produto (para reversão), lido antes de escrever
        const bk = await tx`SELECT to_jsonb(t) AS j FROM price_min_events t WHERE master_product_id = ${pid} AND source = 'reconstructed' ORDER BY at, id`;
        bkRows.push(...bk.map((r) => r.j));
        if (d.removed.length) {
          const ids = d.removed.map((e) => e.id);
          const r = await tx`DELETE FROM price_min_events WHERE id = ANY(${ids}::bigint[]) AND source = 'reconstructed' AND master_product_id = ${pid}`;
          if (r.count !== ids.length) throw new Error(`Produto ${pid}: esperava apagar ${ids.length}, apagou ${r.count}.`);
          removed += r.count; log.removedIds.push(...ids);
        }
        for (const a of d.altered) {
          const r = await tx`UPDATE price_min_events SET prev_min_cents = ${a.after.prev}, offer_id = ${a.after.offerId}, network_id = ${a.after.networkId}, seller_id = ${a.after.sellerId}, quality = ${a.after.quality}
            WHERE id = ${a.before.id} AND source = 'reconstructed'`;
          if (r.count !== 1) throw new Error(`Evento ${a.before.id}: UPDATE não casou.`);
          altered++; log.alteredIds.push(a.before.id);
        }
        for (const t of d.added) {
          const r = await tx`INSERT INTO price_min_events (master_product_id, at, min_cents, prev_min_cents, offer_id, network_id, seller_id, source, quality)
            VALUES (${pid}::uuid, ${t.at.toISOString()}::timestamptz, ${t.minCents}, ${t.prev}, ${t.offerId}::uuid, ${t.networkId}::uuid, ${t.sellerId}::uuid, 'reconstructed', ${t.quality})
            ON CONFLICT (master_product_id, at, min_cents, source) DO NOTHING`;
          if (r.count !== 1) throw new Error(`Produto ${pid}: INSERT de ${t.at.toISOString()} não gravou.`);
          added++; log.insertedKeys.push({ pid, at: t.at.toISOString(), min: t.minCents });
        }
        // verificação pós-escrita do produto: cadeia mesclada íntegra e live intacto
        const after = await loadStored(tx, [pid]);
        const evs = after.get(pid) ?? [];
        const bad = evs.reduce((n, e, k) => n + ((k === 0 ? null : evs[k - 1].minCents) !== e.prev ? 1 : 0), 0);
        const liveBefore = st.filter((e) => e.source !== 'reconstructed').map((e) => `${e.id}|${e.at.getTime()}|${e.minCents}|${e.prev}`).join();
        const liveAfter = evs.filter((e) => e.source !== 'reconstructed').map((e) => `${e.id}|${e.at.getTime()}|${e.minCents}|${e.prev}`).join();
        if (liveBefore !== liveAfter) throw new Error(`Produto ${pid}: eventos live mudaram; abortado.`);
        if (bad > d.chainBeforeBroken) throw new Error(`Produto ${pid}: cadeia piorou (${d.chainBeforeBroken} -> ${bad}); abortado.`);
      }
    }
    if (!removed && !added && !altered) return; // idempotente: nada a gravar, nada a fazer
    log.files = { price_min_events: path.join(BACKUP_DIR, `reprocessar-eventos-minimo-${stamp}-price_min_events.ndjson`) };
    fs.writeFileSync(log.files.price_min_events, bkRows.map((r) => JSON.stringify(r)).join('\n') + '\n'); // backup gravado ANTES do commit
  });
  Object.assign(log, { status: removed || added || altered ? 'committed' : 'noop', removed, added, altered, productsAffected: log.products.length });
  const lf = path.join(BACKUP_DIR, `reprocessar-eventos-minimo-log-${stamp}.json`);
  if (log.status === 'committed') fs.writeFileSync(lf, JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ status: log.status, removed, added, altered, produtos: log.products.length, backup: log.files.price_min_events ?? null, log: log.status === 'committed' ? lf : null }, null, 2));
}

// ----------------------------------------------------------------------------------------------------------
// REVERT
// ----------------------------------------------------------------------------------------------------------
async function revert(sql: Sql, file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<string, any>;
  if (log.status !== 'committed') throw new Error('Log sem status committed: nada a reverter.');
  const bk = fs.readFileSync(path.resolve(log.files.price_min_events), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const pids: string[] = log.products;
  const out: Record<string, unknown> = { mode: APPLY ? 'revert-apply' : 'revert-dry-run', produtos: pids.length, eventosNoBackup: bk.length };
  await sql.begin(async (tx) => {
    await tx`SET LOCAL statement_timeout = '300s'`;
    for (const pid of pids) await tx`SELECT pg_advisory_xact_lock(hashtext(${'pme:' + pid}))`;
    const del = await tx`DELETE FROM price_min_events WHERE master_product_id = ANY(${pids}::uuid[]) AND source = 'reconstructed'`;
    out.apagadosAntesDeRestaurar = del.count;
    if (bk.length) await tx`INSERT INTO price_min_events OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::price_min_events, ${JSON.stringify(bk)}::jsonb)`;
    const now = await tx`SELECT to_jsonb(t) AS j FROM price_min_events t WHERE master_product_id = ANY(${pids}::uuid[]) AND source = 'reconstructed' ORDER BY at, id`;
    const a = now.map((r) => JSON.stringify(r.j)).sort();
    const b = bk.map((r) => JSON.stringify(r)).sort();
    out.verificacao = a.length === b.length && a.every((v, i) => v === b[i]) ? 'identico ao backup' : `DIFERENTE (${a.length} no banco, ${b.length} no backup)`;
    if (out.verificacao !== 'identico ao backup') throw new Error(`Reversão não reproduz o backup: ${out.verificacao}`);
    if (!APPLY) throw new DryRunRollback();
  }).catch((e) => {
    if (!(e instanceof DryRunRollback)) throw e;
    out.nota = 'DRY-RUN da reversão: transação DESFEITA. Use --apply para reverter de fato.';
  });
  console.log(JSON.stringify(out, null, 2));
}

async function main() {
  const sql = connect();
  try {
    const ri = argv.indexOf('--revert');
    if (ri >= 0) await revert(sql, argv[ri + 1]);
    else if (APPLY) await apply(sql);
    else await dryRun(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});

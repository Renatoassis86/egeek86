/**
 * REPROCESSAMENTO REVERSÍVEL: tira as ofertas em rascunho (affiliate_offers.status = 'draft') do histórico diário
 * (dias >= 2026-10-31) dos produtos cujo price_daily_state.members as contém. Autorização do dono: 2026-11-05
 * (rascunho não entra em média/mediana oferta-dia; eligibleOfferSql já exclui draft).
 * Escreve SÓ em price_daily_offer, price_daily_state e price_min_events (derivadas). NUNCA toca em
 * affiliate_price_snapshots nem affiliate_offers. Sem migration.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-draft-offers.ts                       # dry-run (padrão): calcula numa transação e DESFAZ
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-draft-offers.ts --apply               # grava + backup NDJSON + log
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-draft-offers.ts --revert <log.json>   # dry-run da reversão
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-draft-offers.ts --revert <log.json> --apply
 *   opção: --from 2026-10-31   primeiro dia reprocessado
 *
 * REGRA: nada é inventado.
 *  - price_daily_offer: apaga as linhas das ofertas draft dos produtos afetados (dias >= from);
 *  - price_daily_state: recalcula pelo código existente (computeStatesForBatch, elegibilidade nova) e regrava, INCLUSIVE
 *    dias já closed (mantém closed), só os dias em que a linha guardada continha draft ou que sofrem a cascata do casamento
 *    com o dia anterior (matched_*); dia sem oferta elegível restante => linha removida (lacuna), como o job faz;
 *  - price_min_events: apaga os eventos cujo offer_id é draft (o mínimo veio de rascunho) e religa prev_min_cents à cadeia
 *    restante do produto (derivado). NÃO se reconstrói evento novo; o gancho/job emite o próximo mínimo real.
 * Idempotente. O job refresh-price-daily reagrega dia corrente/a fechar com a elegibilidade nova (não recria contaminação).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { computePeriodMetrics, spDay } from '@/lib/pricing/daily-state';
import { computeStatesForBatch, upsertStates } from '@/server/pricing/price-daily';

type Tx = Pick<typeof db, 'execute'>;
type Row = Record<string, unknown>;

const argv = process.argv;
const APPLY = argv.includes('--apply');
const arg = (name: string) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
const FROM = arg('--from') ?? '2026-10-31';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.resolve('backup/dados');

class DryRunRollback extends Error {}
const lit = (list: string[]) => sql.join(list.map((i) => sql`${i}`), sql`, `);
const textArr = (list: string[]) => sql`ARRAY[${lit(list)}]::text[]`;
const cnt = (r: unknown) => Number((r as { count?: number }).count ?? 0);
const money = (c: unknown) => (c == null ? '-' : (Number(c) / 100).toFixed(2));

async function jsonRows(tx: Tx, table: string, where: ReturnType<typeof sql>): Promise<unknown[]> {
  const r = await tx.execute<{ j: unknown }>(sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(table)} t WHERE ${where} ORDER BY to_jsonb(t)::text`);
  return r.map((x) => x.j);
}
function writeNdjson(table: string, rows: unknown[]): string {
  const f = path.join(BACKUP_DIR, `reprocess-draft-${stamp}-${table}.ndjson`);
  fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  return f;
}

/** Impressão digital (count/soma/hash) das cotações e das ofertas dos produtos: prova de que nada disso mudou. */
async function fingerprint(tx: Tx, pids: string[], before: Date) {
  const s = await tx.execute<Row>(sql`
    SELECT count(*)::int n, COALESCE(sum(s.price_cents), 0)::text sp, COALESCE(md5(string_agg(s.id::text || ':' || s.price_cents::text || ':' || s.collected_at::text, ',' ORDER BY s.id)), '') h
    FROM affiliate_price_snapshots s JOIN affiliate_offers o ON o.id = s.offer_id WHERE o.master_product_id IN (${lit(pids)}) AND s.collected_at < ${before.toISOString()}::timestamptz`);
  const o = await tx.execute<Row>(sql`
    SELECT count(*)::int n, COALESCE(md5(string_agg(to_jsonb(o)::text, ',' ORDER BY o.id)), '') h FROM affiliate_offers o WHERE o.master_product_id IN (${lit(pids)})`);
  return { snapshots: { n: Number(s[0].n), sumPriceCents: String(s[0].sp), hash: String(s[0].h) }, offers: { n: Number(o[0].n), hash: String(o[0].h) } };
}

interface StateSnap { day: string; avg: number | null; med: number | null; min: number | null; n: number; quality: string; closed: boolean; hasDraft: boolean }
const members = (v: unknown) => ((typeof v === 'string' ? JSON.parse(v) : v) ?? {}) as Record<string, number>;
async function loadSnaps(tx: Tx, pid: string, draftSet: Set<string>) {
  const r = await tx.execute<Row>(sql`SELECT day::text AS day, avg_cents, median_offer_day_cents, min_cents, n_offers, quality, closed, members FROM price_daily_state
    WHERE master_product_id = ${pid} AND day >= ${FROM}::date AND quality <> 'legacy' ORDER BY day`);
  const mem = new Map<string, Record<string, number>>();
  const snaps: StateSnap[] = r.map((x) => {
    const m = members(x.members);
    mem.set(String(x.day), m);
    return { day: String(x.day), avg: x.avg_cents == null ? null : Number(x.avg_cents), med: x.median_offer_day_cents == null ? null : Number(x.median_offer_day_cents), min: x.min_cents == null ? null : Number(x.min_cents), n: Number(x.n_offers), quality: String(x.quality), closed: x.closed === true, hasDraft: Object.keys(m).some((k) => draftSet.has(k)) };
  });
  return { snaps, mem };
}
function periodOf(mem: Map<string, Record<string, number>>, snaps: StateSnap[]) {
  const days = snaps.filter((s) => s.quality === 'complete' || s.quality === 'partial').map((s) => ({ day: s.day, members: mem.get(s.day) ?? {}, minCents: s.min }));
  const m = computePeriodMetrics(days, null);
  return { offerDays: m.offerDays, distinctOffers: m.distinctOffers, avgOfferDay: m.avgOfferDayCents == null ? null : Math.round(m.avgOfferDayCents), medianOfferDay: m.medianOfferDayCents };
}

async function main() {
  const ri = argv.indexOf('--revert');
  if (ri >= 0) return revert(argv[ri + 1]);
  const now = new Date();
  const today = spDay(now);
  const report: Record<string, unknown> = { mode: APPLY ? 'apply' : 'dry-run', at: now.toISOString(), from: FROM, today };
  const log: Record<string, unknown> = { ...report, status: 'pending', stamp, files: {} };
  const started = Date.now();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      // ---------- 0) Escopo ----------
      const dr = await tx.execute<Row>(sql`SELECT id::text AS id FROM affiliate_offers WHERE status = 'draft'`);
      const draftIds = dr.map((r) => String(r.id));
      report.draftOffers = draftIds.length;
      if (!draftIds.length) { console.log('Nenhuma oferta draft: nada a fazer.'); return; }
      const draftSet = new Set(draftIds);
      const arr = textArr(draftIds);
      const pm = await tx.execute<Row>(sql`SELECT DISTINCT master_product_id::text AS p FROM price_daily_state WHERE day >= ${FROM}::date AND quality <> 'legacy' AND members ?| ${arr}`);
      const pe = await tx.execute<Row>(sql`SELECT DISTINCT master_product_id::text AS p FROM price_min_events WHERE offer_id::text = ANY(${arr})`);
      const products = [...new Set([...pm.map((r) => String(r.p)), ...pe.map((r) => String(r.p))])].sort();
      report.produtosPorMembers = pm.length;
      report.produtosAfetados = products.length;
      if (!products.length) { console.log('Nenhum produto afetado.'); return; }
      const pids = sql`master_product_id IN (${lit(products)})`;
      const fpBefore = await fingerprint(tx, products, now);
      report.fingerprintAntes = fpBefore;

      // ---------- 1) Estado ANTES + backup (antes de qualquer escrita) ----------
      const before = new Map<string, Awaited<ReturnType<typeof loadSnaps>>>();
      for (const pid of products) before.set(pid, await loadSnaps(tx, pid, draftSet));
      const draftOfProducts = (await tx.execute<Row>(sql`SELECT id::text AS id FROM affiliate_offers WHERE status = 'draft' AND ${pids}`)).map((r) => String(r.id));
      const offerWhere = draftOfProducts.length ? sql`offer_id::text = ANY(${textArr(draftOfProducts)}) AND day >= ${FROM}::date` : sql`false`;
      const bkOffer = await jsonRows(tx, 'price_daily_offer', offerWhere);
      const bkState = await jsonRows(tx, 'price_daily_state', sql`${pids} AND day >= ${FROM}::date AND quality <> 'legacy'`);
      const bkEvents = await jsonRows(tx, 'price_min_events', pids);
      report.backupRows = { price_daily_offer: bkOffer.length, price_daily_state: bkState.length, price_min_events: bkEvents.length };

      // ---------- 2) price_daily_offer: apaga as linhas das ofertas draft ----------
      report.ofertaDiaApagadas = draftOfProducts.length ? cnt(await tx.execute(sql`DELETE FROM price_daily_offer WHERE ${offerWhere}`)) : 0;

      // ---------- 3) price_daily_state ----------
      type K = { avgCents: number | null; medianCents: number | null; minCents: number | null; minOfferId: string | null; maxCents: number | null; nOffers: number; quality: string; members: Record<string, number>; matchedOffers: number | null; matchedChangePct: number | null; compositionFlag: boolean | null };
      const rowKey = (r: K) => JSON.stringify([r.avgCents, r.medianCents, r.minCents, r.minOfferId, r.maxCents, r.nOffers, r.quality, Object.entries(r.members).sort(), r.matchedOffers, r.matchedChangePct, r.compositionFlag]);
      const num = (v: unknown) => (v == null ? null : Number(v));
      const prodReport: unknown[] = [];
      let totalWritten = 0;
      for (const pid of products) {
        const b = before.get(pid)!;
        const { rows: A } = await computeStatesForBatch(tx, [pid], FROM, today, now);
        const aBy = new Map(A.map((r) => [r.day, r]));
        const bBy = new Map(b.snaps.map((s) => [s.day, s]));
        const stored = await tx.execute<Row>(sql`SELECT day::text AS day, min_cents, min_offer_id::text AS min_offer_id, max_cents, avg_cents, median_offer_day_cents, n_offers, quality, matched_offers, matched_change_pct, composition_flag, members FROM price_daily_state WHERE master_product_id = ${pid} AND day >= ${FROM}::date AND quality <> 'legacy'`);
        const sKey = new Map(stored.map((x) => [String(x.day), rowKey({ avgCents: num(x.avg_cents), medianCents: num(x.median_offer_day_cents), minCents: num(x.min_cents), minOfferId: (x.min_offer_id as string | null) ?? null, maxCents: num(x.max_cents), nOffers: Number(x.n_offers), quality: String(x.quality), members: members(x.members), matchedOffers: num(x.matched_offers), matchedChangePct: num(x.matched_change_pct), compositionFlag: (x.composition_flag as boolean | null) ?? null })]));
        const days = [...new Set([...aBy.keys(), ...bBy.keys()])].sort();
        const rewrite: string[] = [];
        const driftIgnored: string[] = [];
        let cascade = false;
        for (const d of days) {
          const a = aBy.get(d), s = bBy.get(d);
          const differs = !a || !s || rowKey(a) !== sKey.get(d);
          if (differs && (s?.hasDraft || cascade)) { rewrite.push(d); cascade = true; }
          else { if (differs) driftIgnored.push(d); cascade = false; }
        }
        let written = 0;
        for (const d of rewrite) {
          await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id = ${pid} AND day = ${d}::date AND quality <> 'legacy'`);
          const a = aBy.get(d);
          if (a) written += await upsertStates(tx, [a]);
        }
        totalWritten += written;
        const after = await loadSnaps(tx, pid, draftSet);
        prodReport.push({
          product: pid, linhasAntes: b.snaps.length, linhasDepois: after.snaps.length, diasRegravados: rewrite, diasComDiferencaNaoRegravados: driftIgnored,
          periodoAntes: periodOf(b.mem, b.snaps), periodoDepois: periodOf(after.mem, after.snaps),
          dias: rewrite.map((d) => { const x = bBy.get(d); const y = after.snaps.find((z) => z.day === d); return {
            dia: d, closed: `${x?.closed ?? '-'} -> ${y?.closed ?? '-'}`, n_offers: `${x?.n ?? '-'} -> ${y?.n ?? '-'}`, media: `${money(x?.avg)} -> ${money(y?.avg)}`,
            mediana: `${money(x?.med)} -> ${money(y?.med)}`, minimo: `${money(x?.min)} -> ${money(y?.min)}`, qualidade: `${x?.quality ?? '-'} -> ${y?.quality ?? '-'}`,
          }; }),
        });
      }
      report.linhasEstadoRegravadas = totalWritten;
      report.produtos = prodReport;

      // ---------- 4) Eventos: apaga os de oferta draft e religa a cadeia ----------
      const evReport: unknown[] = [];
      let evDel = 0, evFix = 0;
      for (const pid of products) {
        const del = cnt(await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id = ${pid} AND offer_id::text = ANY(${arr})`));
        const rest = await tx.execute<Row>(sql`SELECT id, min_cents, prev_min_cents FROM price_min_events WHERE master_product_id = ${pid} ORDER BY at, id`);
        let fixed = 0;
        for (let i = 0; i < rest.length; i++) {
          const expected = i === 0 ? null : Number(rest[i - 1].min_cents);
          const cur = rest[i].prev_min_cents == null ? null : Number(rest[i].prev_min_cents);
          if (expected !== cur) { await tx.execute(sql`UPDATE price_min_events SET prev_min_cents = ${expected} WHERE id = ${Number(rest[i].id)}`); fixed++; }
        }
        evDel += del; evFix += fixed;
        evReport.push({ product: pid, apagados: del, prevMinReligados: fixed, restantes: rest.length });
      }
      report.eventos = evReport; report.eventosApagados = evDel; report.eventosPrevReligados = evFix;

      // ---------- 5) Verificação ----------
      const fpAfter = await fingerprint(tx, products, now);
      report.fingerprintDepois = fpAfter;
      report.snapshotsEOfertasInalterados = JSON.stringify(fpBefore) === JSON.stringify(fpAfter);
      if (!report.snapshotsEOfertasInalterados) throw new Error('Cotações/ofertas mudaram dentro da transação: abortando.');
      const left = await tx.execute<Row>(sql`SELECT count(*)::int n FROM price_daily_state WHERE ${pids} AND day >= ${FROM}::date AND quality <> 'legacy' AND members ?| ${arr}`);
      report.linhasEstadoAindaComDraft = Number(left[0].n);
      const leftEv = await tx.execute<Row>(sql`SELECT count(*)::int n FROM price_min_events WHERE offer_id::text = ANY(${arr})`);
      report.eventosAindaComDraft = Number(leftEv[0].n);

      if (APPLY) {
        log.files = { price_daily_offer: writeNdjson('price_daily_offer', bkOffer), price_daily_state: writeNdjson('price_daily_state', bkState), price_min_events: writeNdjson('price_min_events', bkEvents) };
        Object.assign(log, { products, draftOfProducts, from: FROM, backupRows: report.backupRows });
      }
      if (!APPLY) throw new DryRunRollback();
    }, { isolationLevel: 'repeatable read' });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
    console.log('DRY-RUN: transação DESFEITA, nada foi gravado. Use --apply.');
  }
  report.elapsedMs = Date.now() - started;
  if (APPLY && log.products) {
    log.status = 'committed';
    log.report = report;
    const f = path.join(BACKUP_DIR, `reprocess-draft-log-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify(log, null, 2));
    console.log(`Gravado. Log (reversão): ${f}`);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const readNdjson = (f: string): unknown[] => { const t = fs.readFileSync(path.resolve(f), 'utf8').trim(); return t ? t.split('\n').map((l) => JSON.parse(l)) : []; };
function sameSet(a: unknown[], b: unknown[]): boolean {
  const sa = a.map((x) => JSON.stringify(x)).sort(), sb = b.map((x) => JSON.stringify(x)).sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

async function revert(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<string, any>;
  if (log.status !== 'committed') throw new Error('Log sem status committed: nada a reverter.');
  const bk = { price_daily_offer: readNdjson(log.files.price_daily_offer), price_daily_state: readNdjson(log.files.price_daily_state), price_min_events: readNdjson(log.files.price_min_events) };
  const out: Record<string, unknown> = { mode: APPLY ? 'revert-apply' : 'revert-dry-run' };
  const products = log.products as string[];
  const draftOfProducts = (log.draftOfProducts as string[]) ?? [];
  const from = log.from as string;
  const pids = sql`master_product_id IN (${lit(products)})`;
  const offerWhere = draftOfProducts.length ? sql`offer_id::text = ANY(${textArr(draftOfProducts)}) AND day >= ${from}::date` : sql`false`;
  const stateWhere = sql`${pids} AND day >= ${from}::date AND quality <> 'legacy'`;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      await tx.execute(sql`DELETE FROM price_daily_offer WHERE ${offerWhere}`);
      if (bk.price_daily_offer.length) await tx.execute(sql`INSERT INTO price_daily_offer SELECT * FROM jsonb_populate_recordset(NULL::price_daily_offer, ${JSON.stringify(bk.price_daily_offer)}::jsonb)`);
      await tx.execute(sql`DELETE FROM price_daily_state WHERE ${stateWhere}`);
      if (bk.price_daily_state.length) await tx.execute(sql`INSERT INTO price_daily_state SELECT * FROM jsonb_populate_recordset(NULL::price_daily_state, ${JSON.stringify(bk.price_daily_state)}::jsonb)`);
      await tx.execute(sql`DELETE FROM price_min_events WHERE ${pids}`);
      if (bk.price_min_events.length) await tx.execute(sql`INSERT INTO price_min_events OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::price_min_events, ${JSON.stringify(bk.price_min_events)}::jsonb)`);
      const checks: Record<string, string> = {};
      for (const [t, w, b] of [['price_daily_offer', offerWhere, bk.price_daily_offer], ['price_daily_state', stateWhere, bk.price_daily_state], ['price_min_events', pids, bk.price_min_events]] as const) {
        const cur = await jsonRows(tx, t, w);
        checks[t] = sameSet(cur, b) ? 'identico' : `diferente (${cur.length} no banco, ${b.length} no backup)`;
      }
      out.verificacao = checks;
      if (!APPLY) throw new DryRunRollback();
    }, { isolationLevel: 'repeatable read' });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
    out.nota = 'DRY-RUN da reversão: transação DESFEITA. Use --apply para reverter de fato.';
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exit(1); });

/**
 * REPROCESSAMENTO REVERSÍVEL do estado diário (price_daily_state) e dos eventos do menor preço (price_min_events) dos produtos que têm oferta
 * da Amazon, sob o modo da flag PRICE_AMAZON_MODE (ADR 0010). Motivo: o UPSERT do job nunca reescreve dia FECHADO, e 10/11 foi gravado COM
 * a Amazon; para `off`/`shadow` (o público lê SEM Amazon) esses dias precisam ser regravados sem ela; para `on`, com ela e com o frescor de 24 h.
 * Escreve SÓ em price_daily_state e price_min_events (derivadas). NUNCA toca em affiliate_price_snapshots, affiliate_offers nem price_daily_offer.
 * Sem migration. Idempotente. Autorizar ANTES de rodar com --apply (regra "aprovação ampla com backup": backup NDJSON + log com reversão).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-amazon-state.ts                    # dry-run (padrão): calcula numa transação e DESFAZ
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-amazon-state.ts --apply            # grava + backup NDJSON + log
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-amazon-state.ts --revert <log.json>          # dry-run da reversão
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-amazon-state.ts --revert <log.json> --apply
 *   opções: --mode off|shadow|on   (padrão: PRICE_AMAZON_MODE do ambiente)     --from 2026-11-10   primeiro dia reprocessado
 *
 * REGRA: nada é inventado. O estado é recalculado pelo código existente (`computeStatesForBatch`, mesma regra do job). Eventos: nos modos
 * off/shadow apaga os eventos cuja oferta é da Amazon e religa a cadeia `prev_min_cents`; no modo on os eventos não são tocados (o gancho e o
 * job emitem o próximo mínimo real).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { spDay } from '@/lib/pricing/daily-state';
import { parseAmazonMode, getAmazonMode, type AmazonMode } from '@/lib/pricing/amazon-mode';
import { computeStatesForBatch, upsertStates } from '@/server/pricing/price-daily';

type Tx = Pick<typeof db, 'execute'>;
type Row = Record<string, unknown>;

const argv = process.argv;
const APPLY = argv.includes('--apply');
const arg = (name: string) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
const MODE: AmazonMode = arg('--mode') ? parseAmazonMode(arg('--mode')) : getAmazonMode();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.resolve('backup/dados');

class DryRunRollback extends Error {}
const lit = (list: string[]) => sql.join(list.map((i) => sql`${i}`), sql`, `);
const textArr = (list: string[]) => sql`ARRAY[${lit(list)}]::text[]`;
const cnt = (r: unknown) => Number((r as { count?: number }).count ?? 0);
const members = (v: unknown) => ((typeof v === 'string' ? JSON.parse(v) : v) ?? {}) as Record<string, number>;

async function jsonRows(tx: Tx, table: string, where: ReturnType<typeof sql>): Promise<unknown[]> {
  const r = await tx.execute<{ j: unknown }>(sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(table)} t WHERE ${where} ORDER BY to_jsonb(t)::text`);
  return r.map((x) => x.j);
}
function writeNdjson(table: string, rows: unknown[]): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const f = path.join(BACKUP_DIR, `reprocess-amazon-${stamp}-${table}.ndjson`);
  fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  return f;
}

/** Impressão digital das cotações e das ofertas dos produtos: prova de que nada disso mudou. */
async function fingerprint(tx: Tx, pids: string[], before: Date) {
  const s = await tx.execute<Row>(sql`
    SELECT count(*)::int n, COALESCE(sum(s.price_cents), 0)::text sp, COALESCE(md5(string_agg(s.id::text || ':' || s.price_cents::text || ':' || s.collected_at::text, ',' ORDER BY s.id)), '') h
    FROM affiliate_price_snapshots s JOIN affiliate_offers o ON o.id = s.offer_id WHERE o.master_product_id IN (${lit(pids)}) AND s.collected_at < ${before.toISOString()}::timestamptz`);
  const o = await tx.execute<Row>(sql`
    SELECT count(*)::int n, COALESCE(md5(string_agg(to_jsonb(o)::text, ',' ORDER BY o.id)), '') h FROM affiliate_offers o WHERE o.master_product_id IN (${lit(pids)})`);
  return { snapshots: { n: Number(s[0].n), sumPriceCents: String(s[0].sp), hash: String(s[0].h) }, offers: { n: Number(o[0].n), hash: String(o[0].h) } };
}

async function main() {
  const ri = argv.indexOf('--revert');
  if (ri >= 0) return revert(argv[ri + 1]);
  const now = new Date();
  const today = spDay(now);
  const report: Record<string, unknown> = { mode: APPLY ? 'apply' : 'dry-run', amazonMode: MODE, at: now.toISOString(), today };
  const log: Record<string, unknown> = { ...report, status: 'pending', stamp, files: {} };
  const started = Date.now();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      // ---------- 0) Escopo: produtos com oferta Amazon que já tem linha oferta-dia ----------
      const first = await tx.execute<Row>(sql`
        SELECT min(d.day)::text AS d FROM price_daily_offer d JOIN affiliate_offers o ON o.id = d.offer_id JOIN affiliate_networks n ON n.id = o.network_id WHERE n.slug = 'amazon'`);
      const FROM = arg('--from') ?? (first[0]?.d ? String(first[0].d) : today);
      report.from = FROM;
      const ar = await tx.execute<Row>(sql`SELECT o.id::text AS id, o.master_product_id::text AS pid FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE n.slug = 'amazon'`);
      const amazonOffers = ar.map((r) => String(r.id));
      const products = [...new Set(ar.map((r) => String(r.pid)))].sort();
      report.ofertasAmazon = amazonOffers.length;
      report.produtos = products.length;
      if (!products.length) { console.log('Nenhum produto com Amazon: nada a fazer.'); return; }
      const pids = sql`master_product_id IN (${lit(products)})`;
      const stateWhere = sql`${pids} AND day >= ${FROM}::date AND quality <> 'legacy'`;
      const fpBefore = await fingerprint(tx, products, now);
      report.fingerprintAntes = fpBefore;

      // ---------- 1) Backup (antes de qualquer escrita) ----------
      const bkState = await jsonRows(tx, 'price_daily_state', stateWhere);
      const bkEvents = await jsonRows(tx, 'price_min_events', pids);
      report.backupLinhas = { price_daily_state: bkState.length, price_min_events: bkEvents.length };

      // ---------- 2) Estado: recalcula sob o modo e regrava os dias que diferem (inclusive fechados) ----------
      const stored = await tx.execute<Row>(sql`SELECT master_product_id::text AS pid, day::text AS day, avg_cents, min_cents, n_offers, members FROM price_daily_state WHERE ${stateWhere}`);
      const storedKey = new Map(stored.map((x) => [`${x.pid}|${x.day}`, JSON.stringify([x.avg_cents == null ? null : Number(x.avg_cents), x.min_cents == null ? null : Number(x.min_cents), Number(x.n_offers), Object.entries(members(x.members)).sort()])]));
      const withAmazonBefore = stored.filter((x) => Object.keys(members(x.members)).some((k) => amazonOffers.includes(k))).length;
      let rewritten = 0;
      let deleted = 0;
      const sample: unknown[] = [];
      for (const pid of products) {
        const { rows } = await computeStatesForBatch(tx, [pid], FROM, today, now, { mode: MODE });
        const byDay = new Map(rows.map((r) => [r.day, r]));
        const storedDays = stored.filter((x) => String(x.pid) === pid).map((x) => String(x.day));
        const days = [...new Set([...byDay.keys(), ...storedDays])].sort();
        let changed = false;
        for (const d of days) {
          const a = byDay.get(d);
          const key = a ? JSON.stringify([a.avgCents, a.minCents, a.nOffers, Object.entries(a.members).sort()]) : null;
          // a decomposição (matched_*) de um dia depende do anterior: depois da primeira diferença, regrava o resto
          if (!changed && key === (storedKey.get(`${pid}|${d}`) ?? null)) continue;
          changed = true;
          await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id = ${pid}::uuid AND day = ${d}::date AND quality <> 'legacy'`);
          if (a) rewritten += await upsertStates(tx, [a]);
          else deleted++;
          if (sample.length < 12) sample.push({ product: pid.slice(0, 8), day: d, antes: storedKey.get(`${pid}|${d}`) ? JSON.parse(storedKey.get(`${pid}|${d}`) as string).slice(0, 3) : null, depois: a ? [a.avgCents, a.minCents, a.nOffers] : null });
        }
      }
      report.estadoLinhasComAmazonAntes = withAmazonBefore;
      report.estadoLinhasRegravadas = rewritten;
      report.estadoLinhasRemovidas = deleted;
      report.amostra = sample;

      // ---------- 3) Eventos (só off/shadow): apaga os cuja oferta é Amazon e religa a cadeia ----------
      if (MODE !== 'on') {
        let evDel = 0;
        let evFix = 0;
        for (const pid of products) {
          evDel += cnt(await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id = ${pid}::uuid AND offer_id::text = ANY(${textArr(amazonOffers)})`));
          const rest = await tx.execute<Row>(sql`SELECT id, min_cents, prev_min_cents FROM price_min_events WHERE master_product_id = ${pid}::uuid ORDER BY at, id`);
          for (let i = 0; i < rest.length; i++) {
            const expected = i === 0 ? null : Number(rest[i - 1].min_cents);
            const cur = rest[i].prev_min_cents == null ? null : Number(rest[i].prev_min_cents);
            if (expected !== cur) { await tx.execute(sql`UPDATE price_min_events SET prev_min_cents = ${expected} WHERE id = ${Number(rest[i].id)}`); evFix++; }
          }
        }
        report.eventosApagados = evDel;
        report.eventosPrevReligados = evFix;
      } else report.eventos = 'modo on: eventos não tocados';

      // ---------- 4) Verificação ----------
      const fpAfter = await fingerprint(tx, products, now);
      report.cotacoesEOfertasInalteradas = JSON.stringify(fpBefore) === JSON.stringify(fpAfter);
      if (!report.cotacoesEOfertasInalteradas) throw new Error('Cotações/ofertas mudaram dentro da transação: abortando.');
      if (MODE !== 'on') {
        const left = await tx.execute<Row>(sql`SELECT count(*)::int n FROM price_daily_state WHERE ${stateWhere} AND members ?| ${textArr(amazonOffers)}`);
        report.estadoLinhasAindaComAmazon = Number(left[0].n);
        const leftEv = await tx.execute<Row>(sql`SELECT count(*)::int n FROM price_min_events WHERE offer_id::text = ANY(${textArr(amazonOffers)})`);
        report.eventosAindaComAmazon = Number(leftEv[0].n);
      }
      if (APPLY) {
        log.files = { price_daily_state: writeNdjson('price_daily_state', bkState), price_min_events: writeNdjson('price_min_events', bkEvents) };
        Object.assign(log, { products, from: FROM, backupLinhas: report.backupLinhas });
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
    const f = path.join(BACKUP_DIR, `reprocess-amazon-log-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify(log, null, 2));
    console.log(`Gravado. Log (reversão): ${f}`);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const readNdjson = (f: string): unknown[] => { const t = fs.readFileSync(path.resolve(f), 'utf8').trim(); return t ? t.split('\n').map((l) => JSON.parse(l)) : []; };
const sameSet = (a: unknown[], b: unknown[]) => {
  const sa = a.map((x) => JSON.stringify(x)).sort(), sb = b.map((x) => JSON.stringify(x)).sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
};

async function revert(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<string, any>;
  if (log.status !== 'committed') throw new Error('Log sem status committed: nada a reverter.');
  const bk = { price_daily_state: readNdjson(log.files.price_daily_state), price_min_events: readNdjson(log.files.price_min_events) };
  const out: Record<string, unknown> = { mode: APPLY ? 'revert-apply' : 'revert-dry-run' };
  const products = log.products as string[];
  const from = log.from as string;
  const pids = sql`master_product_id IN (${lit(products)})`;
  const stateWhere = sql`${pids} AND day >= ${from}::date AND quality <> 'legacy'`;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      await tx.execute(sql`DELETE FROM price_daily_state WHERE ${stateWhere}`);
      if (bk.price_daily_state.length) await tx.execute(sql`INSERT INTO price_daily_state SELECT * FROM jsonb_populate_recordset(NULL::price_daily_state, ${JSON.stringify(bk.price_daily_state)}::jsonb)`);
      await tx.execute(sql`DELETE FROM price_min_events WHERE ${pids}`);
      if (bk.price_min_events.length) await tx.execute(sql`INSERT INTO price_min_events OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::price_min_events, ${JSON.stringify(bk.price_min_events)}::jsonb)`);
      const checks: Record<string, string> = {};
      for (const [t, w, b] of [['price_daily_state', stateWhere, bk.price_daily_state], ['price_min_events', pids, bk.price_min_events]] as const) {
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

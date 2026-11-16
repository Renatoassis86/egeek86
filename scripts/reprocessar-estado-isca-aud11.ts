/**
 * REPROCESSO DO ESTADO DIARIO COM ISCA (AUD-11, R-74; registro de ata exigido pela linha S06 do Fluxo). Dias FECHADOS de `price_daily_state` guardam
 * `min_cents`/media de ofertas que depois foram marcadas como preco-isca (`preco_isca_marcas`, R-61). O UPSERT do job nunca reescreve dia fechado
 * (R-20), entao a correcao e este script manual, com backup NDJSON, log e reversao. Escreve SO em price_daily_state (derivada); NUNCA toca em cotacoes,
 * ofertas nem price_daily_offer (que o gatilho R-61 ja refaz sem a isca). Recalcula pelo codigo existente (`computeStatesForBatch`), nada inventado.
 * Escopo: produtos com marca de isca vigente, a partir do primeiro dia marcado. Idempotente. DRY-RUN por padrao (transacao desfeita).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-estado-isca-aud11.ts                 # dry-run
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-estado-isca-aud11.ts --apply         # grava + backup + log (SO COM APROVACAO DO DONO: S06)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocessar-estado-isca-aud11.ts --revert <log.json> [--apply]
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
  const f = path.join(BACKUP_DIR, `reprocessar-isca-${stamp}-${table}.ndjson`);
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
      const marks = await tx.execute<Row>(sql`SELECT master_product_id::text AS pid, min((s.collected_at AT TIME ZONE 'America/Sao_Paulo')::date)::text AS d
        FROM preco_isca_marcas k JOIN affiliate_price_snapshots s ON s.id = k.snapshot_id WHERE k.liberado_em IS NULL GROUP BY 1`);
      const FROM = arg('--from') ?? (marks.length ? marks.map((r) => String(r.d)).sort()[0] : today);
      report.from = FROM;
      const products = marks.map((r) => String(r.pid)).sort();
      const amazonOffers: string[] = [];
      report.produtos = products.length;
      if (!products.length) { console.log('Nenhum produto com marca de isca vigente: nada a fazer.'); return; }
      const pids = sql`master_product_id IN (${lit(products)})`;
      const stateWhere = sql`${pids} AND day >= ${FROM}::date AND quality <> 'legacy'`;
      const fpBefore = await fingerprint(tx, products, now);
      report.fingerprintAntes = fpBefore;

      // ---------- 1) Backup (antes de qualquer escrita) ----------
      const bkState = await jsonRows(tx, 'price_daily_state', stateWhere);
      const bkEvents: unknown[] = [];
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

      // ---------- 4) Verificação ----------
      const fpAfter = await fingerprint(tx, products, now);
      report.cotacoesEOfertasInalteradas = JSON.stringify(fpBefore) === JSON.stringify(fpAfter);
      if (!report.cotacoesEOfertasInalteradas) throw new Error('Cotações/ofertas mudaram dentro da transação: abortando.');
      report.diasComIscaAinda = Number((await tx.execute<Row>(sql`SELECT count(*)::int n FROM (SELECT min_offer_id FROM price_daily_state WHERE ${stateWhere}) st JOIN affiliate_offers o ON o.id = st.min_offer_id WHERE o.quarantine_reason LIKE 'preco_isca%'`))[0].n);
      if (APPLY) {
        log.files = { price_daily_state: writeNdjson('price_daily_state', bkState), price_min_events: writeNdjson('price_min_events', []) };
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
    const f = path.join(BACKUP_DIR, `reprocessar-isca-log-${stamp}.json`);
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
  const bk = { price_daily_state: readNdjson(log.files.price_daily_state) };
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
      const checks: Record<string, string> = {};
      for (const [t, w, b] of [['price_daily_state', stateWhere, bk.price_daily_state]] as const) {
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

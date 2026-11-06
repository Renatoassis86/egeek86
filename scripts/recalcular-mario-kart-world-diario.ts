/**
 * Recalcula price_daily_offer e price_daily_state do master Mario Kart World (7ac4d8d5) de 2026-10-31 a hoje,
 * pelo código existente (upsertOfferDays + computeStatesForBatch + upsertStates), como scripts/reprocess-draft-offers.ts.
 * Autorização do dono (2026-11-05). Escreve SÓ em price_daily_offer / price_daily_state (derivadas); não toca em cotações nem ofertas.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/recalcular-mario-kart-world-diario.ts            # dry-run (desfaz)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/recalcular-mario-kart-world-diario.ts --apply    # grava + backup + log
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/recalcular-mario-kart-world-diario.ts --revert <log> [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { spDay } from '@/lib/pricing/daily-state';
import { computeStatesForBatch, upsertOfferDays, upsertStates } from '@/server/pricing/price-daily';

const PID = '7ac4d8d5-65cd-4a19-9e39-4f288a3386e7';
const FROM = '2026-10-31';
const argv = process.argv;
const APPLY = argv.includes('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('backup/dados');
class DryRun extends Error {}
type Row = Record<string, unknown>;
type Tx = Pick<typeof db, 'execute'>;

const rowsOf = async (tx: Tx, table: string, where: ReturnType<typeof sql>) =>
  (await tx.execute<{ j: unknown }>(sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(table)} t WHERE ${where} ORDER BY to_jsonb(t)::text`)).map((r) => r.j);
const wr = (n: string, rows: unknown[]) => {
  const f = path.join(DIR, `mario-kart-world-diario-${stamp}-${n}.ndjson`);
  fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  return f;
};
const money = (c: unknown) => (c == null ? '-' : (Number(c) / 100).toFixed(2));
const offerWhere = sql`master_product_id = ${PID} AND day >= ${FROM}::date`;
const stateWhere = sql`master_product_id = ${PID} AND day >= ${FROM}::date AND quality <> 'legacy'`;

async function snapshot(tx: Tx) {
  const s = await tx.execute<Row>(sql`SELECT day::text d, quality, closed, n_offers, avg_cents, median_offer_day_cents, min_cents FROM price_daily_state WHERE ${stateWhere} ORDER BY day`);
  return s.map((x) => ({ dia: x.d, qualidade: x.quality, fechado: x.closed, ofertas: x.n_offers, media: money(x.avg_cents), mediana: money(x.median_offer_day_cents), minimo: money(x.min_cents) }));
}

async function main() {
  if (argv.indexOf('--revert') >= 0) return revert(argv[argv.indexOf('--revert') + 1]);
  const now = new Date();
  const today = spDay(now);
  const out: Record<string, unknown> = { modo: APPLY ? 'apply' : 'dry-run', de: FROM, ate: today };
  const log: Record<string, unknown> = { status: 'pending', stamp, produto: PID, de: FROM };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      const bkOffer = await rowsOf(tx, 'price_daily_offer', offerWhere);
      const bkState = await rowsOf(tx, 'price_daily_state', stateWhere);
      out.antes = await snapshot(tx);
      out.linhasBackup = { price_daily_offer: bkOffer.length, price_daily_state: bkState.length };
      if (APPLY) log.files = { price_daily_offer: wr('price_daily_offer', bkOffer), price_daily_state: wr('price_daily_state', bkState) };

      const offers = await tx.execute<Row>(sql`SELECT id::text id FROM affiliate_offers WHERE master_product_id = ${PID}`);
      let po = 0;
      for (const o of offers) po += await upsertOfferDays(tx, FROM, today, String(o.id));
      out.ofertaDiaUpsert = po;

      const { rows } = await computeStatesForBatch(tx, [PID], FROM, today, now);
      // Linhas fechadas já existentes não são reescritas pelo upsert; aqui regravamos o produto (apaga as do período e insere).
      await tx.execute(sql`DELETE FROM price_daily_state WHERE ${stateWhere}`);
      out.estadoGravado = await upsertStates(tx, rows);
      out.depois = await snapshot(tx);
      const el = await tx.execute<Row>(sql`SELECT count(*)::int n FROM affiliate_offers o WHERE o.master_product_id = ${PID} AND ${(await import('@/server/pricing/eligibility-sql')).eligibleOfferSql('o')}`);
      out.ofertasElegiveisAgora = Number(el[0].n);
      if (!APPLY) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    console.log('DRY-RUN: transação desfeita, nada gravado.');
  }
  if (APPLY) {
    log.status = 'committed';
    const f = path.join(DIR, `mario-kart-world-diario-log-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify({ ...log, resultado: out }, null, 2));
    console.log('Log (reversão):', f);
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const readNd = (f: string): unknown[] => {
  const t = fs.readFileSync(path.resolve(f), 'utf8').trim();
  return t ? t.split('\n').map((l) => JSON.parse(l)) : [];
};

async function revert(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (log.status !== 'committed') throw new Error('log sem status committed');
  const bkO = readNd(log.files.price_daily_offer);
  const bkS = readNd(log.files.price_daily_state);
  const out: Record<string, unknown> = { modo: APPLY ? 'revert-apply' : 'revert-dry-run' };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      await tx.execute(sql`DELETE FROM price_daily_offer WHERE ${offerWhere}`);
      if (bkO.length) await tx.execute(sql`INSERT INTO price_daily_offer SELECT * FROM jsonb_populate_recordset(NULL::price_daily_offer, ${JSON.stringify(bkO)}::jsonb)`);
      await tx.execute(sql`DELETE FROM price_daily_state WHERE ${stateWhere}`);
      if (bkS.length) await tx.execute(sql`INSERT INTO price_daily_state SELECT * FROM jsonb_populate_recordset(NULL::price_daily_state, ${JSON.stringify(bkS)}::jsonb)`);
      const eq = (a: unknown[], b: unknown[]) => JSON.stringify(a.map((x) => JSON.stringify(x)).sort()) === JSON.stringify(b.map((x) => JSON.stringify(x)).sort());
      out.verificacao = {
        price_daily_offer: eq(await rowsOf(tx, 'price_daily_offer', offerWhere), bkO) ? 'identico' : 'diferente',
        price_daily_state: eq(await rowsOf(tx, 'price_daily_state', stateWhere), bkS) ? 'identico' : 'diferente',
      };
      if (!APPLY) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    out.nota = 'DRY-RUN da reversão: desfeita.';
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});

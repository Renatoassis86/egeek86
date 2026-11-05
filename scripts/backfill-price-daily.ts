/**
 * BACKFILL REVERSÍVEL das métricas diárias (ata 2026-11-05, ADR 0004). Escreve SÓ em price_daily_offer,
 * price_daily_state e price_min_events (derivadas; migration 0024). Nunca altera nem apaga cotações ou ofertas.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-price-daily.ts                 # dry-run (padrão): calcula tudo numa transação e DESFAZ
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-price-daily.ts --apply         # grava (uma transação REPEATABLE READ) + log
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-price-daily.ts --revert backup/dados/price-daily-backfill-log-<ts>.json
 *
 * O que faz (a partir de 2026-10-31, início do regime de 1 cotação/oferta/dia; antes: marcar legacy, sem recalcular):
 *   1. price_daily_offer de 2026-10-24 (7 dias antes, para o carry-forward do 1º dia) até hoje;
 *   2. price_daily_state de 2026-10-31 até hoje (dias anteriores a hoje fechados; hoje aberto);
 *   3. price_daily_state 'legacy' (só contagem medida) para dias com cotação anteriores a 2026-10-31 (--skip-legacy omite);
 *   4. price_min_events 'reconstructed' dos instantes com cotação medida desde 2026-10-31 (altas por expiração
 *      entre cotações não são observáveis e não são inventadas).
 * REPEATABLE READ: o coletor grava ao vivo; a transação enxerga um retrato único das cotações.
 * Reversão: apaga o que está no escopo do log (as três tabelas são derivadas e recalculáveis); NÃO toca em
 * cotações. Backup exigido: affiliate_offers*.ndjson com <= 12 h em backup/dados/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PRICE_DAILY_REGIME_START, addDays, reconstructMinEvents, spDay } from '@/lib/pricing/daily-state';
import { computeStatesForBatch, insertEvents, loadReconOffers, upsertOfferDays, upsertStates } from '@/server/pricing/price-daily';

const APPLY = process.argv.includes('--apply');
const SKIP_LEGACY = process.argv.includes('--skip-legacy');
const revertIdx = process.argv.indexOf('--revert');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const CHUNK = 250;

class DryRunRollback extends Error {}

function recentBackupOk(): string {
  const dir = path.resolve('backup/dados');
  const files = fs.readdirSync(dir).filter((f) => /^affiliate_offers.*\.ndjson$/.test(f));
  const newest = Math.max(0, ...files.map((f) => fs.statSync(path.join(dir, f)).mtimeMs));
  const ageH = (Date.now() - newest) / 3_600_000;
  if (!newest || ageH > 12) throw new Error(`Backup de affiliate_offers com ${ageH.toFixed(1)} h (> 12 h). Gere um em backup/dados/.`);
  return `${ageH.toFixed(1)} h`;
}

async function counts(tx: Pick<typeof db, 'execute'>) {
  const r = await tx.execute<{ o: number; s: number; e: number }>(sql`
    SELECT (SELECT count(*) FROM price_daily_offer)::int AS o, (SELECT count(*) FROM price_daily_state)::int AS s, (SELECT count(*) FROM price_min_events)::int AS e`);
  return { price_daily_offer: Number(r[0].o), price_daily_state: Number(r[0].s), price_min_events: Number(r[0].e) };
}

async function revert(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as { offerFrom: string; pre: Record<string, number> };
  await db.transaction(async (tx) => {
    const before = await counts(tx);
    await tx.execute(sql`DELETE FROM price_daily_offer WHERE day >= ${log.offerFrom}::date`);
    await tx.execute(sql`DELETE FROM price_daily_state`);
    await tx.execute(sql`DELETE FROM price_min_events WHERE source = 'reconstructed'`);
    const after = await counts(tx);
    console.log('Antes da reversão:', before, '\nDepois:', after, '\nContagens anteriores ao backfill (log):', log.pre);
  });
  console.log('Revertido. Cotações e ofertas não foram tocadas.');
}

async function main() {
  if (revertIdx >= 0) return revert(process.argv[revertIdx + 1]);
  const backupAge = recentBackupOk();
  const now = new Date();
  const today = spDay(now);
  const offerFrom = addDays(PRICE_DAILY_REGIME_START, -7);
  const started = Date.now();
  const t = (label: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${label}`);
  const log: Record<string, unknown> = { appliedAt: now.toISOString(), mode: APPLY ? 'apply' : 'dry-run', today, offerFrom, stateFrom: PRICE_DAILY_REGIME_START, backupAge };

  try {
    await db.transaction(
      async (tx) => {
        log.pre = await counts(tx);
        t(`pré-contagens ${JSON.stringify(log.pre)}`);

        log.offerDayRows = await upsertOfferDays(tx, offerFrom, today);
        t(`price_daily_offer: ${log.offerDayRows} linhas (${offerFrom} a ${today})`);

        const prods = (await tx.execute<{ id: string }>(sql`SELECT DISTINCT master_product_id AS id FROM price_daily_offer`)).map((r) => String(r.id));
        log.products = prods.length;
        t(`${prods.length} produtos com cotação medida`);

        let stateRows = 0;
        let events = 0;
        const fromAt = new Date(`${PRICE_DAILY_REGIME_START}T00:00:00-03:00`);
        for (let i = 0; i < prods.length; i += CHUNK) {
          const chunk = prods.slice(i, i + CHUNK);
          const { rows } = await computeStatesForBatch(tx, chunk, PRICE_DAILY_REGIME_START, today, now);
          stateRows += await upsertStates(tx, rows);
          const recon = await loadReconOffers(tx, chunk, fromAt.toISOString());
          for (const [pid, offers] of recon) events += await insertEvents(tx, pid, reconstructMinEvents(offers, fromAt), 'reconstructed');
          if ((i / CHUNK) % 4 === 3) t(`  lotes ${i + chunk.length}/${prods.length}: estados ${stateRows}, eventos ${events}`);
        }
        log.stateRows = stateRows;
        log.reconstructedEvents = events;
        t(`price_daily_state: ${stateRows} linhas; price_min_events reconstruídos: ${events}`);

        if (!SKIP_LEGACY) {
          const res = await tx.execute(sql`
            INSERT INTO price_daily_state (master_product_id, day, n_offers, n_quotes, quality, closed, computed_at)
            SELECT o.master_product_id, (s.collected_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                   COUNT(DISTINCT s.offer_id)::int, COUNT(*)::int, 'legacy', true, now()
            FROM affiliate_price_snapshots s INNER JOIN affiliate_offers o ON o.id = s.offer_id
            WHERE s.price_cents > 0 AND s.collected_at < (${PRICE_DAILY_REGIME_START}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'
            GROUP BY o.master_product_id, day
            ON CONFLICT (master_product_id, day) DO NOTHING`);
          log.legacyRows = Number((res as unknown as { count?: number }).count ?? 0);
          t(`price_daily_state legacy: ${log.legacyRows} linhas`);
        }
        log.post = await counts(tx);
        const q = await tx.execute<{ quality: string; n: number }>(sql`SELECT quality, count(*)::int AS n FROM price_daily_state GROUP BY 1 ORDER BY 1`);
        log.qualityDistribution = Object.fromEntries(q.map((r) => [r.quality, Number(r.n)]));
        t(`pós-contagens ${JSON.stringify(log.post)}; qualidade ${JSON.stringify(log.qualityDistribution)}`);
        if (!APPLY) throw new DryRunRollback();
      },
      { isolationLevel: 'repeatable read' },
    );
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
    console.log('DRY-RUN: transação DESFEITA, nada foi gravado. Use --apply.');
  }
  log.elapsedMs = Date.now() - started;
  if (APPLY) {
    const logFile = `backup/dados/price-daily-backfill-log-${stamp}.json`;
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    console.log(`Gravado. Log (reversão): ${logFile}`);
  } else {
    console.log(JSON.stringify(log, null, 2));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

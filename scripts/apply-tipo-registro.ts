/**
 * Migration 0038 (affiliate_price_snapshots.record_kind) + backfill em lotes de ofertas.
 *   npx tsx --env-file=.env.local scripts/apply-tipo-registro.ts            # dry-run
 *   npx tsx --env-file=.env.local scripts/apply-tipo-registro.ts --apply    # coluna + backfill (idempotente: so linhas com record_kind NULL)
 *   npx tsx --env-file=.env.local scripts/apply-tipo-registro.ts --rollback
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function main() {
  const sql = connect();
  try {
    const col = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='affiliate_price_snapshots' AND column_name='record_kind'`;
    console.log('Coluna record_kind existe:', col[0].n === 1);
    if (!APPLY && !ROLLBACK) return void console.log('DRY-RUN: use --apply ou --rollback.');
    if (ROLLBACK) {
      await sql.begin(async (tx) => { await tx.unsafe(fs.readFileSync(path.join(dir, '0038_snapshot_record_kind.rollback.sql'), 'utf8')); });
      return void console.log('rollback feito');
    }
    await sql.begin(async (tx) => { await tx.unsafe(fs.readFileSync(path.join(dir, '0038_snapshot_record_kind.sql'), 'utf8')); });
    console.log('coluna criada');
    const offers = await sql<{ offer_id: string }[]>`SELECT DISTINCT offer_id::text FROM affiliate_price_snapshots WHERE record_kind IS NULL`;
    console.log('ofertas a classificar:', offers.length);
    const ids = offers.map((o) => o.offer_id);
    let done = 0;
    for (let i = 0; i < ids.length; i += 300) {
      const batch = ids.slice(i, i + 300);
      const r = await sql`
        UPDATE affiliate_price_snapshots s SET record_kind = y.k
        FROM (
          SELECT id, CASE WHEN p0 IS NULL THEN 'primeira' WHEN price_cents <> p0 THEN 'mudanca' ELSE 'batimento' END AS k
          FROM (SELECT id, price_cents, source::text AS src, lag(price_cents) OVER (PARTITION BY offer_id ORDER BY collected_at, id) AS p0
                FROM affiliate_price_snapshots WHERE offer_id = ANY(${batch}::uuid[])) x
        ) y
        WHERE s.id = y.id AND s.record_kind IS NULL`;
      done += r.count;
      if ((i / 300) % 10 === 0) console.log(`lote ${i / 300 + 1}/${Math.ceil(ids.length / 300)} classificadas=${done}`);
    }
    // cadastros manuais do admin
    await sql`UPDATE affiliate_price_snapshots SET record_kind = 'manual' WHERE source::text = 'manual' AND record_kind IN ('primeira','mudanca')`;
    const sum = await sql`SELECT coalesce(record_kind,'(null)') k, count(*)::int n FROM affiliate_price_snapshots GROUP BY 1 ORDER BY 2 DESC`;
    console.table(sum);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

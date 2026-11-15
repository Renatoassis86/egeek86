/**
 * Backfill das médias históricas dos produtos afetados pelo "vendedor fraco fora da média" (R2-4, 2026-11-15).
 * Recalcula price_daily_state (de PRICE_DAILY_REGIME_START até hoje) SÓ dos produtos com oferta marcada avg_excluded_reason='vendedor-fraco',
 * com a regra atual (computeStatesForBatch, a mesma do job refresh-price-daily). Diferente do job, REESCREVE dias fechados (por isso backup antes).
 *   # DRY-RUN (padrão): calcula e compara com o gravado; não escreve nada
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/refazer-medias-vendedor-fraco.ts
 *   # APLICAR: backup NDJSON das linhas atuais + log JSON; transações curtas por lote; guarda otimista (computed_at igual ao do backup)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/refazer-medias-vendedor-fraco.ts --apply
 *   # REVERTER: restaura as linhas do backup (e apaga as que este lote criou), com guarda por computed_at do que ele gravou
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/refazer-medias-vendedor-fraco.ts --rollback docs/backups/medias-vendedor-fraco-log-<ts>.json [--apply]
 * Não toca em cotações, ofertas, price_daily_offer nem eventos de menor preço. Único DELETE: rollback das linhas que o próprio lote criou.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { PRICE_DAILY_REGIME_START, spDay } from '../src/lib/pricing/daily-state';
import { computeStatesForBatch, type StateRow } from '../src/server/pricing/price-daily';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const CHUNK = 100;
const ids = (l: string[]) => sql.join(l.map((i) => sql`${i}`), sql`, `);

type Row = Record<string, unknown>;
const key = (p: unknown, d: unknown) => `${String(p)}|${String(d).slice(0, 10)}`;
const colList = (names: string[]) => sql.join(names.map((c) => sql.raw(`"${c}"`)), sql`, `);
const setList = (names: string[]) => sql.join(names.filter((c) => c !== 'master_product_id' && c !== 'day').map((c) => sql.raw(`"${c}" = EXCLUDED."${c}"`)), sql`, `);

/** Upsert de linhas JSON (só as colunas presentes em `rows[0]`), inclusive sobre dia fechado. */
async function upsertRaw(tx: Pick<typeof db, 'execute'>, rows: Row[]) {
  if (!rows.length) return 0;
  const names = Object.keys(rows[0]!);
  const r = await tx.execute(sql`INSERT INTO price_daily_state (${colList(names)})
    SELECT ${colList(names)} FROM jsonb_populate_recordset(null::price_daily_state, ${JSON.stringify(rows)}::jsonb)
    ON CONFLICT (master_product_id, day) DO UPDATE SET ${setList(names)}`);
  return Number((r as unknown as { count?: number }).count ?? 0);
}

const pairs = (l: Array<[string, string]>) => sql.join(l.map(([p, d]) => sql`(${p}::uuid, ${d}::date)`), sql`, `);

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  if (rb >= 0) {
    const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as { backup: string; criadas: string[]; gravadas: Record<string, string> };
    const bak = fs.readFileSync(log.backup, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
    console.log(`rollback: restaurar até ${bak.length} linhas, apagar ${log.criadas.length} criadas pelo lote`);
    if (!APPLY) return void console.log('DRY-RUN: use --apply');
    let rest = 0, del = 0, skip = 0;
    for (let i = 0; i < bak.length; i += CHUNK) {
      const part = bak.slice(i, i + CHUNK);
      await db.transaction(async (tx) => {
        const cur = await tx.execute<Row>(sql`SELECT master_product_id, day::text AS day, computed_at::text AS ca FROM price_daily_state WHERE (master_product_id, day) IN (${pairs(part.map((r) => [String(r.master_product_id), String(r.day).slice(0, 10)]))})`);
        const curMap = new Map(cur.map((r) => [key(r.master_product_id, r.day), String(r.ca)]));
        // Guarda: só restaura a linha se ela ainda está como este lote a deixou (ou se este lote não a gravou).
        const ok = part.filter((r) => { const g = log.gravadas[key(r.master_product_id, r.day)]; return !g || curMap.get(key(r.master_product_id, r.day)) === g; }).filter((r) => log.gravadas[key(r.master_product_id, r.day)]);
        skip += part.length - ok.length;
        rest += await upsertRaw(tx, ok);
      });
    }
    for (let i = 0; i < log.criadas.length; i += CHUNK) {
      const part = log.criadas.slice(i, i + CHUNK).map((k) => k.split('|') as [string, string]);
      await db.transaction(async (tx) => {
        const r = await tx.execute(sql`DELETE FROM price_daily_state WHERE (master_product_id, day) IN (${pairs(part)})`);
        del += Number((r as unknown as { count?: number }).count ?? 0);
      });
    }
    return void console.log(`ROLLBACK aplicado: restauradas ${rest}, apagadas ${del}, puladas ${skip}`);
  }

  const now = new Date();
  const today = spDay(now);
  const prods = (await db.execute<{ id: string }>(sql`SELECT DISTINCT master_product_id::text AS id FROM affiliate_offers WHERE avg_excluded_reason = 'vendedor-fraco' AND avg_excluded_at IS NOT NULL AND master_product_id IS NOT NULL ORDER BY 1`)).map((r) => r.id);
  console.log(`produtos afetados: ${prods.length}; janela ${PRICE_DAILY_REGIME_START}..${today}; modo ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // Retrato atual (base do backup e da guarda otimista).
  const atuais = new Map<string, Row>();
  for (let i = 0; i < prods.length; i += 500) {
    const r = await db.execute<Row>(sql`SELECT *, day::text AS day_txt, computed_at::text AS ca_txt FROM price_daily_state WHERE master_product_id IN (${ids(prods.slice(i, i + 500))}) AND day >= ${PRICE_DAILY_REGIME_START}::date`);
    for (const x of r) atuais.set(key(x.master_product_id, x.day_txt), x);
  }
  console.log(`linhas atuais no escopo (>= ${PRICE_DAILY_REGIME_START}): ${atuais.size}`);

  let mudou = 0, igual = 0, criar = 0, soAberto = 0, pulada = 0, gravadas = 0, falhas = 0;
  const criadas: string[] = [];
  const gravMap: Record<string, string> = {};
  const exemplos: unknown[] = [];
  let bakPath = '';
  if (APPLY) {
    bakPath = path.join(DIR, `medias-vendedor-fraco-${stamp}.ndjson`);
    const lines: string[] = [];
    for (const x of atuais.values()) { const { day_txt, ca_txt, ...rest } = x; void day_txt; void ca_txt; lines.push(JSON.stringify(rest)); }
    fs.writeFileSync(bakPath, lines.join('\n') + '\n');
    console.log('backup:', bakPath, lines.length, 'linhas');
  }

  for (let i = 0; i < prods.length; i += CHUNK) {
    const chunk = prods.slice(i, i + CHUNK);
    try {
      const { rows } = await computeStatesForBatch(db, chunk, PRICE_DAILY_REGIME_START, today, now);
      const aGravar: StateRow[] = [];
      for (const n of rows) {
        const a = atuais.get(key(n.productId, n.day));
        if (!a) { criar++; continue; } // dia sem linha hoje (produto ainda não elegível então): não inventa histórico
        const diff = Number(a.avg_cents ?? -1) !== Number(n.avgCents ?? -1) || Number(a.n_offers) !== n.nOffers || Number(a.min_cents ?? -1) !== Number(n.minCents ?? -1) || Number(a.n_stores) !== n.nStores;
        if (!diff) { igual++; continue; }
        mudou++;
        if (n.day === today) soAberto++;
        if (exemplos.length < 5) exemplos.push({ p: n.productId, d: n.day, avg_antes: a.avg_cents, avg_depois: n.avgCents, ofertas_antes: a.n_offers, ofertas_depois: n.nOffers });
        aGravar.push(n);
      }
      if (!APPLY || !aGravar.length) continue;
      await db.transaction(async (tx) => {
        const cur = await tx.execute<Row>(sql`SELECT master_product_id, day::text AS day, computed_at::text AS ca FROM price_daily_state WHERE (master_product_id, day) IN (${pairs(aGravar.map((r) => [r.productId, r.day]))})`);
        const curMap = new Map(cur.map((r) => [key(r.master_product_id, r.day), String(r.ca)]));
        // Guarda otimista: linha mudou desde o retrato (ex.: o job do dia aberto) -> pula.
        const ok = aGravar.filter((r) => { const a = atuais.get(key(r.productId, r.day)); return a ? curMap.get(key(r.productId, r.day)) === String(a.ca_txt) : !curMap.has(key(r.productId, r.day)); });
        pulada += aGravar.length - ok.length;
        if (!ok.length) return;
        const jsonRows = ok.map((r) => ({
          master_product_id: r.productId, day: r.day, min_cents: r.minCents, min_offer_id: r.minOfferId, avg_cents: r.avgCents, median_offer_day_cents: r.medianCents,
          max_cents: r.maxCents, n_offers: r.nOffers, n_stores: r.nStores, n_quotes: r.nQuotes, fresh_offers: r.freshOffers, stale_offers: r.staleOffers,
          outlier_offers: r.outlierOffers, matched_offers: r.matchedOffers, matched_change_pct: r.matchedChangePct, composition_flag: r.compositionFlag,
          members: r.members, quality: r.quality, computed_at: new Date().toISOString(), closed: r.closed,
        }));
        await upsertRaw(tx, jsonRows);
        const after = await tx.execute<Row>(sql`SELECT master_product_id, day::text AS day, computed_at::text AS ca FROM price_daily_state WHERE (master_product_id, day) IN (${pairs(ok.map((r) => [r.productId, r.day]))})`);
        for (const r of after) gravMap[key(r.master_product_id, r.day)] = String(r.ca);
        for (const r of ok) if (!atuais.has(key(r.productId, r.day))) criadas.push(key(r.productId, r.day));
        gravadas += ok.length;
      });
    } catch (e) { falhas++; console.error('lote falhou:', e instanceof Error ? e.message : e); }
    if ((i / CHUNK) % 5 === 4) console.log(`  ${Math.min(i + CHUNK, prods.length)}/${prods.length}`);
  }
  const resumo = { produtos: prods.length, linhasAtuais: atuais.size, mudariam: mudou, iguais: igual, semLinhaIgnoradas: criar, mudancaSoNoDiaAberto: soAberto, gravadas, puladasPorGuarda: pulada, falhas, exemplos };
  console.log(resumo);
  if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply.');
  const lp = path.join(DIR, `medias-vendedor-fraco-log-${stamp}.json`);
  fs.writeFileSync(lp, JSON.stringify({ at: new Date().toISOString(), backup: bakPath, criadas, gravadas: gravMap, produtos: prods, resumo }, null, 2));
  console.log('log:', lp);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
export {};

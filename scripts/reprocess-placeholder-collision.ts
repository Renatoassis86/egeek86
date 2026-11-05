/**
 * REPROCESSAMENTO REVERSÍVEL do histórico diário das ofertas-placeholder do Mercado Livre afetadas pela colisão de
 * escrita (bug corrigido em produção em 2026-11-05 ~14:08 UTC, commit 7e39b4b). Autorização do dono: 2026-11-05.
 * Escreve SÓ em price_daily_offer, price_daily_state e price_min_events (derivadas). NUNCA toca em
 * affiliate_price_snapshots nem affiliate_offers. Sem migration: usa o schema existente.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-placeholder-collision.ts                       # dry-run (padrão): calcula tudo numa transação e DESFAZ
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-placeholder-collision.ts --apply               # grava + backup NDJSON + log
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-placeholder-collision.ts --revert <log.json>   # dry-run da reversão
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reprocess-placeholder-collision.ts --revert <log.json> --apply
 *   opções: --deploy-at 2026-11-05T14:08:00Z   instante da correção (fim do período contaminado)
 *           --offers 96396aef,b7129444,...      prefixos de id (padrão: as 4 ofertas autorizadas; 0885ff7a NÃO entra)
 *
 * REGRA: nada é inventado. O preço verdadeiro do placeholder durante a colisão não é recuperável, então o período
 * contaminado é EXCLUÍDO (critério em src/lib/pricing/collision-window.ts):
 *   - dias inteiros [início, dia do deploy): as linhas price_daily_offer da oferta são APAGADAS (a oferta some desses dias);
 *   - dia do deploy: a linha é RECALCULADA só com cotações >= instante do deploy (cotações reais) ou apagada se não há;
 *   - price_daily_state dos produtos afetados é recalculado pelo código existente (computeStatesForBatch) a partir do
 *     primeiro dia contaminado; as linhas anteriores (não legacy) são substituídas pelas recalculadas;
 *   - price_min_events 'reconstructed' ATRIBUÍDOS ao placeholder dentro da janela contaminada são INVALIDADOS (apagados;
 *     o valor era contaminado); os demais eventos ficam e só têm prev_min_cents religado à cadeia restante (derivado, sem
 *     inventar). NÃO se reconstrói evento novo: a reconstrução hoje não reproduz a de 03:03 UTC (status das ofertas mudou).
 * O job refresh-price-daily reagrega o dia corrente (e o dia a fechar) a partir de TODAS as cotações: se rodar depois deste
 * script ainda no dia do deploy, a linha do dia do deploy volta contaminada; rode este script de novo depois que o job
 * fechar esse dia (é idempotente).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contaminationStartDay, fullyExcludedDays, isAlternatingDay, type DayCycleStats } from '@/lib/pricing/collision-window';
import { addDays, computePeriodMetrics, spDay, spDayBounds } from '@/lib/pricing/daily-state';
import { computeStatesForBatch, upsertStates } from '@/server/pricing/price-daily';

type Tx = Pick<typeof db, 'execute'>;
type Row = Record<string, unknown>;

const argv = process.argv;
const APPLY = argv.includes('--apply');
const arg = (name: string) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
const DEPLOY_AT = new Date(arg('--deploy-at') ?? '2026-11-05T14:08:00Z');
const PREFIXES = (arg('--offers') ?? '96396aef,b7129444,bcf1419e,9d7addfd').split(',').map((s) => s.trim());
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.resolve('backup/dados');
const T = ['price_daily_offer', 'price_daily_state', 'price_min_events'] as const;

class DryRunRollback extends Error {}

const iso = (v: unknown) => new Date(v as string | Date);
const lit = (list: string[]) => sql.join(list.map((i) => sql`${i}`), sql`, `);

/** Informativo: este script não escreve em affiliate_offers; o backup que vale é o NDJSON próprio das 3 tabelas derivadas. */
function recentBackupOk(): string {
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^affiliate_offers.*\.ndjson$/.test(f));
  const newest = Math.max(0, ...files.map((f) => fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs));
  return newest ? `${((Date.now() - newest) / 3_600_000).toFixed(1)} h` : 'sem backup de affiliate_offers';
}

const money = (c: unknown) => (c == null ? '-' : (Number(c) / 100).toFixed(2));

interface OfferInfo { id: string; productId: string; status: string; sellerId: string | null; title: string }
interface OfferPlan extends OfferInfo { startDay: string | null; startDayStart: Date | null; fullDays: string[]; stats: DayCycleStats[]; postDeployAlt: number }

/** Impressão digital dos snapshots das ofertas (prova de que nenhuma cotação foi alterada). Só cotações anteriores a `before`. */
async function snapshotFingerprint(tx: Tx, offerIds: string[], before: Date) {
  const r = await tx.execute<Row>(sql`
    SELECT count(*)::int n, COALESCE(sum(price_cents), 0)::text sp, COALESCE(md5(string_agg(id::text || ':' || price_cents::text || ':' || collected_at::text, ',' ORDER BY id)), '') h
    FROM affiliate_price_snapshots WHERE offer_id IN (${lit(offerIds)}) AND collected_at < ${before.toISOString()}::timestamptz`);
  return { n: Number(r[0].n), sumPriceCents: String(r[0].sp), hash: String(r[0].h) };
}

async function planOffers(tx: Tx): Promise<OfferPlan[]> {
  const plans: OfferPlan[] = [];
  const deployDay = spDay(DEPLOY_AT);
  for (const p of PREFIXES) {
    const found = await tx.execute<Row>(sql`SELECT id, master_product_id, status::text AS status, seller_id, title FROM affiliate_offers WHERE id::text LIKE ${p + '%'}`);
    if (found.length !== 1) throw new Error(`Prefixo ${p}: ${found.length} ofertas (esperado 1).`);
    const o = found[0];
    const info: OfferInfo = { id: String(o.id), productId: String(o.master_product_id), status: String(o.status), sellerId: (o.seller_id as string | null) ?? null, title: String(o.title) };
    const st = await tx.execute<Row>(sql`
      WITH s AS (SELECT price_cents p, collected_at c FROM affiliate_price_snapshots WHERE offer_id = ${info.id} AND price_cents > 0 AND collected_at < ${DEPLOY_AT.toISOString()}::timestamptz),
      b AS (SELECT (c AT TIME ZONE 'America/Sao_Paulo')::date d, floor(extract(epoch from c) / 600) bk, count(DISTINCT p) dv FROM s GROUP BY 1, 2)
      SELECT d::text AS day, count(*)::int AS cycles, (count(*) FILTER (WHERE dv >= 2))::int AS c2, (count(*) FILTER (WHERE dv >= 3))::int AS c3 FROM b GROUP BY d ORDER BY d`);
    const stats: DayCycleStats[] = st.map((r) => ({ day: String(r.day), cycles: Number(r.cycles), cyclesGe2: Number(r.c2), cyclesGe3: Number(r.c3) }));
    const startDay = contaminationStartDay(stats);
    const post = await tx.execute<Row>(sql`
      SELECT count(*)::int n FROM (SELECT floor(extract(epoch from collected_at) / 600) bk FROM affiliate_price_snapshots
        WHERE offer_id = ${info.id} AND price_cents > 0 AND collected_at >= ${DEPLOY_AT.toISOString()}::timestamptz GROUP BY 1 HAVING count(DISTINCT price_cents) >= 2) x`);
    plans.push({
      ...info, startDay, startDayStart: startDay ? spDayBounds(startDay).start : null,
      fullDays: startDay ? fullyExcludedDays(startDay, deployDay, addDays) : [], stats, postDeployAlt: Number(post[0].n),
    });
  }
  return plans;
}

async function jsonRows(tx: Tx, table: string, where: ReturnType<typeof sql>): Promise<unknown[]> {
  const r = await tx.execute<{ j: unknown }>(sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(table)} t WHERE ${where} ORDER BY to_jsonb(t)::text`);
  return r.map((x) => x.j);
}

function writeNdjson(table: string, rows: unknown[]): string {
  const f = path.join(BACKUP_DIR, `reprocess-colisao-${stamp}-${table}.ndjson`);
  fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  return f;
}

interface StateSnap { day: string; avg: number | null; med: number | null; min: number | null; max: number | null; n: number; quality: string; closed: boolean }
const snapState = (r: Row): StateSnap => ({ day: String(r.day), avg: r.avg_cents == null ? null : Number(r.avg_cents), med: r.median_offer_day_cents == null ? null : Number(r.median_offer_day_cents), min: r.min_cents == null ? null : Number(r.min_cents), max: r.max_cents == null ? null : Number(r.max_cents), n: Number(r.n_offers), quality: String(r.quality), closed: r.closed === true });
const sameState = (a: StateSnap | undefined, b: StateSnap | undefined) => !!a && !!b && a.avg === b.avg && a.med === b.med && a.min === b.min && a.max === b.max && a.n === b.n && a.quality === b.quality && a.closed === b.closed;

async function loadStateSnaps(tx: Tx, pid: string, fromDay: string): Promise<{ snaps: StateSnap[]; members: Map<string, Record<string, number>> }> {
  const r = await tx.execute<Row>(sql`SELECT day::text AS day, avg_cents, median_offer_day_cents, min_cents, max_cents, n_offers, quality, closed, members FROM price_daily_state
    WHERE master_product_id = ${pid} AND day >= ${fromDay}::date AND quality <> 'legacy' ORDER BY day`);
  return { snaps: r.map(snapState), members: new Map(r.map((x) => [String(x.day), ((typeof x.members === 'string' ? JSON.parse(x.members) : x.members) ?? {}) as Record<string, number>])) };
}

function periodOf(members: Map<string, Record<string, number>>, snaps: StateSnap[]) {
  const days = snaps.filter((s) => s.quality === 'complete' || s.quality === 'partial').map((s) => ({ day: s.day, members: members.get(s.day) ?? {}, minCents: s.min }));
  const m = computePeriodMetrics(days, null);
  return { offerDays: m.offerDays, distinctOffers: m.distinctOffers, avgOfferDay: m.avgOfferDayCents == null ? null : Math.round(m.avgOfferDayCents), medianOfferDay: m.medianOfferDayCents };
}

async function main() {
  const ri = argv.indexOf('--revert');
  if (ri >= 0) return revert(argv[ri + 1]);
  const backupAge = recentBackupOk();
  const now = new Date();
  const today = spDay(now);
  const deployDay = spDay(DEPLOY_AT);
  const report: Record<string, unknown> = { mode: APPLY ? 'apply' : 'dry-run', at: now.toISOString(), deployAt: DEPLOY_AT.toISOString(), deployDay, today, backupAffiliateOffersAge: backupAge };
  const log: Record<string, unknown> = { ...report, status: 'pending', stamp, files: {} };
  const started = Date.now();

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      const plans = await planOffers(tx);
      const offerIds = plans.map((p) => p.id);
      const fpBefore = await snapshotFingerprint(tx, offerIds, now);
      report.snapshotsBefore = fpBefore;

      // ---------- 1) Período contaminado por oferta (SELECT) ----------
      const offerReport: unknown[] = [];
      for (const p of plans) {
        const rows = await tx.execute<Row>(sql`SELECT day::text AS day, median_cents, min_cents, max_cents, n_collected FROM price_daily_offer WHERE offer_id = ${p.id} ORDER BY day`);
        offerReport.push({
          offer: p.id, product: p.productId, status: p.status, titulo: p.title, inicio: p.startDay, diasExcluidosInteiros: p.fullDays,
          diaDoDeploy: deployDay, cotacoesAlternantesAposDeploy: p.postDeployAlt,
          diasDaOferta: p.stats.map((s) => ({ ...s, alternante: isAlternatingDay(s), linhaOfertaDia: rows.find((r) => r.day === s.day) ? `mediana ${money(rows.find((r) => r.day === s.day)!.median_cents)}` : null })),
        });
      }
      report.ofertas = offerReport;
      const noStart = plans.filter((p) => !p.startDay);
      if (noStart.length) throw new Error(`Oferta sem alternância detectada: ${noStart.map((p) => p.id).join(', ')}. Nada a reprocessar; verifique o prefixo.`);
      if (plans.some((p) => p.postDeployAlt > 0)) console.warn('AVISO: há ciclos com >= 2 preços distintos após o instante do deploy em alguma oferta; confira --deploy-at.');

      // ---------- 2) Estado ANTES (e controle: recálculo sem exclusão, para separar deriva de efeito) ----------
      const products = [...new Set(plans.map((p) => p.productId))];
      const prodStart = new Map<string, string>();
      for (const p of plans) { const cur = prodStart.get(p.productId); if (!cur || (p.startDay as string) < cur) prodStart.set(p.productId, p.startDay as string); }
      const before = new Map<string, Awaited<ReturnType<typeof loadStateSnaps>>>();
      for (const pid of products) before.set(pid, await loadStateSnaps(tx, pid, prodStart.get(pid) as string));

      // ---------- 3) Backup (linhas afetadas), lido antes de qualquer escrita ----------
      const offerWhere = sql`offer_id IN (${lit(offerIds)}) AND day >= ${plans.reduce((m, p) => ((p.startDay as string) < m ? (p.startDay as string) : m), '9999-12-31')}::date AND day <= ${deployDay}::date`;
      const bkOffer = await jsonRows(tx, 'price_daily_offer', offerWhere);
      const stateScope = products.map((pid) => ({ productId: pid, fromDay: prodStart.get(pid) as string }));
      const bkState: unknown[] = [];
      for (const s of stateScope) bkState.push(...(await jsonRows(tx, 'price_daily_state', sql`master_product_id = ${s.productId} AND day >= ${s.fromDay}::date AND quality <> 'legacy'`)));
      // Eventos 'reconstructed' do produto a partir do 1º dia contaminado (backup integral desse recorte)
      const evScope: Array<{ productId: string; fromAt: string }> = [];
      const bkEvents: unknown[] = [];
      for (const pid of products) {
        const fromAt = spDayBounds(prodStart.get(pid) as string).start;
        evScope.push({ productId: pid, fromAt: fromAt.toISOString() });
        bkEvents.push(...(await jsonRows(tx, 'price_min_events', sql`master_product_id = ${pid} AND source = 'reconstructed' AND at >= ${fromAt.toISOString()}::timestamptz`)));
      }
      report.backupRows = { price_daily_offer: bkOffer.length, price_daily_state: bkState.length, price_min_events: bkEvents.length };

      // Controle: recálculo SEM exclusão (separa a deriva natural do recálculo do efeito da exclusão)
      const control = new Map<string, Awaited<ReturnType<typeof computeStatesForBatch>>['rows']>();
      for (const s of stateScope) control.set(s.productId, (await computeStatesForBatch(tx, [s.productId], s.fromDay, today, now)).rows);

      // ---------- 4) Escrita: price_daily_offer ----------
      const delOffer = await tx.execute(sql`DELETE FROM price_daily_offer WHERE ${offerWhere}`);
      const rewritten: unknown[] = [];
      for (const p of plans) {
        const next = new Date(spDayBounds(deployDay).end);
        const res = await tx.execute<Row>(sql`
          INSERT INTO price_daily_offer (offer_id, master_product_id, day, median_cents, last_cents, min_cents, max_cents, n_collected, last_observed_at, computed_at)
          SELECT s.offer_id, o.master_product_id, ${deployDay}::date, percentile_disc(0.5) WITHIN GROUP (ORDER BY s.price_cents)::bigint,
                 (array_agg(s.price_cents ORDER BY s.collected_at DESC, s.id DESC))[1]::bigint, MIN(s.price_cents)::bigint, MAX(s.price_cents)::bigint, COUNT(*)::int, MAX(s.collected_at), now()
          FROM affiliate_price_snapshots s INNER JOIN affiliate_offers o ON o.id = s.offer_id
          WHERE s.offer_id = ${p.id} AND s.price_cents > 0 AND s.collected_at >= ${DEPLOY_AT.toISOString()}::timestamptz AND s.collected_at < ${next.toISOString()}::timestamptz
          GROUP BY s.offer_id, o.master_product_id
          RETURNING day::text AS day, median_cents, n_collected`);
        rewritten.push({ offer: p.id.slice(0, 8), diaDoDeploy: res[0] ? { mediana: money(res[0].median_cents), cotacoes: Number(res[0].n_collected) } : 'sem cotação após o deploy (linha apagada)' });
      }
      report.ofertaDiaApagadas = Number((delOffer as unknown as { count?: number }).count ?? 0);
      report.diaDoDeployReescrito = rewritten;

      // ---------- 5) Estado: recalcula pelo código existente; só regrava os dias em que a EXCLUSÃO muda a linha ----------
      const rowKey = (r: { avgCents: number | null; medianCents: number | null; minCents: number | null; maxCents: number | null; nOffers: number; quality: string; members: Record<string, number>; matchedOffers: number | null; matchedChangePct: number | null; compositionFlag: boolean | null }) =>
        JSON.stringify([r.avgCents, r.medianCents, r.minCents, r.maxCents, r.nOffers, r.quality, Object.entries(r.members).sort(), r.matchedOffers, r.matchedChangePct, r.compositionFlag]);
      const productReport: unknown[] = [];
      for (const s of stateScope) {
        const { rows: A } = await computeStatesForBatch(tx, [s.productId], s.fromDay, today, now);
        const C = control.get(s.productId)!;
        const aBy = new Map(A.map((r) => [r.day, r]));
        const cBy = new Map(C.map((r) => [r.day, r]));
        const effectDays = [...new Set([...aBy.keys(), ...cBy.keys()])].sort().filter((d) => {
          const a = aBy.get(d), c = cBy.get(d);
          return !a || !c || rowKey(a) !== rowKey(c);
        });
        let written = 0;
        for (const d of effectDays) {
          await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id = ${s.productId} AND day = ${d}::date AND quality <> 'legacy'`);
          const a = aBy.get(d);
          if (a) written += await upsertStates(tx, [a]);
        }
        const after = await loadStateSnaps(tx, s.productId, s.fromDay);
        const b = before.get(s.productId)!;
        const driftDays = C.filter((c) => { const x = b.snaps.find((y) => y.day === c.day); return !x || x.n !== c.nOffers || x.avg !== c.avgCents || x.min !== c.minCents; }).map((c) => c.day);
        productReport.push({
          product: s.productId, desde: s.fromDay, linhasAntes: b.snaps.length, linhasDepois: after.snaps.length, diasRegravados: effectDays, linhasRegravadas: written,
          derivaSemExclusaoDias: driftDays,
          periodoAntes: periodOf(b.members, b.snaps), periodoDepois: periodOf(after.members, after.snaps),
          diasAlterados: effectDays.map((d) => { const x = b.snaps.find((y) => y.day === d); const a = after.snaps.find((y) => y.day === d); return {
            dia: d, n: `${x?.n ?? '-'} -> ${a?.n ?? '-'}`, media: `${money(x?.avg)} -> ${money(a?.avg)}`, mediana: `${money(x?.med)} -> ${money(a?.med)}`,
            minimo: `${money(x?.min)} -> ${money(a?.min)}`, maximo: `${money(x?.max)} -> ${money(a?.max)}`, qualidade: `${x?.quality ?? '-'} -> ${a?.quality ?? '-'}`,
          }; }),
        });
      }
      report.produtos = productReport;

      // ---------- 6) Eventos: invalida os atribuídos ao placeholder na janela e religa prev_min_cents ----------
      const evReport: unknown[] = [];
      let evDeleted = 0;
      let evPrevFixed = 0;
      for (const sc of evScope) {
        const mine = plans.filter((p) => p.productId === sc.productId);
        let deleted = 0;
        for (const p of mine) {
          const del = await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id = ${sc.productId} AND source = 'reconstructed' AND offer_id = ${p.id}
            AND at >= ${(p.startDayStart as Date).toISOString()}::timestamptz AND at < ${DEPLOY_AT.toISOString()}::timestamptz`);
          deleted += Number((del as unknown as { count?: number }).count ?? 0);
        }
        const rest = await tx.execute<Row>(sql`SELECT id, at, min_cents, prev_min_cents FROM price_min_events WHERE master_product_id = ${sc.productId} AND source = 'reconstructed' ORDER BY at, id`);
        let fixed = 0;
        for (let i = 0; i < rest.length; i++) {
          if (iso(rest[i].at).getTime() < new Date(sc.fromAt).getTime()) continue;
          const expected = i === 0 ? null : Number(rest[i - 1].min_cents);
          const cur = rest[i].prev_min_cents == null ? null : Number(rest[i].prev_min_cents);
          if (expected !== cur) { await tx.execute(sql`UPDATE price_min_events SET prev_min_cents = ${expected} WHERE id = ${Number(rest[i].id)}`); fixed++; }
        }
        evDeleted += deleted;
        evPrevFixed += fixed;
        evReport.push({ product: sc.productId, backupNoRecorte: bkEvents.filter((e) => String((e as Row).master_product_id) === sc.productId).length, invalidadosAtribuidosAoPlaceholder: deleted, prevMinCentsReligados: fixed, restantesNoProduto: rest.length });
      }
      report.eventos = evReport;
      report.eventosApagados = evDeleted;
      report.eventosPrevReligados = evPrevFixed;

      // ---------- 7) Verificação: nenhuma cotação mudou ----------
      const fpAfter = await snapshotFingerprint(tx, offerIds, now);
      report.snapshotsAfter = fpAfter;
      report.snapshotsInalterados = JSON.stringify(fpBefore) === JSON.stringify(fpAfter);
      if (!report.snapshotsInalterados) throw new Error('Cotações mudaram dentro da transação: abortando.');

      if (APPLY) {
        log.files = { price_daily_offer: writeNdjson('price_daily_offer', bkOffer), price_daily_state: writeNdjson('price_daily_state', bkState), price_min_events: writeNdjson('price_min_events', bkEvents) };
        Object.assign(log, { offers: plans.map((p) => ({ id: p.id, productId: p.productId, startDay: p.startDay, fullDays: p.fullDays })), offerKeysScope: { offerIds, fromDay: plans.reduce((m, p) => ((p.startDay as string) < m ? (p.startDay as string) : m), '9999-12-31'), toDay: deployDay }, stateScope, evScope, backupRows: report.backupRows });
      }
      if (!APPLY) throw new DryRunRollback();
    }, { isolationLevel: 'repeatable read' });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
    console.log('DRY-RUN: transação DESFEITA, nada foi gravado. Use --apply.');
  }
  report.elapsedMs = Date.now() - started;
  if (APPLY) {
    log.status = 'committed';
    log.report = report;
    const f = path.join(BACKUP_DIR, `reprocess-colisao-log-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify(log, null, 2));
    console.log(`Gravado. Log (reversão): ${f}`);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

async function readNdjson(f: string): Promise<unknown[]> {
  const t = fs.readFileSync(path.resolve(f), 'utf8').trim();
  return t ? t.split('\n').map((l) => JSON.parse(l)) : [];
}

async function revert(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<string, any>;
  if (log.status !== 'committed') throw new Error('Log sem status committed: nada a reverter.');
  const bk = { price_daily_offer: await readNdjson(log.files.price_daily_offer), price_daily_state: await readNdjson(log.files.price_daily_state), price_min_events: await readNdjson(log.files.price_min_events) };
  const out: Record<string, unknown> = { mode: APPLY ? 'revert-apply' : 'revert-dry-run' };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      const sc = log.offerKeysScope as { offerIds: string[]; fromDay: string; toDay: string };
      await tx.execute(sql`DELETE FROM price_daily_offer WHERE offer_id IN (${lit(sc.offerIds)}) AND day >= ${sc.fromDay}::date AND day <= ${sc.toDay}::date`);
      if (bk.price_daily_offer.length) await tx.execute(sql`INSERT INTO price_daily_offer SELECT * FROM jsonb_populate_recordset(NULL::price_daily_offer, ${JSON.stringify(bk.price_daily_offer)}::jsonb)`);
      for (const s of log.stateScope as Array<{ productId: string; fromDay: string }>) await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id = ${s.productId} AND day >= ${s.fromDay}::date AND quality <> 'legacy'`);
      if (bk.price_daily_state.length) await tx.execute(sql`INSERT INTO price_daily_state SELECT * FROM jsonb_populate_recordset(NULL::price_daily_state, ${JSON.stringify(bk.price_daily_state)}::jsonb)`);
      for (const e of log.evScope as Array<{ productId: string; fromAt: string }>) await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id = ${e.productId} AND source = 'reconstructed' AND at >= ${e.fromAt}::timestamptz`);
      if (bk.price_min_events.length) await tx.execute(sql`INSERT INTO price_min_events OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::price_min_events, ${JSON.stringify(bk.price_min_events)}::jsonb)`);
      // Verificação: o que está no banco agora é idêntico ao backup (comparação por conteúdo).
      const checks: Record<string, string> = {};
      const nowOffer = await jsonRows(tx, 'price_daily_offer', sql`offer_id IN (${lit(sc.offerIds)}) AND day >= ${sc.fromDay}::date AND day <= ${sc.toDay}::date`);
      checks.price_daily_offer = nowOffer.length === bk.price_daily_offer.length && sameSet(nowOffer, bk.price_daily_offer) ? 'identico' : `diferente (${nowOffer.length} no banco, ${bk.price_daily_offer.length} no backup)`;
      let nowState: unknown[] = [];
      for (const s of log.stateScope as Array<{ productId: string; fromDay: string }>) nowState.push(...(await jsonRows(tx, 'price_daily_state', sql`master_product_id = ${s.productId} AND day >= ${s.fromDay}::date AND quality <> 'legacy'`)));
      checks.price_daily_state = nowState.length === bk.price_daily_state.length && sameSet(nowState, bk.price_daily_state) ? 'identico' : `diferente (${nowState.length} no banco, ${bk.price_daily_state.length} no backup)`;
      let nowEv: unknown[] = [];
      for (const e of log.evScope as Array<{ productId: string; fromAt: string }>) nowEv.push(...(await jsonRows(tx, 'price_min_events', sql`master_product_id = ${e.productId} AND source = 'reconstructed' AND at >= ${e.fromAt}::timestamptz`)));
      checks.price_min_events = nowEv.length === bk.price_min_events.length && sameSet(nowEv, bk.price_min_events) ? 'identico' : `diferente (${nowEv.length} no banco, ${bk.price_min_events.length} no backup)`;
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

function sameSet(a: unknown[], b: unknown[]): boolean {
  const k = (x: unknown) => JSON.stringify(x);
  const sa = a.map(k).sort();
  const sb = b.map(k).sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});

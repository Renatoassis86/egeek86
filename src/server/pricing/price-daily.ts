import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  OFFER_ACTIVE_DAYS,
  PRICE_DAILY_REGIME_START,
  addDays,
  computeDayState,
  computeLiveMin,
  nextMinEvent,
  spDay,
  withTransition,
  type DayState,
  type MinEventDraft,
  type OfferDayRow,
  type OfferInput,
  type PeriodDay,
  type ReconOffer,
} from '@/lib/pricing/daily-state';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { avgExcludedFlagSql } from '@/server/queries/public-offers';
import { AMAZON_FRESH_MAX_AGE_MS, amazonScope, getAmazonMode, isAmazonSlug, type AmazonMode, type AmazonScope } from '@/lib/pricing/amazon-mode';
import { amazonScopeSql } from '@/server/pricing/amazon-scope-sql';
import type { AmazonShadowDiff } from '@/lib/pricing/amazon-shadow';

/**
 * Camada de banco das métricas diárias (price_daily_offer / price_daily_state / price_min_events; migration 0024).
 * Só escreve nas três tabelas derivadas. NUNCA altera nem apaga affiliate_price_snapshots/offers.
 * Toda regra numérica vem de `src/lib/pricing/daily-state.ts`; a elegibilidade, de `eligibility-sql.ts`.
 * Datas: o pool do app devolve timestamptz/date como STRING (src/lib/db/index.ts); aqui tudo é convertido na borda.
 */

/** Executor mínimo: o `db` do app ou uma transação do drizzle. */
export type Exec = Pick<typeof db, 'execute'>;
type Row = Record<string, unknown>;

const ids = (list: string[]) => sql.join(list.map((i) => sql`${i}`), sql`, `);
const iso = (v: unknown) => new Date(v as string | Date);
const count = (res: unknown) => Number((res as { count?: number }).count ?? 0);

// ------------------------------------------------------------------------------------------------
// 1) price_daily_offer
// ------------------------------------------------------------------------------------------------

/**
 * Agrega as cotações REAIS de [fromDay, toDay] (inclusive, dia civil America/Sao_Paulo) em price_daily_offer,
 * uma linha por oferta por dia. Idempotente (ON CONFLICT recalcula a linha). `offerId` limita a uma oferta
 * (gancho da coleta). NUNCA chamar para dia com estado fechado.
 */
export async function upsertOfferDays(exec: Exec, fromDay: string, toDay: string, offerId?: string): Promise<number> {
  const res = await exec.execute(sql`
    INSERT INTO price_daily_offer (offer_id, master_product_id, day, median_cents, last_cents, min_cents, max_cents, n_collected, last_observed_at, computed_at)
    SELECT s.offer_id, o.master_product_id, d.day,
           percentile_disc(0.5) WITHIN GROUP (ORDER BY s.price_cents)::bigint,
           (array_agg(s.price_cents ORDER BY s.collected_at DESC, s.id DESC))[1]::bigint,
           MIN(s.price_cents)::bigint, MAX(s.price_cents)::bigint, COUNT(*)::int, MAX(s.collected_at), now()
    FROM affiliate_price_snapshots s
    INNER JOIN affiliate_offers o ON o.id = s.offer_id
    CROSS JOIN LATERAL (SELECT (s.collected_at AT TIME ZONE 'America/Sao_Paulo')::date AS day) d
    WHERE s.collected_at >= (${fromDay}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND s.collected_at <  (${toDay}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND s.price_cents > 0
      ${offerId ? sql`AND s.offer_id = ${offerId}` : sql``}
    GROUP BY s.offer_id, o.master_product_id, d.day
    ON CONFLICT (offer_id, day) DO UPDATE SET
      master_product_id = EXCLUDED.master_product_id, median_cents = EXCLUDED.median_cents, last_cents = EXCLUDED.last_cents,
      min_cents = EXCLUDED.min_cents, max_cents = EXCLUDED.max_cents, n_collected = EXCLUDED.n_collected,
      last_observed_at = EXCLUDED.last_observed_at, computed_at = now()
  `);
  return count(res);
}

// ------------------------------------------------------------------------------------------------
// 2) Leitura das ofertas elegíveis
// ------------------------------------------------------------------------------------------------

/**
 * Ofertas ELEGÍVEIS dos produtos com as linhas oferta-dia de [fromDay, ...) (sem teto: cotação posterior prova oferta viva).
 * PONTO ÚNICO de leitura das ofertas das métricas públicas (job, gancho, selo, gráfico, cartões). `opts.amazon` decide a Amazon:
 * padrão = `amazonScope()` da flag PRICE_AMAZON_MODE (`off`/`shadow` excluem, `on` inclui só games). Com a Amazon dentro, o frescor dela
 * é por confirmação de preço (`last_price_confirmed_at`, 24 h) e ausência na busca (`consecutive_miss_count` > 0) a deixa inativa.
 */
export async function loadOffers(exec: Exec, productIds: string[], fromDay: string, opts: { amazon?: AmazonScope } = {}): Promise<Map<string, OfferInput[]>> {
  const out = new Map<string, OfferInput[]>();
  if (!productIds.length) return out;
  const scope = opts.amazon ?? amazonScope();
  const rows = await exec.execute<Row>(sql`
    SELECT o.master_product_id, o.id AS offer_id, o.status = 'active' AS active, o.network_id, o.seller_id,
           ${avgExcludedFlagSql('o')} AS avg_excluded,
           n.slug AS net_slug, o.last_price_confirmed_at, o.consecutive_miss_count AS miss_count,
           COALESCE(o.seller_id::text, 'rede:' || o.network_id::text) AS store_key,
           d.day::text AS day, d.median_cents, d.last_cents, d.min_cents, d.max_cents, d.n_collected, d.last_observed_at
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    INNER JOIN price_daily_offer d ON d.offer_id = o.id AND d.day >= ${fromDay}::date
    WHERE o.master_product_id IN (${ids(productIds)}) AND ${eligibleOfferSql('o')} AND ${amazonScopeSql(scope, 'o')}
    ORDER BY o.id, d.day
  `);
  const byOffer = new Map<string, OfferInput>();
  for (const r of rows) {
    const oid = String(r.offer_id);
    let o = byOffer.get(oid);
    if (!o) {
      const amazon = isAmazonSlug(String(r.net_slug));
      o = {
        offerId: oid,
        storeKey: String(r.store_key),
        networkId: (r.network_id as string | null) ?? null,
        sellerId: (r.seller_id as string | null) ?? null,
        active: r.active === true && !(amazon && Number(r.miss_count ?? 0) > 0),
        isAmazon: amazon,
        avgExcluded: r.avg_excluded === true,
        freshness: amazon && r.last_price_confirmed_at ? { confirmedAt: iso(r.last_price_confirmed_at), maxAgeMs: AMAZON_FRESH_MAX_AGE_MS } : null,
        rows: [],
      };
      byOffer.set(oid, o);
      const pid = String(r.master_product_id);
      const arr = out.get(pid) ?? [];
      arr.push(o);
      out.set(pid, arr);
    }
    const row: OfferDayRow = {
      day: String(r.day),
      medianCents: Number(r.median_cents),
      lastCents: Number(r.last_cents),
      minCents: Number(r.min_cents),
      maxCents: Number(r.max_cents),
      nCollected: Number(r.n_collected),
      lastObservedAt: iso(r.last_observed_at),
    };
    o.rows.push(row);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// 3) price_daily_state
// ------------------------------------------------------------------------------------------------

export interface StateRow extends DayState {
  productId: string;
  closed: boolean;
}

/**
 * Grava estados. `ON CONFLICT ... WHERE closed = false`: dia FECHADO nunca é reescrito, nem por corrida entre
 * ciclos. Devolve quantas linhas foram gravadas (as puladas por estarem fechadas não contam).
 */
export async function upsertStates(exec: Exec, rows: StateRow[]): Promise<number> {
  if (!rows.length) return 0;
  const values = rows.map(
    (r) => sql`(${r.productId}::uuid, ${r.day}::date, ${r.minCents}::bigint, ${r.minOfferId}::uuid, ${r.avgCents}::numeric, ${r.medianCents}::numeric,
      ${r.maxCents}::bigint, ${r.nOffers}::int, ${r.nStores}::int, ${r.nQuotes}::int, ${r.freshOffers}::int, ${r.staleOffers}::int, ${r.outlierOffers}::int,
      ${r.matchedOffers}::int, ${r.matchedChangePct}::numeric, ${r.compositionFlag}::boolean, ${JSON.stringify(r.members)}::jsonb,
      ${r.quality}, now(), ${r.closed})`
  );
  const res = await exec.execute(sql`
    INSERT INTO price_daily_state (master_product_id, day, min_cents, min_offer_id, avg_cents, median_offer_day_cents, max_cents, n_offers, n_stores, n_quotes,
      fresh_offers, stale_offers, outlier_offers, matched_offers, matched_change_pct, composition_flag, members, quality, computed_at, closed)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (master_product_id, day) DO UPDATE SET
      min_cents = EXCLUDED.min_cents, min_offer_id = EXCLUDED.min_offer_id, avg_cents = EXCLUDED.avg_cents,
      median_offer_day_cents = EXCLUDED.median_offer_day_cents, max_cents = EXCLUDED.max_cents, n_offers = EXCLUDED.n_offers,
      n_stores = EXCLUDED.n_stores, n_quotes = EXCLUDED.n_quotes, fresh_offers = EXCLUDED.fresh_offers, stale_offers = EXCLUDED.stale_offers,
      outlier_offers = EXCLUDED.outlier_offers, matched_offers = EXCLUDED.matched_offers, matched_change_pct = EXCLUDED.matched_change_pct,
      composition_flag = EXCLUDED.composition_flag, members = EXCLUDED.members, quality = EXCLUDED.quality, computed_at = now(), closed = EXCLUDED.closed
    WHERE price_daily_state.closed = false
  `);
  return count(res);
}

/** Estados do dia `day` já gravados (base do casamento com o dia seguinte). */
async function loadPrevStates(exec: Exec, productIds: string[], day: string): Promise<Map<string, Pick<DayState, 'avgCents' | 'members' | 'quality'>>> {
  const out = new Map<string, Pick<DayState, 'avgCents' | 'members' | 'quality'>>();
  if (!productIds.length || day < PRICE_DAILY_REGIME_START) return out;
  const rows = await exec.execute<Row>(sql`
    SELECT master_product_id, avg_cents, members, quality FROM price_daily_state
    WHERE day = ${day}::date AND master_product_id IN (${ids(productIds)})
  `);
  for (const r of rows) {
    out.set(String(r.master_product_id), {
      avgCents: r.avg_cents == null ? null : Number(r.avg_cents),
      members: (typeof r.members === 'string' ? JSON.parse(r.members) : r.members) as Record<string, number> ?? {},
      quality: r.quality as DayState['quality'],
    });
  }
  return out;
}

/**
 * Calcula (sem gravar) os estados de um lote de produtos para os dias [fromDay, toDay], em ordem, encadeando a
 * decomposição com o dia anterior (o do banco, se `fromDay` é o primeiro; senão o recém-calculado). Só devolve
 * linha para o produto/dia se há alguma oferta elegível na janela de 7 dias (sem linha = lacuna).
 * A Amazon segue a flag PRICE_AMAZON_MODE (`opts.mode` para testes): `off`/`shadow` gravam o estado SEM Amazon; `on` COM. Em `shadow`
 * devolve também `shadow` (comparação de HOJE, só produtos que têm Amazon).
 */
export async function computeStatesForBatch(
  exec: Exec,
  productIds: string[],
  fromDay: string,
  toDay: string,
  now: Date,
  opts: { mode?: AmazonMode } = {}
): Promise<{ rows: StateRow[]; offersByProduct: Map<string, OfferInput[]>; shadow: AmazonShadowDiff[] }> {
  const mode = opts.mode ?? getAmazonMode();
  const today = spDay(now);
  const since = addDays(fromDay, -OFFER_ACTIVE_DAYS);
  const offersByProduct = await loadOffers(exec, productIds, since, { amazon: amazonScope(mode) });
  const prevDb = await loadPrevStates(exec, [...offersByProduct.keys()], addDays(fromDay, -1));
  const out: StateRow[] = [];
  const todayState = new Map<string, DayState>();
  for (const [pid, offers] of offersByProduct) {
    let prev: Pick<DayState, 'avgCents' | 'members' | 'quality'> | null = prevDb.get(pid) ?? null;
    for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
      if (day < PRICE_DAILY_REGIME_START || day > today) continue;
      let st = computeDayState(day, now, offers);
      if (st.freshOffers === 0 && st.staleOffers === 0) {
        prev = null;
        continue;
      }
      st = withTransition(st, prev);
      prev = st;
      out.push({ ...st, productId: pid, closed: day < today });
      if (day === today) todayState.set(pid, st);
    }
  }
  const shadow: AmazonShadowDiff[] = [];
  if (mode === 'shadow' && toDay >= today) {
    const withAmz = await loadOffers(exec, productIds, since, { amazon: 'include' });
    for (const [pid, offers] of withAmz) {
      const amz = offers.filter((o) => o.isAmazon);
      if (!amz.length) continue;
      const w = computeDayState(today, now, offers);
      const pub = todayState.get(pid) ?? computeDayState(today, now, offers.filter((o) => !o.isAmazon));
      const amzIds = new Set(amz.map((o) => o.offerId));
      shadow.push({
        productId: pid,
        day: today,
        amazonOffers: Object.keys(w.members).filter((id) => amzIds.has(id)).length,
        nPublic: pub.nOffers,
        nWith: w.nOffers,
        avgPublicCents: pub.avgCents,
        avgWithCents: w.avgCents,
        avgChangePct: pub.avgCents != null && w.avgCents != null && pub.avgCents > 0 ? Math.round((w.avgCents / pub.avgCents - 1) * 10_000) / 100 : null,
        minPublicCents: pub.minCents,
        minWithCents: w.minCents,
        amazonIsMin: w.minOfferId != null && amzIds.has(w.minOfferId),
      });
    }
  }
  return { rows: out, offersByProduct, shadow };
}

/** Dias do produto na janela [fromDay, toDay] para as métricas do período (lê só a tabela de estado). */
export async function loadPeriodDays(exec: Exec, productId: string, fromDay: string, toDay: string): Promise<Array<PeriodDay & { minOfferId: string | null; quality: string }>> {
  const rows = await exec.execute<Row>(sql`
    SELECT day::text AS day, members, min_cents, min_offer_id, quality FROM price_daily_state
    WHERE master_product_id = ${productId} AND day BETWEEN ${fromDay}::date AND ${toDay}::date AND quality IN ('complete', 'partial')
    ORDER BY day
  `);
  return rows.map((r) => ({
    day: String(r.day),
    members: ((typeof r.members === 'string' ? JSON.parse(r.members) : r.members) ?? {}) as Record<string, number>,
    minCents: r.min_cents == null ? null : Number(r.min_cents),
    minOfferId: (r.min_offer_id as string | null) ?? null,
    quality: String(r.quality),
  }));
}

/** Mesma leitura de `loadPeriodDays` para VÁRIOS produtos em UMA consulta (evita N idas ao banco em série). Produto sem dia fica com lista vazia. */
export async function loadPeriodDaysMany(exec: Exec, productIds: string[], fromDay: string, toDay: string): Promise<Map<string, Array<PeriodDay & { minOfferId: string | null; quality: string }>>> {
  const out = new Map<string, Array<PeriodDay & { minOfferId: string | null; quality: string }>>();
  if (!productIds.length) return out;
  const rows = await exec.execute<Row>(sql`
    SELECT master_product_id AS pid, day::text AS day, members, min_cents, min_offer_id, quality FROM price_daily_state
    WHERE master_product_id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)}) AND day BETWEEN ${fromDay}::date AND ${toDay}::date AND quality IN ('complete', 'partial')
    ORDER BY master_product_id, day
  `);
  for (const r of rows) {
    const pid = String(r.pid);
    const list = out.get(pid) ?? out.set(pid, []).get(pid)!;
    list.push({
      day: String(r.day),
      members: ((typeof r.members === 'string' ? JSON.parse(r.members) : r.members) ?? {}) as Record<string, number>,
      minCents: r.min_cents == null ? null : Number(r.min_cents),
      minOfferId: (r.min_offer_id as string | null) ?? null,
      quality: String(r.quality),
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// 4) price_min_events
// ------------------------------------------------------------------------------------------------

export async function insertEvents(exec: Exec, productId: string, events: MinEventDraft[], source: 'live' | 'reconstructed'): Promise<number> {
  if (!events.length) return 0;
  const values = events.map(
    (e) => sql`(${productId}::uuid, ${e.at.toISOString()}::timestamptz, ${e.minCents}::bigint, ${e.prevMinCents}::bigint, ${e.offerId}::uuid, ${e.networkId}::uuid, ${e.sellerId}::uuid, ${source}, ${e.quality})`
  );
  const res = await exec.execute(sql`
    INSERT INTO price_min_events (master_product_id, at, min_cents, prev_min_cents, offer_id, network_id, seller_id, source, quality)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (master_product_id, at, min_cents, source) DO NOTHING
  `);
  return count(res);
}

/**
 * Detecta e grava a mudança do menor preço elegível de UM produto (gancho da coleta e fallback do job).
 * Sob lock por produto: lê o último evento, calcula o menor preço vigente (ofertas ativas, frescas, plausíveis)
 * e grava um evento SE o mínimo mudou. Barato: um produto, linhas oferta-dia dos últimos 3 dias.
 */
export async function syncMinEvent(productId: string, now = new Date()): Promise<MinEventDraft | null> {
  return db.transaction(async (tx) => {
    const got = await tx.execute<{ locked: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtext(${'pme:' + productId})) AS locked`);
    if (!got[0]?.locked) return null; // outro processo já trata este produto
    const offers = (await loadOffers(tx, [productId], addDays(spDay(now), -3))).get(productId) ?? [];
    const live = computeLiveMin(offers, now);
    const lastRows = await tx.execute<Row>(sql`
      SELECT at, min_cents FROM price_min_events WHERE master_product_id = ${productId} ORDER BY at DESC, id DESC LIMIT 1
    `);
    const last = lastRows[0] ? { at: iso(lastRows[0].at), minCents: Number(lastRows[0].min_cents) } : null;
    const ev = nextMinEvent(last, live, now);
    if (!ev) return null;
    await insertEvents(tx, productId, [ev], 'live');
    return ev;
  });
}

/** Snapshots reais de um lote de produtos desde `fromAtIso` - 48 h, para reconstruir eventos. */
export async function loadReconOffers(exec: Exec, productIds: string[], fromAtIso: string): Promise<Map<string, ReconOffer[]>> {
  const out = new Map<string, ReconOffer[]>();
  if (!productIds.length) return out;
  const rows = await exec.execute<Row>(sql`
    SELECT o.master_product_id, o.id AS offer_id, o.status = 'active' AS active, o.network_id, o.seller_id, s.collected_at, s.price_cents,
           n.slug AS net_slug, o.last_price_confirmed_at
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    INNER JOIN affiliate_price_snapshots s ON s.offer_id = o.id
    WHERE o.master_product_id IN (${ids(productIds)}) AND ${eligibleOfferSql('o')} AND ${amazonScopeSql(amazonScope(), 'o')}
      AND s.price_cents > 0 AND s.collected_at >= ${fromAtIso}::timestamptz - interval '48 hours'
    ORDER BY o.master_product_id, o.id, s.collected_at, s.id
  `);
  const by = new Map<string, ReconOffer>();
  for (const r of rows) {
    const oid = String(r.offer_id);
    let o = by.get(oid);
    if (!o) {
      o = {
        offerId: oid,
        networkId: (r.network_id as string | null) ?? null,
        sellerId: (r.seller_id as string | null) ?? null,
        active: r.active === true,
        freshness: isAmazonSlug(String(r.net_slug)) && r.last_price_confirmed_at ? { confirmedAt: iso(r.last_price_confirmed_at), maxAgeMs: AMAZON_FRESH_MAX_AGE_MS } : null,
        snaps: [],
      };
      by.set(oid, o);
      const pid = String(r.master_product_id);
      const arr = out.get(pid) ?? [];
      arr.push(o);
      out.set(pid, arr);
    }
    o.snaps.push({ at: iso(r.collected_at), priceCents: Number(r.price_cents) });
  }
  return out;
}

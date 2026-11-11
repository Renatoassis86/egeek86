import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { loadOffers, loadPeriodDays } from '@/server/pricing/price-daily';
import { addDays, computePeriodMetrics, ownSeriesMedian, spDay, PRICE_DAILY_REGIME_START } from '@/lib/pricing/daily-state';
import { AMAZON_OWN_MIN_DAYS, AMAZON_OWN_WINDOW_DAYS, amazonCountsIn, amazonScope, getAmazonMode, type AmazonMode } from '@/lib/pricing/amazon-mode';
import { readPlatform } from '@/lib/catalog/platform';
import { isVertical } from '@/lib/catalog/verticais';
import { getAdTag } from '@/lib/messaging/group-config';
import { loadShopeeCampaignUrl } from '@/server/collector/shopee-campaigns';
import { buildPlatformCandidates } from '@/lib/messaging/group-platform';
import {
  RULES,
  amazonLoopPaused,
  applyLimits,
  buildDailySummary,
  composeRadar,
  detectMovement,
  evaluateProductV2,
  productDedupBlock,
  type Blocked,
  type Candidate,
  type DayPoint,
  type LimitPlan,
  type MessageClass,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '@/lib/messaging/group-rules';

/**
 * DETECTOR (modo dry) das mensagens para grupos. SOMENTE LEITURA: nunca escreve no banco, nunca envia.
 * Gatilhos e limites vivem em `src/lib/messaging/group-rules.ts` (puro e testado); aqui só se carregam os fatos reais.
 * Frescor: `last_price_confirmed_at` (a API devolveu preço), não `last_checked_at`.
 * Média: a MESMA do selo e do gráfico (price_daily_state.members -> computePeriodMetrics, janela de 30 dias, cada oferta vale 1 por dia).
 * Menor preço: price_min_events (ADR 0004).
 */

type Row = Record<string, unknown>;

const PLATFORM_LABELS: Record<string, string> = {
  switch_1: 'Switch',
  switch_2: 'Switch 2',
  ps4: 'PS4',
  ps5: 'PS5',
  xbox_one: 'Xbox One',
  xbox_series: 'Xbox Series',
  xbox_360: 'Xbox 360',
};

export interface DetectOptions {
  now?: Date;
  /** Departamentos. Padrão: só games (nichos seguem em review). */
  verticals?: string[];
  /** Idade máxima do preço confirmado (minutos). 120 na detecção, 30 no envio. */
  maxAgeMin?: number;
  /** Janela dos eventos de queda do menor preço (horas). */
  eventWindowHours?: number;
  /** Restringe a estes produtos (revalidação no envio). */
  productIds?: string[];
  /** Histórico de envios do canal (limites). Padrão: lê group_messages se existir. */
  history?: SentRecord[];
  /** Teto de produtos avaliados por execução (proteção de tempo). */
  maxProducts?: number;
  adTag?: string;
  /** Frescor máximo das ofertas Amazon (60 min na detecção, 40 no envio). */
  amazonMaxAgeMin?: number;
  /** Histórico inclui as decisões simuladas 'enviaria' (modo sombra). */
  includeSimulated?: boolean;
  /** Ofertas cujo preço acabou de ser conferido AO VIVO na API oficial (reconferência do envio): dispensam o intervalo de 15 min entre coletas. */
  liveVerifiedOfferIds?: string[];
  /** Gera as mensagens de plataforma (P1 a P5). Padrão: sim, quando a migration 0031 está aplicada. */
  includePlatform?: boolean;
}

export interface DetectionResult {
  generatedAt: string;
  mode: 'dry';
  config: { verticals: string[]; maxAgeMin: number; eventWindowHours: number; adTag: string; amazonMaxAgeMin: number; amazonPaused: boolean; amazonLastRunAt: string | null; amazonMode?: AmazonMode };
  counts: { productsEvaluated: number; candidates: number; auto: number; review: number; notSendable: number; blocked: number };
  candidates: Candidate[];
  blocked: Blocked[];
  plan: LimitPlan;
  /** Histórico de envios usado nos limites (para o chamador revalidar com o mesmo contexto). */
  history: SentRecord[];
  historySource: 'group_messages' | 'nenhum (tabela ausente)' | 'parametro';
  warnings: string[];
}

const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
const txtList = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

export async function groupMessagesTableExists(): Promise<boolean> {
  const rows = await db.execute<Row>(sql`SELECT to_regclass('public.group_messages') IS NOT NULL AS ok`);
  return rows[0]?.ok === true;
}

let v2Cache: { at: number; ok: boolean } | null = null;

/**
 * Migration 0030 (colunas novas de group_messages + tabelas group_member_counts e group_offer_watch) já foi aplicada?
 * Sem ela o código cai no comportamento da 0028 (propostas manuais) e a automação (shadow/on) fica recusada.
 */
export async function groupMessagesV2Ready(): Promise<boolean> {
  if (v2Cache && Date.now() - v2Cache.at < 60_000) return v2Cache.ok;
  let ok = false;
  try {
    const rows = await db.execute<Row>(sql`
      SELECT (
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name = 'msg_class')
        AND to_regclass('public.group_member_counts') IS NOT NULL
        AND to_regclass('public.group_offer_watch') IS NOT NULL
      ) AS ok
    `);
    ok = rows[0]?.ok === true;
  } catch {
    ok = false;
  }
  v2Cache = { at: Date.now(), ok };
  return ok;
}

let onda2Cache: { at: number; ok: boolean } | null = null;

/** Migration 0031 (planned_at e colunas live_* de group_messages) aplicada? Sem ela o motor só deixa de gravar esses campos. */
export async function groupMessagesOnda2Ready(): Promise<boolean> {
  if (onda2Cache && Date.now() - onda2Cache.at < 60_000) return onda2Cache.ok;
  let ok = false;
  try {
    const rows = await db.execute<Row>(sql`
      SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name IN ('planned_at', 'live_checked_at', 'live_price_cents', 'live_note')) = 4 AS ok
    `);
    ok = rows[0]?.ok === true;
  } catch {
    ok = false;
  }
  onda2Cache = { at: Date.now(), ok };
  return ok;
}

/** Último lote da coleta assistida da Amazon (collector_runs job 'amazon-assistida', status ok). */
export async function loadAmazonLastRun(): Promise<Date | null> {
  const rows = await db.execute<Row>(sql`
    SELECT max(COALESCE(finished_at, started_at)) AS at FROM collector_runs WHERE job = 'amazon-assistida' AND status = 'ok'
  `);
  const v = rows[0]?.at;
  return v ? new Date(v as string | Date) : null;
}

/**
 * Envios das últimas 7 dias do canal (a janela de 7 dias serve ao cartão; os demais limites olham 24/48 h).
 * Conta 'enviada' e 'enviando' (envio em curso de outra execução: os limites o enxergam). Com `includeSimulated`
 * (modo sombra), as decisões 'simulada' com estado 'enviaria' valem como envio, para a simulação respeitar os tetos.
 * Radar: um registro da mensagem (conta nos tetos) + um registro por item (só para o dedup por produto).
 * [] se a tabela ainda não existe.
 */
export async function loadSentHistory(
  channel: 'tg' | 'wa',
  now: Date,
  opts: { includeSimulated?: boolean; excludeId?: string } = {}
): Promise<{ records: SentRecord[]; source: DetectionResult['historySource'] }> {
  if (!(await groupMessagesTableExists())) return { records: [], source: 'nenhum (tabela ausente)' };
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const v2 = await groupMessagesV2Ready();
  const statuses = opts.includeSimulated && v2 ? ['enviada', 'enviando', 'simulada'] : v2 ? ['enviada', 'enviando'] : ['enviada'];
  const rows = await db.execute<Row>(
    v2
      ? sql`
    SELECT master_product_id, price_cents_detected, COALESCE(sent_at, created_at) AS at, trigger, msg_class, is_sound, has_card,
           candidate ->> 'networkSlug' AS network_slug, candidate -> 'items' AS items, status, sim_state,
           vertical AS vert, candidate ->> 'platformLabel' AS platform_label,
           CASE WHEN trigger ~ '^P[1-5]$' THEN candidate ->> 'masterProductId' END AS plat_pid
    FROM group_messages
    WHERE channel = ${channel} AND status IN (${sql.join(statuses.map((x) => sql`${x}`), sql`, `)})
      AND COALESCE(sent_at, created_at) >= ${since}::timestamptz
      AND (${opts.excludeId ?? null}::uuid IS NULL OR id <> ${opts.excludeId ?? null}::uuid)
  `
      : sql`
    SELECT master_product_id, price_cents_detected, sent_at AS at, trigger, NULL AS msg_class, false AS is_sound, false AS has_card,
           candidate ->> 'networkSlug' AS network_slug, NULL AS items, status, NULL AS sim_state,
           vertical AS vert, candidate ->> 'platformLabel' AS platform_label
    FROM group_messages
    WHERE channel = ${channel} AND status = 'enviada' AND sent_at >= ${since}::timestamptz
  `
  );
  const records: SentRecord[] = [];
  for (const r of rows) {
    if (r.status === 'simulada' && !String(r.sim_state ?? '').startsWith('enviaria')) continue;
    const at = new Date(r.at as string | Date);
    const cls = (r.msg_class as MessageClass | null) ?? null;
    records.push({
      masterProductId: r.master_product_id ? String(r.master_product_id) : '',
      priceCents: Number(r.price_cents_detected ?? 0),
      sentAt: at,
      networkSlug: (r.network_slug as string | null) ?? null,
      vertical: (r.vert as string | null) ?? null,
      platformLabel: (r.platform_label as string | null) ?? null,
      platformProductId: (r.plat_pid as string | null) ?? null,
      trigger: (r.trigger as string | null) ?? null,
      cls,
      sound: r.is_sound === true,
      card: r.has_card === true,
    });
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : r.items;
    if (Array.isArray(items)) {
      for (const it of items as Array<{ masterProductId?: string; priceCents?: number }>) {
        if (it.masterProductId) records.push({ masterProductId: it.masterProductId, priceCents: Number(it.priceCents ?? 0), sentAt: at, trigger: 'RADAR', cls: 'radar', itemOnly: true });
      }
    }
  }
  return { records, source: 'group_messages' };
}

async function pickProductIds(o: Required<Pick<DetectOptions, 'maxAgeMin' | 'eventWindowHours' | 'amazonMaxAgeMin'>> & { verticals: string[]; now: Date; maxProducts: number }): Promise<string[]> {
  const confirmedSince = new Date(o.now.getTime() - Math.max(o.maxAgeMin, o.amazonMaxAgeMin) * 60_000).toISOString();
  const evSince = new Date(o.now.getTime() - o.eventWindowHours * 3600_000).toISOString();
  const day = addDays(spDay(o.now), -3);
  const today = spDay(o.now);
  const big = RULES.G5_MIN_OFFERS;
  const rows = await db.execute<Row>(sql`
    WITH live AS (
      SELECT o.id, o.master_product_id AS mid, o.network_id, o.current_price_cents AS p
      FROM affiliate_offers o
      INNER JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.affiliate_link_pending = false AND o.current_price_cents > 0
        AND o.last_price_confirmed_at >= ${confirmedSince}::timestamptz
        AND o.vertical IN (${txtList(o.verticals)}) AND m.vertical IN (${txtList(o.verticals)})
        AND ${eligibleOfferSql('o')}
    ),
    ev AS (
      SELECT DISTINCT e.master_product_id AS mid FROM price_min_events e
      WHERE e.source = 'live' AND e.at >= ${evSince}::timestamptz AND e.prev_min_cents IS NOT NULL AND e.min_cents < e.prev_min_cents
    ),
    st AS (
      SELECT DISTINCT ON (master_product_id) master_product_id AS mid, avg_cents
      FROM price_daily_state WHERE day >= ${day}::date AND avg_cents IS NOT NULL
      ORDER BY master_product_id, day DESC
    ),
    below AS (SELECT DISTINCT l.mid FROM live l INNER JOIN st ON st.mid = l.mid WHERE l.p <= st.avg_cents),
    bigp AS (SELECT mid FROM live GROUP BY mid HAVING count(*) >= ${big}::int),
    hist AS (
      SELECT master_product_id AS mid, min(min_cents) AS rec, (array_agg(min_cents ORDER BY day DESC))[1] AS last_min
      FROM price_daily_state
      WHERE day >= ${PRICE_DAILY_REGIME_START}::date AND day < ${today}::date AND quality IN ('complete', 'partial')
      GROUP BY master_product_id
    ),
    mv AS (
      SELECT l.mid FROM (SELECT mid, min(p) AS p FROM live GROUP BY mid) l
      INNER JOIN hist h ON h.mid = l.mid
      WHERE l.p < h.last_min OR l.p <= h.rec * ${1 + RULES.T2_NEAR_PCT / 100}::numeric
    ),
    nets AS (
      SELECT mid FROM (SELECT mid, network_id, min(p) AS mn FROM live GROUP BY mid, network_id) x
      GROUP BY mid HAVING count(*) >= 2 AND min(mn) <= max(mn) * ${1 - RULES.G3_MIN_DIFF_PCT / 100}::numeric
    )
    SELECT mid FROM (
      SELECT mid, min(r) AS r FROM (
        SELECT mid, 1 AS r FROM ev WHERE mid IN (SELECT mid FROM live)
        UNION ALL SELECT mid, 1 FROM mv
        UNION ALL SELECT mid, 2 FROM below
        UNION ALL SELECT mid, 3 FROM nets
        UNION ALL SELECT mid, 4 FROM bigp
      ) u GROUP BY mid
    ) ranked ORDER BY r, mid LIMIT ${o.maxProducts}::int
  `);
  return rows.map((r) => String(r.mid));
}

/**
 * Série diária do MENOR preço do produto, dias anteriores a hoje: Mercado Livre/Shopee (principal) e Amazon (separada,
 * porque a Amazon só se compara com o próprio histórico). Fonte: price_daily_offer (um mínimo por oferta-dia, só ofertas
 * elegíveis) nos dias em que price_daily_state tem qualidade complete/partial, desde PRICE_DAILY_REGIME_START (31/10).
 * Dia sem coleta fica lacuna (nada é interpolado).
 */
async function loadSeries(ids: string[], today: string, mode: AmazonMode): Promise<Map<string, { main: DayPoint[]; amazon: DayPoint[] }>> {
  const out = new Map<string, { main: DayPoint[]; amazon: DayPoint[] }>();
  if (!ids.length) return out;
  const scope = amazonScope(mode);
  const rows = await db.execute<Row>(sql`
    SELECT d.master_product_id AS mid, d.day::text AS day,
           (n.slug || ' ' || n.name) ILIKE '%amazon%' AS amz, min(d.min_cents) AS mn
    FROM price_daily_offer d
    INNER JOIN affiliate_offers o ON o.id = d.offer_id
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    INNER JOIN price_daily_state s ON s.master_product_id = d.master_product_id AND s.day = d.day AND s.quality IN ('complete', 'partial')
    WHERE d.master_product_id IN (${idList(ids)}) AND d.day >= ${PRICE_DAILY_REGIME_START}::date AND d.day < ${today}::date
      AND d.min_cents > 0 AND ${eligibleOfferSql('o')}
      AND ((n.slug || ' ' || n.name) ILIKE '%mercado%' OR (n.slug || ' ' || n.name) ILIKE '%shopee%' OR (n.slug || ' ' || n.name) ILIKE '%amazon%')
    GROUP BY d.master_product_id, d.day, ((n.slug || ' ' || n.name) ILIKE '%amazon%')
    ORDER BY d.day
  `);
  for (const r of rows) {
    const mid = String(r.mid);
    const e = out.get(mid) ?? out.set(mid, { main: [], amazon: [] }).get(mid)!;
    const pt = { day: String(r.day).slice(0, 10), minCents: Number(r.mn) };
    (r.amz === true ? e.amazon : e.main).push(pt);
    // PRICE_AMAZON_MODE=on (games): o menor preço do dia do produto também considera a Amazon (mesma base do estado diário); a série própria dela segue à parte.
    if (r.amz === true && scope === 'include') e.main.push(pt);
  }
  // Menor entre ML e Shopee por dia (as linhas já agrupam por rede, não por tipo): consolida o mínimo de cada dia.
  for (const e of out.values()) {
    const m = new Map<string, number>();
    for (const pt of e.main) m.set(pt.day, Math.min(m.get(pt.day) ?? Infinity, pt.minCents));
    e.main = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, minCents]) => ({ day, minCents }));
  }
  return out;
}

async function loadFacts(ids: string[], o: { now: Date; maxAgeMin: number; amazonMaxAgeMin: number; eventWindowHours: number; liveVerified?: Set<string>; amazonMode: AmazonMode }): Promise<ProductFacts[]> {
  if (!ids.length) return [];
  // O filtro SQL usa o maior dos dois limites (a Amazon pode ter limite maior que as demais redes no envio); o juízo por rede é do judgeOffer.
  const confirmedSince = new Date(o.now.getTime() - Math.max(o.maxAgeMin, o.amazonMaxAgeMin) * 60_000).toISOString();
  const evSince = new Date(o.now.getTime() - o.eventWindowHours * 3600_000).toISOString();

  const [products, offers, firsts, lasts] = await Promise.all([
    db.execute<Row>(sql`
      SELECT m.id, m.name, m.vertical, m.product_type, m.game_format, m.game_platform_gen,
             m.attributes -> 'catalogGate' ->> 'verdict' AS gate
      FROM master_products m WHERE m.id IN (${idList(ids)})
    `),
    db.execute<Row>(sql`
      SELECT o.id, o.master_product_id, o.slug, o.title, n.slug AS net_slug, n.name AS net_name, o.seller_id,
             s.reputation_level, s.total_sales, COALESCE(NULLIF(o.store_name, ''), s.nickname) AS store_label, o.current_price_cents, o.last_price_confirmed_at,
             COALESCE(o.last_price_change_at, o.created_at) AS price_since, o.quarantined_at,
             -- ML só sai em mensagem com o link OFICIAL de afiliado (meli.la); sem ele a oferta fica de fora do envio (dono, 2026-11-11)
             (o.affiliate_link_pending OR (n.slug = 'mercado-livre' AND COALESCE(o.affiliate_url, '') NOT LIKE 'https://meli.la/%')) AS affiliate_link_pending,
             (COALESCE(o.affiliate_url, '') LIKE 'https://meli.la/%') AS official_link, o.affiliate_url,
             o.consecutive_miss_count AS miss_count
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE o.master_product_id IN (${idList(ids)}) AND o.status = 'active' AND o.current_price_cents > 0
        AND o.last_price_confirmed_at >= ${confirmedSince}::timestamptz AND ${eligibleOfferSql('o')}
    `),
    db.execute<Row>(sql`
      SELECT master_product_id, MIN(at) AS first_at, MIN(min_cents) AS rec_cents
      FROM price_min_events WHERE master_product_id IN (${idList(ids)}) GROUP BY master_product_id
    `),
    db.execute<Row>(sql`
      SELECT DISTINCT ON (master_product_id) master_product_id, at, min_cents, prev_min_cents, offer_id
      FROM price_min_events
      WHERE master_product_id IN (${idList(ids)}) AND source = 'live' AND at >= ${evSince}::timestamptz
      ORDER BY master_product_id, at DESC, id DESC
    `),
  ]);

  // Amazon: primeira observação depois de uma ausência (tabela group_offer_watch, migration 0030).
  const returnedBy = new Map<string, Date>();
  if (offers.length && (await groupMessagesV2Ready())) {
    const amzIds = offers.filter((r) => /amazon/i.test(String(r.net_slug))).map((r) => String(r.id));
    if (amzIds.length) {
      // Oferta que já sumiu da busca alguma vez (absent_since) e ainda não completou a 2a observação: returned_at; se a volta
      // ainda não foi registrada pelo cron, vale a confirmação atual (intervalo 0, segue bloqueada até registrar e esperar 15 min).
      const w = await db.execute<Row>(sql`SELECT offer_id, returned_at FROM group_offer_watch WHERE offer_id IN (${idList(amzIds)}) AND absent_since IS NOT NULL`);
      for (const r of w) {
        const conf = offers.find((x) => String(x.id) === String(r.offer_id))?.last_price_confirmed_at;
        returnedBy.set(String(r.offer_id), r.returned_at ? new Date(r.returned_at as string | Date) : new Date((conf as string | Date) ?? Date.now()));
      }
    }
  }

  // PRICE_AMAZON_MODE=on: produto só na Amazon (nenhuma oferta ativa e elegível fora dela, qualquer frescor) e mediana de 14 dias do próprio ASIN.
  const amazonOnlyBy = new Map<string, boolean>();
  const ownMedianBy = new Map<string, { cents: number; days: number } | null>();
  if (o.amazonMode === 'on' && offers.length) {
    const amzRows = offers.filter((r) => /amazon/i.test(String(r.net_slug)));
    const amzPids = [...new Set(amzRows.map((r) => String(r.master_product_id)))];
    if (amzPids.length) {
      const others = await db.execute<Row>(sql`
        SELECT DISTINCT o.master_product_id AS mid FROM affiliate_offers o
        INNER JOIN affiliate_networks n ON n.id = o.network_id
        WHERE o.master_product_id IN (${idList(amzPids)}) AND n.slug <> 'amazon' AND o.status = 'active' AND o.current_price_cents > 0 AND ${eligibleOfferSql('o')}
      `);
      const hasOther = new Set(others.map((r) => String(r.mid)));
      for (const pid of amzPids) amazonOnlyBy.set(pid, !hasOther.has(pid));
      const onlyPids = amzPids.filter((pid) => amazonOnlyBy.get(pid));
      if (onlyPids.length) {
        const today0 = spDay(o.now);
        const loaded = await loadOffers(db, onlyPids, addDays(today0, -(AMAZON_OWN_WINDOW_DAYS + 7)), { amazon: 'include' });
        for (const r of amzRows) {
          const pid = String(r.master_product_id);
          if (!amazonOnlyBy.get(pid)) continue;
          const oi = loaded.get(pid)?.find((x) => x.offerId === String(r.id));
          ownMedianBy.set(String(r.id), oi ? ownSeriesMedian(oi, today0, o.now, AMAZON_OWN_WINDOW_DAYS, AMAZON_OWN_MIN_DAYS) : null);
        }
      }
    }
  }

  // Shopee: link da campanha oficial por departamento (uma consulta por departamento; sem tabela/sem campanha = null e a linha não aparece).
  const verticalBy = new Map(products.map((p) => [String(p.id), String(p.vertical)]));
  const shopeeUrlBy = new Map<string, string | null>();
  for (const r of offers) {
    if (!/shopee/i.test(String(r.net_slug))) continue;
    const v = verticalBy.get(String(r.master_product_id));
    if (v && !shopeeUrlBy.has(v)) shopeeUrlBy.set(v, await loadShopeeCampaignUrl(v, o.now));
  }
  const offersBy = new Map<string, OfferFact[]>();
  for (const r of offers) {
    const mid = String(r.master_product_id);
    const f: OfferFact = {
      offerId: String(r.id),
      slug: String(r.slug),
      title: String(r.title),
      networkSlug: String(r.net_slug),
      networkName: String(r.net_name),
      sellerId: (r.seller_id as string | null) ?? null,
      sellerReputation: (r.reputation_level as string | null) ?? null,
      sellerTotalSales: r.total_sales == null ? null : Number(r.total_sales),
      priceCents: Number(r.current_price_cents),
      confirmedAt: r.last_price_confirmed_at ? new Date(r.last_price_confirmed_at as string | Date) : null,
      priceSince: r.price_since ? new Date(r.price_since as string | Date) : null,
      affiliateLinkPending: r.affiliate_link_pending === true,
      officialLink: r.official_link === true,
      affiliateUrl: (r.affiliate_url as string | null) ?? null,
      storeName: (r.store_label as string | null) ?? null,
      quarantined: r.quarantined_at != null,
      missCount: r.miss_count == null ? 0 : Number(r.miss_count),
      returnedAt: returnedBy.get(String(r.id)) ?? null,
      liveVerifiedAt: o.liveVerified?.has(String(r.id)) ? o.now : null,
      ownMedian14: ownMedianBy.get(String(r.id)) ?? null,
      shopeeCampaignUrl: /shopee/i.test(String(r.net_slug)) ? shopeeUrlBy.get(verticalBy.get(mid) ?? '') ?? null : null,
    };
    (offersBy.get(mid) ?? offersBy.set(mid, []).get(mid)!).push(f);
  }
  const firstBy = new Map(firsts.map((r) => [String(r.master_product_id), r]));
  const lastBy = new Map(lasts.map((r) => [String(r.master_product_id), r]));

  const today = spDay(o.now);
  const from = addDays(today, -29);
  const seriesBy = await loadSeries(ids, today, o.amazonMode);
  const stateAvgRows = await db.execute<Row>(sql`
    SELECT DISTINCT ON (master_product_id) master_product_id AS mid, avg_cents FROM price_daily_state
    WHERE master_product_id IN (${idList(ids)}) AND day >= ${addDays(today, -3)}::date AND avg_cents IS NOT NULL
    ORDER BY master_product_id, day DESC
  `);
  const stateAvgBy = new Map(stateAvgRows.map((r) => [String(r.mid), Number(r.avg_cents)]));
  const out: ProductFacts[] = [];
  for (const p of products) {
    const id = String(p.id);
    const offs = offersBy.get(id) ?? [];
    if (!offs.length) continue;
    const rp = readPlatform(String(p.game_platform_gen ?? 'unknown') as never, String(p.name));
    const platformLabel = rp.platform !== 'unknown' ? (PLATFORM_LABELS[rp.platform] ?? null) : rp.legacyLabel;
    // A média é só CONTEXTO do movimento (e faixa de risco): só se calcula para quem tem gatilho de movimento (ML/Shopee),
    // porque a leitura é uma consulta por produto (a média é a MESMA do selo e do gráfico: computePeriodMetrics).
    let avg: ProductFacts['avg'] = null;
    const mainPrices = offs.filter((x) => !/amazon/i.test(x.networkSlug)).map((x) => x.priceCents);
    const cheapestMain = mainPrices.length ? Math.min(...mainPrices) : 0;
    const hasMove = offs.length >= 3 && cheapestMain > 0 && detectMovement(seriesBy.get(id)?.main ?? [], cheapestMain, today).length > 0;
    // "Na média ou abaixo" (dono, 2026-11-11): também precisa da média quando o menor preço vivo está no nível da média do dia.
    const stateAvg = stateAvgBy.get(id);
    const maybeMed = offs.length >= 3 && cheapestMain > 0 && stateAvg != null && cheapestMain <= stateAvg && (seriesBy.get(id)?.main.length ?? 0) >= RULES.MED_MIN_SERIES_DAYS - 1;
    // PRICE_AMAZON_MODE=on: a Amazon também compara com a média única, então produto com oferta Amazon precisa dela (games).
    const needsAmzAvg = amazonCountsIn(o.amazonMode, String(p.vertical)) && offs.some((x) => /amazon/i.test(x.networkSlug));
    if (hasMove || maybeMed || needsAmzAvg) {
      const days = await loadPeriodDays(db, id, from, today);
      const pm = computePeriodMetrics(days, null);
      if (pm.avgOfferDayCents != null) {
        avg = { cents: Math.round(pm.avgOfferDayCents), distinctOffers: pm.distinctOffers, offerDays: pm.offerDays, spanDays: pm.spanDays, eligible: pm.eligible };
      }
    }
    const f = firstBy.get(id);
    const l = lastBy.get(id);
    out.push({
      masterProductId: id,
      masterName: String(p.name),
      vertical: String(p.vertical),
      productType: String(p.product_type),
      platformLabel,
      format: (p.game_format === 'physical' || p.game_format === 'digital' ? p.game_format : 'unknown') as ProductFacts['format'],
      catalogGate: (p.gate as string | null) ?? null,
      offers: offs,
      avg,
      minEvent: l
        ? { at: new Date(l.at as string | Date), minCents: Number(l.min_cents), prevMinCents: l.prev_min_cents == null ? null : Number(l.prev_min_cents), offerId: (l.offer_id as string | null) ?? null }
        : null,
      record: f ? { since: new Date(f.first_at as string | Date), minCents: Number(f.rec_cents) } : null,
      baseline: null,
      series: seriesBy.get(id)?.main ?? [],
      amazonSeries: seriesBy.get(id)?.amazon ?? [],
      amazonOnly: amazonCountsIn(o.amazonMode, String(p.vertical)) ? (amazonOnlyBy.get(id) ?? false) : false,
    });
  }
  return out;
}

/**
 * Roda o detector e devolve JSON: candidatos com motivo e texto pronto (Telegram e WhatsApp), bloqueados com motivo,
 * e o plano de limites (quem sairia agora, quem fica esperando e por quê). Não escreve em lugar nenhum.
 */
export async function detectGroupCandidates(opts: DetectOptions = {}): Promise<DetectionResult> {
  const now = opts.now ?? new Date();
  const verticals = (opts.verticals ?? ['games']).filter(isVertical);
  if (!verticals.length) throw new Error('nenhum departamento válido');
  const maxAgeMin = opts.maxAgeMin ?? RULES.DETECT_MAX_AGE_MIN;
  const eventWindowHours = opts.eventWindowHours ?? 24;
  const adTag = opts.adTag ?? getAdTag();
  const warnings: string[] = [];
  const amazonMaxAgeMin = opts.amazonMaxAgeMin ?? RULES.AMAZON_DETECT_MAX_AGE_MIN;
  const amazonMode = getAmazonMode();
  const amazonLastRun = await loadAmazonLastRun().catch(() => null);
  const amazonPaused = amazonLoopPaused(amazonLastRun, now);
  if (amazonPaused) warnings.push('Classe Amazon pausada: a coleta assistida está sem lote há mais de 90 min (ou nunca rodou).');

  const ids = opts.productIds?.length
    ? opts.productIds
    : await pickProductIds({ verticals, now, maxAgeMin, amazonMaxAgeMin, eventWindowHours, maxProducts: opts.maxProducts ?? 400 });
  const facts = await loadFacts(ids, { now, maxAgeMin, amazonMaxAgeMin, eventWindowHours, liveVerified: new Set(opts.liveVerifiedOfferIds ?? []), amazonMode });

  const ctx = { now, maxAgeMin, adTag, amazonMaxAgeMin, amazonPaused, amazonMode };
  const candidates: Candidate[] = [];
  const blocked: Blocked[] = [];
  for (const p of facts) {
    const r = evaluateProductV2(p, ctx);
    candidates.push(...r.candidates);
    blocked.push(...r.blocked);
  }
  const factMap = new Map(facts.map((p) => [p.masterProductId, p]));
  const g4 = buildDailySummary(candidates, factMap, ctx);
  if (g4) candidates.push(g4);
  // Plataforma (P1 a P5): só com a migration 0031 (os CHECKs de gatilho/classe precisam aceitar P1..P5).
  if (opts.includePlatform !== false && (await groupMessagesOnda2Ready().catch(() => false))) candidates.push(...buildPlatformCandidates(facts, ctx));

  let history: SentRecord[];
  let historySource: DetectionResult['historySource'];
  if (opts.history) {
    history = opts.history;
    historySource = 'parametro';
  } else {
    const h = await loadSentHistory('tg', now, { includeSimulated: opts.includeSimulated });
    history = h.records;
    historySource = h.source;
    if (h.source !== 'group_messages') warnings.push('Tabela group_messages ausente: limites calculados sem histórico de envios (migration 0028 não aplicada).');
  }
  // Radar: itens da classe B que passam no dedup por produto viram UMA mensagem (3 a 6 itens) na hora cheia.
  const radarPool = candidates.filter((c) => c.cls === 'radar' && c.trigger !== 'RADAR' && !productDedupBlock(c, history, now));
  // Radar composto é opcional (dono, 2026-11-11: uma mensagem por item): só é gerado com RULES.RADAR_COMPOSITE_ENABLED.
  const radar = RULES.RADAR_COMPOSITE_ENABLED ? composeRadar(radarPool, ctx) : null;
  if (radar) candidates.push(radar);
  const plan = applyLimits(candidates, history, now);

  // Ordem de leitura: auto primeiro, depois revisão, depois não enviáveis; dentro, maior distância da média.
  candidates.sort(
    (a, b) =>
      Number(!a.sendable) - Number(!b.sendable) ||
      Number(a.status === 'review') - Number(b.status === 'review') ||
      a.trigger.localeCompare(b.trigger) ||
      (b.belowAvgPct ?? 0) - (a.belowAvgPct ?? 0)
  );

  return {
    generatedAt: now.toISOString(),
    mode: 'dry',
    config: { verticals, maxAgeMin, eventWindowHours, adTag, amazonMaxAgeMin, amazonPaused, amazonLastRunAt: amazonLastRun ? amazonLastRun.toISOString() : null, amazonMode },
    counts: {
      productsEvaluated: facts.length,
      candidates: candidates.length,
      auto: candidates.filter((c) => c.status === 'auto' && c.sendable).length,
      review: candidates.filter((c) => c.status === 'review' && c.sendable).length,
      notSendable: candidates.filter((c) => !c.sendable).length,
      blocked: blocked.length,
    },
    candidates,
    blocked: blocked.slice(0, 200),
    plan,
    history,
    historySource,
    warnings,
  };
}

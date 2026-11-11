import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { loadPeriodDays } from '@/server/pricing/price-daily';
import { addDays, computePeriodMetrics, spDay } from '@/lib/pricing/daily-state';
import { readPlatform } from '@/lib/catalog/platform';
import { isVertical } from '@/lib/catalog/verticais';
import { getAdTag } from '@/lib/messaging/group-config';
import {
  RULES,
  applyLimits,
  buildDailySummary,
  evaluateProduct,
  type Blocked,
  type Candidate,
  type LimitPlan,
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
}

export interface DetectionResult {
  generatedAt: string;
  mode: 'dry';
  config: { verticals: string[]; maxAgeMin: number; eventWindowHours: number; adTag: string };
  counts: { productsEvaluated: number; candidates: number; auto: number; review: number; notSendable: number; blocked: number };
  candidates: Candidate[];
  blocked: Blocked[];
  plan: LimitPlan;
  historySource: 'group_messages' | 'nenhum (tabela ausente)' | 'parametro';
  warnings: string[];
}

const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
const txtList = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

export async function groupMessagesTableExists(): Promise<boolean> {
  const rows = await db.execute<Row>(sql`SELECT to_regclass('public.group_messages') IS NOT NULL AS ok`);
  return rows[0]?.ok === true;
}

/** Envios (status 'enviada') das últimas 72 h do canal; [] se a tabela ainda não existe. */
export async function loadSentHistory(channel: 'tg' | 'wa', now: Date): Promise<{ records: SentRecord[]; source: DetectionResult['historySource'] }> {
  if (!(await groupMessagesTableExists())) return { records: [], source: 'nenhum (tabela ausente)' };
  const since = new Date(now.getTime() - 72 * 3600_000).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT master_product_id, price_cents_detected, sent_at, trigger, candidate ->> 'networkSlug' AS network_slug
    FROM group_messages
    WHERE channel = ${channel} AND status = 'enviada' AND sent_at >= ${since}::timestamptz AND master_product_id IS NOT NULL
  `);
  return {
    source: 'group_messages',
    records: rows.map((r) => ({
      masterProductId: String(r.master_product_id),
      priceCents: Number(r.price_cents_detected ?? 0),
      sentAt: new Date(r.sent_at as string | Date),
      networkSlug: (r.network_slug as string | null) ?? null,
      trigger: (r.trigger as string | null) ?? null,
    })),
  };
}

async function pickProductIds(o: Required<Pick<DetectOptions, 'maxAgeMin' | 'eventWindowHours'>> & { verticals: string[]; now: Date; maxProducts: number }): Promise<string[]> {
  const confirmedSince = new Date(o.now.getTime() - o.maxAgeMin * 60_000).toISOString();
  const evSince = new Date(o.now.getTime() - o.eventWindowHours * 3600_000).toISOString();
  const day = addDays(spDay(o.now), -3);
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
    below AS (SELECT DISTINCT l.mid FROM live l INNER JOIN st ON st.mid = l.mid WHERE l.p <= st.avg_cents * ${1 - RULES.MIN_BELOW_AVG_PCT / 100}::numeric),
    bigp AS (SELECT mid FROM live GROUP BY mid HAVING count(*) >= ${big}::int),
    nets AS (
      SELECT mid FROM (SELECT mid, network_id, min(p) AS mn FROM live GROUP BY mid, network_id) x
      GROUP BY mid HAVING count(*) >= 2 AND min(mn) <= max(mn) * ${1 - RULES.G3_MIN_DIFF_PCT / 100}::numeric
    )
    SELECT mid FROM (
      SELECT mid, min(r) AS r FROM (
        SELECT mid, 1 AS r FROM ev WHERE mid IN (SELECT mid FROM live)
        UNION ALL SELECT mid, 2 FROM below
        UNION ALL SELECT mid, 3 FROM nets
        UNION ALL SELECT mid, 4 FROM bigp
      ) u GROUP BY mid
    ) ranked ORDER BY r, mid LIMIT ${o.maxProducts}::int
  `);
  return rows.map((r) => String(r.mid));
}

async function loadFacts(ids: string[], o: { now: Date; maxAgeMin: number; eventWindowHours: number }): Promise<ProductFacts[]> {
  if (!ids.length) return [];
  const confirmedSince = new Date(o.now.getTime() - o.maxAgeMin * 60_000).toISOString();
  const evSince = new Date(o.now.getTime() - o.eventWindowHours * 3600_000).toISOString();

  const [products, offers, firsts, lasts] = await Promise.all([
    db.execute<Row>(sql`
      SELECT m.id, m.name, m.vertical, m.product_type, m.game_format, m.game_platform_gen,
             m.attributes -> 'catalogGate' ->> 'verdict' AS gate
      FROM master_products m WHERE m.id IN (${idList(ids)})
    `),
    db.execute<Row>(sql`
      SELECT o.id, o.master_product_id, o.slug, o.title, n.slug AS net_slug, n.name AS net_name, o.seller_id,
             s.reputation_level, s.total_sales, o.current_price_cents, o.last_price_confirmed_at,
             COALESCE(o.last_price_change_at, o.created_at) AS price_since, o.affiliate_link_pending, o.quarantined_at
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
      quarantined: r.quarantined_at != null,
    };
    (offersBy.get(mid) ?? offersBy.set(mid, []).get(mid)!).push(f);
  }
  const firstBy = new Map(firsts.map((r) => [String(r.master_product_id), r]));
  const lastBy = new Map(lasts.map((r) => [String(r.master_product_id), r]));

  const today = spDay(o.now);
  const from = addDays(today, -29);
  const out: ProductFacts[] = [];
  for (const p of products) {
    const id = String(p.id);
    const offs = offersBy.get(id) ?? [];
    if (!offs.length) continue;
    const rp = readPlatform(String(p.game_platform_gen ?? 'unknown') as never, String(p.name));
    const platformLabel = rp.platform !== 'unknown' ? (PLATFORM_LABELS[rp.platform] ?? null) : rp.legacyLabel;
    let avg: ProductFacts['avg'] = null;
    if (offs.length >= 3) {
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

  const ids = opts.productIds?.length
    ? opts.productIds
    : await pickProductIds({ verticals, now, maxAgeMin, eventWindowHours, maxProducts: opts.maxProducts ?? 300 });
  const facts = await loadFacts(ids, { now, maxAgeMin, eventWindowHours });

  const ctx = { now, maxAgeMin, adTag };
  const candidates: Candidate[] = [];
  const blocked: Blocked[] = [];
  for (const p of facts) {
    const r = evaluateProduct(p, ctx);
    candidates.push(...r.candidates);
    blocked.push(...r.blocked);
  }
  const factMap = new Map(facts.map((p) => [p.masterProductId, p]));
  const g4 = buildDailySummary(candidates, factMap, ctx);
  if (g4) candidates.push(g4);

  let history: SentRecord[];
  let historySource: DetectionResult['historySource'];
  if (opts.history) {
    history = opts.history;
    historySource = 'parametro';
  } else {
    const h = await loadSentHistory('tg', now);
    history = h.records;
    historySource = h.source;
    if (h.source !== 'group_messages') warnings.push('Tabela group_messages ausente: limites calculados sem histórico de envios (migration 0028 não aplicada).');
  }
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
    config: { verticals, maxAgeMin, eventWindowHours, adTag },
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
    historySource,
    warnings,
  };
}

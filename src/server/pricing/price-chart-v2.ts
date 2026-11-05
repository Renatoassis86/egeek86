import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { PRICE_DAILY_REGIME_START, addDays, spDay, spDayBounds, type PeriodDay } from '@/lib/pricing/daily-state';
import { CHART_TFS, TF_DAYS, computePeriodRef, type ChartDay, type ChartEvent, type ChartInput, type ChartTf, type PeriodRef } from '@/lib/pricing/chart-model';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { weakSellerSql } from '@/server/queries/public-offers';

/**
 * Dados do gráfico V2 (fase 3, ata 2026-11-05). SÓ LEITURA das tabelas sombra (price_daily_state, price_daily_offer,
 * price_min_events). Devolve apenas o que foi medido; nada interpolado. Serializável (passa pelo cache SWR).
 * Devolve null quando o produto não tem nenhum dia medido no regime atual (a página cai no gráfico anterior).
 */

type Row = Record<string, unknown>;
const asNum = (v: unknown): number | null => (v == null ? null : Number(v));

async function loadPriceChartV2(masterProductId: string): Promise<ChartInput | null> {
  const now = new Date();
  const today = spDay(now);
  const regimeStart = spDayBounds(PRICE_DAILY_REGIME_START).start.toISOString();

  const [stateRows, eventRows, quoteRows] = await Promise.all([
    db.execute<Row>(sql`
      SELECT s.day::text AS day, s.min_cents, s.avg_cents, s.median_offer_day_cents, s.n_offers, s.quality,
             CASE WHEN s.day >= ${PRICE_DAILY_REGIME_START}::date THEN s.members END AS members,
             po.last_observed_at AS anchor_at
      FROM price_daily_state s
      LEFT JOIN price_daily_offer po ON po.offer_id = s.min_offer_id AND po.day = s.day
      WHERE s.master_product_id = ${masterProductId}::uuid
      ORDER BY s.day
    `),
    db.execute<Row>(sql`
      SELECT e.at, e.min_cents, e.prev_min_cents, n.name AS network_name, sl.nickname, ${weakSellerSql('sl')} AS weak
      FROM price_min_events e
      LEFT JOIN affiliate_offers o ON o.id = e.offer_id
      LEFT JOIN affiliate_networks n ON n.id = COALESCE(o.network_id, e.network_id)
      LEFT JOIN affiliate_sellers sl ON sl.id = COALESCE(o.seller_id, e.seller_id)
      WHERE e.master_product_id = ${masterProductId}::uuid AND e.at >= ${regimeStart}::timestamptz
      ORDER BY e.at, e.id
      LIMIT 5000
    `),
    db.execute<Row>(sql`
      SELECT MAX(d.last_observed_at) AS last_at
      FROM price_daily_offer d
      INNER JOIN affiliate_offers o ON o.id = d.offer_id
      WHERE d.master_product_id = ${masterProductId}::uuid AND d.day >= ${PRICE_DAILY_REGIME_START}::date
        AND o.status = 'active' AND ${eligibleOfferSql('o')}
    `),
  ]);

  const days: ChartDay[] = [];
  const periodDays: PeriodDay[] = [];
  for (const r of stateRows) {
    const quality = String(r.quality) as ChartDay['quality'];
    const day = String(r.day);
    days.push({
      day,
      minCents: asNum(r.min_cents),
      avgCents: asNum(r.avg_cents),
      medianCents: asNum(r.median_offer_day_cents),
      nOffers: Number(r.n_offers ?? 0),
      quality,
      anchorAt: r.anchor_at ? new Date(r.anchor_at as string | Date).toISOString() : null,
    });
    if ((quality === 'complete' || quality === 'partial') && r.members != null) {
      const members = (typeof r.members === 'string' ? JSON.parse(r.members) : r.members) as Record<string, number>;
      periodDays.push({ day, members, minCents: asNum(r.min_cents) });
    }
  }
  if (!periodDays.length) return null;

  const events: ChartEvent[] = eventRows.map((r) => {
    const net = String(r.network_name ?? '');
    const nick = r.nickname ? String(r.nickname) : '';
    return {
      at: new Date(r.at as string | Date).toISOString(),
      minCents: Number(r.min_cents),
      prevMinCents: asNum(r.prev_min_cents),
      store: nick ? `${nick} (${net})` : net || 'Loja',
      weak: r.weak === true,
    };
  });

  // Média e mediana HISTÓRICAS por janela (oferta-dias, mesma base do selo e do topo).
  const refs = {} as Record<ChartTf, PeriodRef>;
  for (const tf of CHART_TFS) {
    const n = TF_DAYS[tf];
    const from = n == null ? null : addDays(today, -(n - 1));
    refs[tf] = computePeriodRef(from ? periodDays.filter((d) => d.day >= from) : periodDays, n);
  }

  const lastAt = quoteRows[0]?.last_at;
  return {
    days,
    events,
    lastQuoteAt: lastAt ? new Date(lastAt as string | Date).toISOString() : null,
    refs,
    legacyDays: days.filter((d) => d.quality === 'legacy').length,
  };
}

/** Versão em cache SWR. A seção trata falha/timeout com `.catch(() => null)` e cai no gráfico anterior. */
export const getPriceChartV2: (masterProductId: string) => Promise<ChartInput | null> = createCachedQuery(
  loadPriceChartV2,
  ['price-chart-v2-1'],
  { revalidate: 60, coldTimeoutSeconds: 5, live: true, hardTimeoutSeconds: 20 }
);

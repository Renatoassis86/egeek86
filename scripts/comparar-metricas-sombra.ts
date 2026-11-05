/**
 * COMPARAÇÃO EM SOMBRA: método ANTIGO do site x método NOVO (oferta-dia), lado a lado, só leitura.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/comparar-metricas-sombra.ts
 * Grava docs/comparacao-metricas-sombra-2026-11-05.csv (uma linha por produto).
 *
 * ANTIGO: selo/média oficial = getMasterProductPriceStatsBatchRaw (média por cotação, todo o histórico);
 *         média do gráfico = getMasterProductPriceHistory(..., 'Tudo').stats e último ponto de avgPoints.
 * NOVO:   preço agora = menor preço vigente elegível (computeLiveMin); M_d de hoje e mediana vigente
 *         (price_daily_state); média/mediana de oferta-dia de 30 dias (soma dos preços oferta-dia / nº de
 *         oferta-dias); percentil do preço agora na série dos menores preços diários; menor de 30/90 dias e de sempre
 *         a partir do BRUTO elegível (com data e loja; faixa plausível 35 % a 3x da mediana vigente);
 *         matched_change_pct e composition_flag dos últimos 7 dias; veredito proposto (±5 % da mediana de oferta-dia
 *         de 30 dias, só com 3 ofertas distintas, 5 oferta-dias e 14 dias de histórico na janela de 90 dias).
 */
import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { INLINE_BAND_PERCENT, computeVerdict } from '@/lib/affiliate/price-verdict';
import { addDays, computeLiveMin, computePeriodMetrics, plausibleBand, spDay } from '@/lib/pricing/daily-state';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { loadOffers, loadPeriodDays } from '@/server/pricing/price-daily';
import { getMasterProductPriceStatsBatchRaw } from '@/server/queries/product-price-stats';
import { getMasterProductPriceHistory } from '@/server/queries/price-history';

const PREFIXES: Array<[string, string]> = [
  ['NBA 2K21 Xbox Series X', 'b6529007-6709-4e67-af4a-3f132903075c'],
  ['Mario vs. Donkey Kong Switch', '85da0979-022f-43ea-95da-56693e2426ec'],
  ['Silent Hill 2 PS5', '0379cdc3'],
  ['Console Nintendo Switch 2', 'c8366787'],
];
const brl = (c: number | null | undefined) => (c == null ? 'n/d' : `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: number | null | undefined) => (v == null ? 'n/d' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
const delta = (cur: number | null, ref: number | null) => (cur != null && ref ? ((cur - ref) / ref) * 100 : null);

interface Low {
  cents: number;
  at: string;
  store: string;
}

async function rawLow(id: string, windowDays: number | null, lo: number | null, hi: number | null): Promise<Low | null> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT s.price_cents, s.collected_at, n.name AS network, sel.nickname AS seller
    FROM affiliate_offers o
    INNER JOIN affiliate_price_snapshots s ON s.offer_id = o.id
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id
    WHERE o.master_product_id = ${id} AND ${eligibleOfferSql('o')} AND s.price_cents > 0
      ${windowDays ? sql`AND s.collected_at >= now() - (${windowDays}::int * interval '1 day')` : sql``}
      ${lo != null ? sql`AND s.price_cents > ${lo}::numeric` : sql``}
      ${hi != null ? sql`AND s.price_cents <= ${hi}::numeric` : sql``}
    ORDER BY s.price_cents ASC, s.collected_at ASC LIMIT 1`);
  const r = rows[0];
  if (!r) return null;
  return { cents: Number(r.price_cents), at: new Date(String(r.collected_at)).toISOString(), store: `${r.network}${r.seller ? ` / ${r.seller}` : ''}` };
}

const lowTxt = (l: Low | null) => (l ? `${brl(l.cents)} em ${l.at.slice(0, 10)} (${l.store})` : 'n/d');

async function main() {
  const now = new Date();
  const today = spDay(now);
  const out: Array<Record<string, string | number | null>> = [];

  for (const [label, key] of PREFIXES) {
    const idRow = await db.execute<{ id: string; name: string }>(sql`SELECT id, name FROM master_products WHERE id::text LIKE ${key + '%'} LIMIT 2`);
    if (idRow.length !== 1) {
      console.log(`\n### ${label}: id ${key} não resolvido (${idRow.length} resultados)`);
      continue;
    }
    const id = String(idRow[0].id);

    // ---------------- ANTIGO ----------------
    const stats = (await getMasterProductPriceStatsBatchRaw([id])).get(id)!;
    const hist = await getMasterProductPriceHistory(id, 'Tudo');
    const lastAvgPoint = hist.avgPoints.length ? Math.round(hist.avgPoints[hist.avgPoints.length - 1].value * 100) : null;
    const oldCur = stats.currentLowestActive?.priceCents ?? null;
    const oldVerdict = computeVerdict({ currentCents: oldCur, avgCents: stats.avgCents, quoteCount: stats.quoteCount, historyDays: stats.historyDays, lowConfidence: stats.lowConfidence });

    // ---------------- NOVO ----------------
    const offers = (await loadOffers(db, [id], addDays(today, -3))).get(id) ?? [];
    const live = computeLiveMin(offers, now);
    const cur = live?.minCents ?? null;
    const stRows = await db.execute<Record<string, unknown>>(sql`
      SELECT day::text AS day, avg_cents, median_offer_day_cents, min_cents, n_offers, n_stores, quality, matched_change_pct, composition_flag, matched_offers
      FROM price_daily_state WHERE master_product_id = ${id} AND day >= ${addDays(today, -6)}::date ORDER BY day DESC`);
    const todayRow = stRows.find((r) => r.day === today) ?? stRows[0] ?? null;
    const days90 = await loadPeriodDays(db, id, addDays(today, -89), today);
    const days30 = days90.filter((d) => d.day >= addDays(today, -29));
    const p30 = computePeriodMetrics(days30, cur);
    const p90 = computePeriodMetrics(days90, cur);
    const medToday = todayRow?.median_offer_day_cents != null ? Number(todayRow.median_offer_day_cents) : null;
    const band = plausibleBand(offers.map((o) => o.rows[o.rows.length - 1]?.lastCents).filter((x): x is number => x != null));
    const lo = band.applied ? band.floor : null;
    const hi = band.applied ? band.ceiling : null;
    const [low30, low90, lowAll] = [await rawLow(id, 30, lo, hi), await rawLow(id, 90, lo, hi), await rawLow(id, null, lo, hi)];
    const refMedian = p30.medianOfferDayCents;
    let verdict = 'histórico curto (' + p90.reasons.join(', ') + ')';
    if (p90.eligible && cur != null && refMedian) {
      const d = delta(cur, refMedian) as number;
      verdict = Math.abs(d) <= INLINE_BAND_PERCENT ? 'em linha' : d < 0 ? 'abaixo do normal' : 'acima do normal';
    }
    const matched7 = stRows.map((r) => `${r.day}: ${r.matched_change_pct == null ? 'n/d' : pct(Number(r.matched_change_pct))} / composição ${r.composition_flag == null ? 'n/d' : r.composition_flag ? 'SIM' : 'não'}`);

    // ---------------- SAÍDA ----------------
    const L = (a: string, b: string, c: string) => console.log(`  ${a.padEnd(38)} ${b.padEnd(34)} ${c}`);
    console.log(`\n### ${label} (${id})  [${String(idRow[0].name)}]`);
    L('', 'ANTIGO (site hoje)', 'NOVO (oferta-dia, sombra)');
    L('Preço agora', `${brl(oldCur)} (menor oferta pública)`, `${brl(cur)} (menor vigente elegível)`);
    L('Média oficial / selo', `${brl(stats.avgCents)}  (${stats.quoteCount} cotações)`, `M_d hoje ${brl(todayRow?.avg_cents != null ? Math.round(Number(todayRow.avg_cents)) : null)}`);
    L('Média do gráfico (Tudo)', `${brl(hist.stats.avgPriceCents)}; último ponto ${brl(lastAvgPoint)}`, `média oferta-dia 30d ${brl(p30.avgOfferDayCents == null ? null : Math.round(p30.avgOfferDayCents))} (${p30.offerDays} oferta-dias)`);
    L('Mediana', `${brl(stats.medianCents)} (todas as cotações)`, `vigente hoje ${brl(medToday == null ? null : Math.round(medToday))}; oferta-dia 30d ${brl(p30.medianOfferDayCents == null ? null : Math.round(p30.medianOfferDayCents))}; 90d ${brl(p90.medianOfferDayCents == null ? null : Math.round(p90.medianOfferDayCents))}`);
    L('% sobre a média', `${pct(oldVerdict.deltaPercent)} (selo: ${oldVerdict.kind})`, `${pct(delta(cur, p30.avgOfferDayCents))} sobre a média 30d`);
    L('% sobre a mediana', 'n/d', `${pct(delta(cur, medToday))} vs vigente hoje; ${pct(delta(cur, refMedian))} vs oferta-dia 30d`);
    L('Percentil nos mínimos diários', 'n/d', p30.currentPercentileInDailyMins == null ? 'n/d' : `${p30.currentPercentileInDailyMins.toFixed(0)}% (30d), ${p90.currentPercentileInDailyMins?.toFixed(0)}% (90d)`);
    L('Menor 30d', 'n/d', lowTxt(low30));
    L('Menor 90d', stats.low3m ? `${brl(stats.low3m.priceCents)} em ${stats.low3m.at.slice(0, 10)}` : 'n/d', lowTxt(low90));
    L('Menor de sempre', stats.lowAll ? `${brl(stats.lowAll.priceCents)} em ${stats.lowAll.at.slice(0, 10)}` : 'n/d', lowTxt(lowAll));
    L('Ofertas / lojas', `${hist.totalOffersCount} cadastradas`, `${todayRow?.n_offers ?? 'n/d'} ofertas / ${todayRow?.n_stores ?? 'n/d'} lojas (hoje); ${p90.distinctOffers} ofertas distintas em 90d`);
    L('Histórico', `${stats.historyDays} dias`, `${p90.spanDays} dias, ${p90.offerDays} oferta-dias`);
    L('Veredito', `${oldVerdict.kind}`, verdict);
    L('Qualidade do dia', 'n/d', String(todayRow?.quality ?? 'n/d'));
    console.log('  Mudança das mesmas ofertas (7 dias):');
    for (const m of matched7) console.log(`    ${m}`);

    out.push({
      produto: label,
      master_product_id: id,
      antigo_preco_agora: oldCur,
      antigo_media_oficial_selo: stats.avgCents,
      antigo_cotacoes: stats.quoteCount,
      antigo_media_grafico_tudo: hist.stats.avgPriceCents,
      antigo_ultimo_ponto_media_grafico: lastAvgPoint,
      antigo_mediana: stats.medianCents,
      antigo_delta_pct_selo: oldVerdict.deltaPercent,
      antigo_veredito: oldVerdict.kind,
      antigo_menor_90d: stats.low3m?.priceCents ?? null,
      antigo_menor_sempre: stats.lowAll?.priceCents ?? null,
      novo_preco_agora: cur,
      novo_M_d_hoje: todayRow?.avg_cents != null ? Math.round(Number(todayRow.avg_cents)) : null,
      novo_mediana_vigente_hoje: medToday == null ? null : Math.round(medToday),
      novo_media_oferta_dia_30d: p30.avgOfferDayCents == null ? null : Math.round(p30.avgOfferDayCents),
      novo_mediana_oferta_dia_30d: p30.medianOfferDayCents == null ? null : Math.round(p30.medianOfferDayCents),
      novo_mediana_oferta_dia_90d: p90.medianOfferDayCents == null ? null : Math.round(p90.medianOfferDayCents),
      novo_pct_vs_mediana_vigente: delta(cur, medToday) == null ? null : Math.round((delta(cur, medToday) as number) * 10) / 10,
      novo_pct_vs_mediana_30d: delta(cur, refMedian) == null ? null : Math.round((delta(cur, refMedian) as number) * 10) / 10,
      novo_pct_vs_media_30d: delta(cur, p30.avgOfferDayCents) == null ? null : Math.round((delta(cur, p30.avgOfferDayCents) as number) * 10) / 10,
      novo_percentil_minimos_30d: p30.currentPercentileInDailyMins,
      novo_menor_30d: low30?.cents ?? null,
      novo_menor_30d_quando_loja: low30 ? `${low30.at.slice(0, 10)} ${low30.store}` : null,
      novo_menor_90d: low90?.cents ?? null,
      novo_menor_90d_quando_loja: low90 ? `${low90.at.slice(0, 10)} ${low90.store}` : null,
      novo_menor_sempre: lowAll?.cents ?? null,
      novo_menor_sempre_quando_loja: lowAll ? `${lowAll.at.slice(0, 10)} ${lowAll.store}` : null,
      novo_n_ofertas_hoje: todayRow?.n_offers != null ? Number(todayRow.n_offers) : null,
      novo_n_lojas_hoje: todayRow?.n_stores != null ? Number(todayRow.n_stores) : null,
      novo_ofertas_distintas_90d: p90.distinctOffers,
      novo_oferta_dias_90d: p90.offerDays,
      novo_dias_historico: p90.spanDays,
      novo_qualidade_hoje: String(todayRow?.quality ?? ''),
      novo_veredito_proposto: verdict,
      novo_mudanca_mesmas_ofertas_7d: matched7.join(' | '),
    });
  }

  if (out.length) {
    const cols = Object.keys(out[0]);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cols.join(';'), ...out.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n') + '\n';
    fs.writeFileSync('docs/comparacao-metricas-sombra-2026-11-05.csv', csv);
    console.log('\nGravado: docs/comparacao-metricas-sombra-2026-11-05.csv (valores monetários em CENTAVOS)');
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { PRICE_DAILY_REGIME_START, spDayBounds } from '@/lib/pricing/daily-state';
import { montarGraficoDados, type GraficoDados, type LinhaEstado, type LinhaEvento } from '@/lib/pricing/grafico-dados';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { weakSellerSql } from '@/server/queries/public-offers';

/**
 * Leitura do contrato de dados do gráfico V2 evoluído (checklist #27; GRAFICO_PRECOS.md seção 5). SÓ LEITURA das tabelas
 * price_daily_state / price_daily_offer / price_min_events: nenhuma tabela nova, nenhum recálculo, nada interpolado.
 * SEM CONSUMIDOR (o componente é do frontend, depois); não altera a página atual.
 * Teto: transação curta com SET LOCAL statement_timeout/lock_timeout, três leituras por master_product_id, nada fica aberto.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | Date).toISOString());

async function carregar(masterProductId: string): Promise<GraficoDados | null> {
  const agora = new Date();
  const inicio = spDayBounds(PRICE_DAILY_REGIME_START).start.toISOString();
  const [estado, eventos, cotacao] = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    const e = await tx.execute<Row>(sql`
      SELECT s.day::text AS day, s.min_cents, s.avg_cents, s.median_offer_day_cents, s.n_offers, s.quality,
             CASE WHEN s.day >= ${PRICE_DAILY_REGIME_START}::date THEN s.members END AS members,
             s.composition_flag, s.matched_change_pct, po.last_observed_at AS anchor_at,
             CASE WHEN sl.nickname IS NOT NULL THEN sl.nickname || ' (' || n.name || ')' ELSE n.name END AS min_loja
      FROM price_daily_state s
      LEFT JOIN price_daily_offer po ON po.offer_id = s.min_offer_id AND po.day = s.day
      LEFT JOIN affiliate_offers o ON o.id = s.min_offer_id
      LEFT JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN affiliate_sellers sl ON sl.id = o.seller_id
      WHERE s.master_product_id = ${masterProductId}::uuid
      ORDER BY s.day
    `);
    const ev = await tx.execute<Row>(sql`
      SELECT e.at, e.min_cents, e.prev_min_cents, n.name AS network_name, n.slug AS network_slug, sl.nickname, ${weakSellerSql('sl')} AS weak,
             CASE WHEN n.slug = 'amazon' THEN COALESCE(o.last_price_confirmed_at, o.last_checked_at) END AS confirmed_at
      FROM price_min_events e
      LEFT JOIN affiliate_offers o ON o.id = e.offer_id
      LEFT JOIN affiliate_networks n ON n.id = COALESCE(o.network_id, e.network_id)
      LEFT JOIN affiliate_sellers sl ON sl.id = COALESCE(o.seller_id, e.seller_id)
      WHERE e.master_product_id = ${masterProductId}::uuid AND e.at >= ${inicio}::timestamptz
      ORDER BY e.at, e.id
      LIMIT 5000
    `);
    const q = await tx.execute<Row>(sql`
      SELECT MAX(d.last_observed_at) AS last_at
      FROM price_daily_offer d
      INNER JOIN affiliate_offers o ON o.id = d.offer_id
      WHERE d.master_product_id = ${masterProductId}::uuid AND d.day >= ${PRICE_DAILY_REGIME_START}::date
        AND o.status = 'active' AND ${eligibleOfferSql('o')}
    `);
    return [e, ev, q] as const;
  });

  const linhasEstado: LinhaEstado[] = estado.map((r) => ({
    day: String(r.day),
    min_cents: r.min_cents == null ? null : Number(r.min_cents),
    avg_cents: r.avg_cents == null ? null : Number(r.avg_cents),
    median_offer_day_cents: r.median_offer_day_cents == null ? null : Number(r.median_offer_day_cents),
    n_offers: r.n_offers == null ? null : Number(r.n_offers),
    quality: String(r.quality),
    members: r.members == null ? null : ((typeof r.members === 'string' ? JSON.parse(r.members) : r.members) as Record<string, number>),
    composition_flag: r.composition_flag == null ? null : Boolean(r.composition_flag),
    matched_change_pct: r.matched_change_pct == null ? null : Number(r.matched_change_pct),
    anchor_at: iso(r.anchor_at),
    min_loja: r.min_loja == null ? null : String(r.min_loja),
  }));
  const linhasEvento: LinhaEvento[] = eventos.map((r) => {
    const rede = String(r.network_name ?? '');
    const apelido = r.nickname ? String(r.nickname) : '';
    return {
      at: iso(r.at) as string,
      min_cents: Number(r.min_cents),
      prev_min_cents: r.prev_min_cents == null ? null : Number(r.prev_min_cents),
      loja: apelido ? `${apelido} (${rede})` : rede || 'Loja',
      rede: String(r.network_slug ?? '') || rede,
      confirmed_at: iso(r.confirmed_at),
      weak: r.weak === true,
    };
  });
  const dados = montarGraficoDados(linhasEstado, linhasEvento, iso(cotacao[0]?.last_at), agora);
  return dados.dias.length ? dados : null;
}

/** Versão em cache SWR (mesmos parâmetros do gráfico V2 atual). null = produto sem nenhum dia medido no regime atual. */
export const getGraficoDados: (masterProductId: string) => Promise<GraficoDados | null> = createCachedQuery(carregar, ['grafico-dados-v3-1'], {
  revalidate: 60,
  coldTimeoutSeconds: 5,
  live: true,
  hardTimeoutSeconds: 20,
});

/** Sem cache (testes e medições). */
export const carregarGraficoDados = carregar;

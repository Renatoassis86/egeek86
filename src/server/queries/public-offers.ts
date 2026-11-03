import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { offerExcludedTitleSql } from '@/lib/affiliate/offer-identity-sql';
import {
  OFFER_FRESHNESS_DAYS,
  PLAUSIBILITY_FLOOR_PERCENT,
  PLAUSIBILITY_MIN_OFFERS,
  SELLER_MIN_SALES_FOR_LOW,
} from '@/lib/affiliate/price-verdict';

/**
 * Elegibilidade PÚBLICA de oferta (ADR 0002). Só LEITURA: nada é escrito nem
 * apagado; oferta fora do critério continua no banco e no histórico, apenas
 * não entra em "preço atual", vitrine, tabela, alerta nem contagem pública.
 *
 * Uma oferta é pública quando TODAS valem:
 *  1. status = 'active' e current_price_cents > 0 (concorrência real).
 *  2. Coleta real recente: last_checked_at <= OFFER_FRESHNESS_DAYS dias E há
 *     prova de que a coleta funcionou:
 *       a) a própria oferta teve cotação nova (last_price_change_at, ou
 *          created_at quando nunca mudou) dentro da janela; OU
 *       b) a rede está "viva": existe oferta ANTIGA (criada antes da janela)
 *          da mesma rede cujo preço mudou dentro da janela, o que só acontece
 *          se o coletor da rede realmente consulta a fonte.
 *     Motivo: o coletor grava last_checked_at no `finally`, inclusive quando a
 *     fonte lança erro (a fonte Shopee sempre lança). Sozinho, last_checked_at
 *     faz oferta sem coleta parecer "verificada agora".
 *  3. Plausibilidade: com >= PLAUSIBILITY_MIN_OFFERS ofertas frescas no
 *     produto, preço ESTRITAMENTE acima de PLAUSIBILITY_FLOOR_PERCENT % da mediana dessas ofertas
 *     (a borda exata não passa: o GT7 de R$ 70,00 passava por 3 centavos com `>=`).
 *     Com menos ofertas não há régua confiável e a oferta passa.
 */

/**
 * PORTEIRO DO CATÁLOGO (src/lib/catalog/gate.ts), camada SQL: o veredito gravado
 * em master_products.attributes.catalogGate. Sem veredito gravado = visível (a
 * camada TS de catalog-dimensions.ts ainda avalia ao vivo). 'review' e
 * 'rejected' ficam fora de vitrine, busca, monitorar e de TODO indicador
 * (média/mediana/menor preço), mas continuam no banco e no histórico.
 * `masterIdCol` = coluna do id do master na consulta.
 */
export function catalogGateVisibleSql(masterIdCol: string): SQL {
  const c = sql.raw(masterIdCol.replace(/[^a-z0-9_.]/gi, ''));
  // NOT IN (subconsulta) em vez de JOIN: o JOIN com master_products tornava a agregação de ~3 M de
  // cotações 10x mais lenta (medido: 18,5 s contra 1,5 s) e estourava o statement_timeout da home.
  return sql`${c} NOT IN (SELECT gm.id FROM master_products gm WHERE gm.attributes -> 'catalogGate' ->> 'verdict' IN ('review', 'rejected'))`;
}

/**
 * IDENTIDADE DA OFERTA (decisões do dono, 2026-11-03; ADR 0006). Open Box e
 * usado/seminovo/recondicionado são condição própria, e anúncio que cita duas
 * gerações (PS4 e PS5, Xbox One e Series, Switch 1 e 2) sem deixar claro o disco
 * fica "em revisão": essas ofertas ficam FORA de média, mediana, menor preço,
 * selo e vitrine (continuam no banco e no histórico; nada é apagado).
 *
 * Espelha em SQL `offerTitleFlags` (src/lib/affiliate/offer-identity.ts) sobre
 * `affiliate_offers.title`. Aproximação deliberada (regex do Postgres, sem
 * acento: `[aã]`); a paridade com a função TS é medida pelo dry-run da etapa 1.
 * Quando a coluna `identity_state` existir (proposta de migration do ADR 0006),
 * esta função passa a ler a coluna e o regex sai.
 *
 * NOT IN (subconsulta sobre as ofertas) em vez de regex por linha de cotação:
 * a regex roda uma vez por oferta (~dezenas de milhares), não por cotação (~3 M).
 * `offerIdCol` = coluna do id da oferta na consulta.
 */
export function offerIdentityVisibleSql(offerIdCol: string, options: { activeOnly?: boolean } = {}): SQL {
  // activeOnly: quem só olha ofertas ativas (fresh_offers) não precisa varrer as ~8 mil encerradas (~45% menos tempo).
  const scope = options.activeOnly ? sql`xo.status = 'active' AND ` : sql``;
  const c = sql.raw(offerIdCol.replace(/[^a-z0-9_.]/gi, ''));
  // QUARENTENA DE PREÇO ABSURDO (migration 0023, delegação 2026-11-03): `quarantined_at` preenchido tira a
  // oferta e as cotações dela de TODO consumidor desta função (ofertas públicas, estatísticas, histórico).
  // Vale para qualquer status (histórico absurdo de oferta encerrada também), por isso fica fora do `scope`.
  return sql`${c} NOT IN (SELECT xo.id FROM affiliate_offers xo INNER JOIN master_products xm ON xm.id = xo.master_product_id CROSS JOIN LATERAL (SELECT lower(xo.title) AS lt) xl WHERE (${scope}${offerExcludedTitleSql('xl.lt', 'xm.product_type', 'xm.game_format')}) OR xo.quarantined_at IS NOT NULL)`;
}

/**
 * Oferta fora de quarentena (migration 0023). Para consultas que NÃO passam por `offerIdentityVisibleSql`
 * nem por `publicOffersCtes`. `alias` = alias de affiliate_offers na consulta.
 */
export function notQuarantinedSql(alias: string): SQL {
  return sql`${sql.raw(alias.replace(/[^a-z0-9_]/gi, ''))}.quarantined_at IS NULL`;
}

/**
 * UMA definição de mediana para todo o site (ofertas públicas e cotações do
 * histórico): `percentile_cont(0.5)`. `col` é um fragmento de coluna.
 */
export function medianSql(col: SQL | string): SQL {
  const c = typeof col === 'string' ? sql.raw(col) : col;
  return sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${c})`;
}

/**
 * Vendedor fraco (leitura): reputação vermelha/laranja, ou vendas conhecidas
 * < SELLER_MIN_SALES_FOR_LOW sem power seller. Sem vendedor ou sem dado NÃO é
 * fraco. `alias` = alias de affiliate_sellers. ESPELHA `sellerTier` (price-verdict.ts).
 */
export function weakSellerSql(alias: string): SQL {
  const a = sql.raw(alias.replace(/[^a-z0-9_]/gi, ''));
  const minSales = sql.raw(String(Math.trunc(SELLER_MIN_SALES_FOR_LOW)));
  return sql`COALESCE(
    ${a}.id IS NOT NULL AND (
      COALESCE(${a}.reputation_level, '') ~ '(red|orange)$'
      OR (COALESCE(${a}.power_seller_status, '') = '' AND ${a}.total_sales IS NOT NULL AND ${a}.total_sales < ${minSales})
    ), false)`;
}

/** Definições de CTE para usar em `WITH ${publicOffersCtes()} ...`. Expõe `public_offers(id, master_product_id, current_price_cents)`. */
export function publicOffersCtes(): SQL {
  const days = sql.raw(String(Math.trunc(OFFER_FRESHNESS_DAYS)));
  const floor = sql.raw(String(PLAUSIBILITY_FLOOR_PERCENT / 100));
  const minOffers = sql.raw(String(Math.trunc(PLAUSIBILITY_MIN_OFFERS)));
  return sql`
    live_networks AS (
      SELECT DISTINCT lo.network_id
      FROM affiliate_offers lo
      WHERE lo.created_at < now() - interval '${days} days'
        AND lo.last_price_change_at >= now() - interval '${days} days'
    ),
    fresh_offers AS (
      SELECT fo.id, fo.master_product_id, fo.current_price_cents
      FROM affiliate_offers fo
      WHERE ${catalogGateVisibleSql('fo.master_product_id')}
        AND ${offerIdentityVisibleSql('fo.id', { activeOnly: true })}
        AND fo.status = 'active'
        AND fo.current_price_cents > 0
        AND fo.last_checked_at >= now() - interval '${days} days'
        AND (
          COALESCE(fo.last_price_change_at, fo.created_at) >= now() - interval '${days} days'
          OR fo.network_id IN (SELECT network_id FROM live_networks)
        )
    ),
    product_median AS (
      SELECT fo.master_product_id,
             COUNT(*)::int AS offer_count,
             ${medianSql('fo.current_price_cents')} AS median_cents
      FROM fresh_offers fo
      GROUP BY fo.master_product_id
    ),
    public_offers AS (
      SELECT f.id, f.master_product_id, f.current_price_cents
      FROM fresh_offers f
      INNER JOIN product_median m ON m.master_product_id = f.master_product_id
      WHERE m.offer_count < ${minOffers}
         OR f.current_price_cents > m.median_cents * ${floor}
    )
  `;
}

/**
 * Das ofertas pedidas, quais são públicas (mesmo critério acima). Para páginas
 * de detalhe e qualquer lista montada fora das consultas deste módulo.
 */
export async function filterPublicOfferIds(offerIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(offerIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await db.execute<{ id: string }>(sql`
    WITH ${publicOffersCtes()}
    SELECT po.id FROM public_offers po
    WHERE po.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
  return new Set(rows.map((r) => r.id));
}

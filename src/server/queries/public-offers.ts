import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  OFFER_FRESHNESS_DAYS,
  PLAUSIBILITY_FLOOR_PERCENT,
  PLAUSIBILITY_MIN_OFFERS,
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
 *     produto, preço >= PLAUSIBILITY_FLOOR_PERCENT % da mediana dessas ofertas.
 *     Com menos ofertas não há régua confiável e a oferta passa.
 */

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
      WHERE fo.status = 'active'
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
             percentile_cont(0.5) WITHIN GROUP (ORDER BY fo.current_price_cents) AS median_cents
      FROM fresh_offers fo
      GROUP BY fo.master_product_id
    ),
    public_offers AS (
      SELECT f.id, f.master_product_id, f.current_price_cents
      FROM fresh_offers f
      INNER JOIN product_median m ON m.master_product_id = f.master_product_id
      WHERE m.offer_count < ${minOffers}
         OR f.current_price_cents >= m.median_cents * ${floor}
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

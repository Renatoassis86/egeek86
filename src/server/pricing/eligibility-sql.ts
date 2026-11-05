import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { offerExcludedTitleSql } from '@/lib/affiliate/offer-identity-sql';
import { EXCLUDE_REDUNDANT_PLACEHOLDER } from '@/lib/pricing/price-metrics-config';
import { catalogGateVisibleSql } from '@/server/queries/public-offers';

/**
 * ELEGIBILIDADE da oferta para as métricas diárias (parte SQL da regra única; a parte numérica é
 * `src/lib/pricing/daily-state.ts`). Uma oferta é elegível quando TODAS valem:
 *   1. fora de quarentena (`quarantined_at IS NULL`, migration 0023);
 *   2. identidade visível: item NOVO, sem Open Box/usado/recondicionado e sem cross-gen em revisão
 *      (mesmo regex de `offerIdentityVisibleSql`, em forma CORRELACIONADA por oferta: serve ao lote do job e ao
 *      gancho da coleta, que olha poucas ofertas, sem varrer todo o catálogo);
 *   3. produto aprovado pelo porteiro do catálogo (`catalogGateVisibleSql`: fora 'review'/'rejected').
 * Equivalência com `offerIdentityVisibleSql` + `catalogGateVisibleSql` é conferida por `scripts/test-daily-state-db.ts`.
 * `alias` = alias de affiliate_offers na consulta.
 */
export function eligibleOfferSql(alias = 'o'): SQL {
  const a = alias.replace(/[^a-z0-9_]/gi, '');
  const col = (c: string) => sql.raw(`${a}.${c}`);
  // Placeholder redundante fora (EXCLUDE_REDUNDANT_PLACEHOLDER): há oferta ativa com vendedor na mesma rede/produto.
  const redundantPlaceholder = EXCLUDE_REDUNDANT_PLACEHOLDER
    ? sql`AND NOT (${col('seller_id')} IS NULL AND EXISTS (
        SELECT 1 FROM affiliate_offers rs
        WHERE rs.master_product_id = ${col('master_product_id')} AND rs.network_id = ${col('network_id')}
          AND rs.seller_id IS NOT NULL AND rs.status = 'active' AND rs.quarantined_at IS NULL
      ))`
    : sql``;
  return sql`(
    ${col('quarantined_at')} IS NULL
    ${redundantPlaceholder}
    AND ${catalogGateVisibleSql(`${a}.master_product_id`)}
    AND NOT EXISTS (
      SELECT 1 FROM master_products xm
      CROSS JOIN LATERAL (SELECT lower(${col('title')}) AS lt) xl
      WHERE xm.id = ${col('master_product_id')}
        AND ${offerExcludedTitleSql('xl.lt', 'xm.product_type', 'xm.game_format')}
    )
  )`;
}

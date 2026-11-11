import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { AMAZON_MODE_VERTICALS, AMAZON_NETWORK_SLUG, type AmazonScope } from '@/lib/pricing/amazon-mode';

/**
 * Filtro SQL ÚNICO da Amazon nas leituras de indicadores públicos (flag `PRICE_AMAZON_MODE`, ver `src/lib/pricing/amazon-mode.ts`).
 *  - `exclude`: a oferta não pode ser da rede Amazon (comportamento de `off` e `shadow`);
 *  - `include`: a Amazon entra só nos departamentos liberados (D5: games até a Black Friday).
 * `alias` = alias de affiliate_offers. Não depende de join com affiliate_networks.
 */
export function amazonScopeSql(scope: AmazonScope, alias = 'o'): SQL {
  const a = alias.replace(/[^a-z0-9_]/gi, '');
  const net = sql.raw(`${a}.network_id`);
  const vert = sql.raw(`${a}.vertical`);
  const amazonIds = sql`(SELECT id FROM affiliate_networks WHERE slug = ${AMAZON_NETWORK_SLUG})`;
  if (scope === 'exclude') return sql`${net} NOT IN ${amazonIds}`;
  const verts = sql.join(AMAZON_MODE_VERTICALS.map((v) => sql`${v}`), sql`, `);
  return sql`(${net} NOT IN ${amazonIds} OR ${vert} IN (${verts}))`;
}

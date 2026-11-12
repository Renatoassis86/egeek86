/** Detalha UM tipo de uma loja Plus (somente leitura): uso npx tsx --conditions=react-server --env-file=.env.local scripts/medir-funil-plus-tipo.ts eletroeletronicos smart-tv */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { eligibleOfferSql } from '../src/server/pricing/eligibility-sql';
import { inAverageSql } from '../src/server/queries/public-offers';
import { masterNoEscopoSql } from '../src/server/queries/escopo-vitrine';
import { detectGroupCandidates, pickProductIds } from '../src/server/messaging/group-offers';
import { RULES } from '../src/lib/messaging/group-rules';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
type Row = Record<string, unknown>;
async function main() {
  const [vert, tipo] = process.argv.slice(2);
  const now = new Date();
  const since = new Date(now.getTime() - RULES.DETECT_MAX_AGE_MIN * 60_000).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT m.id, m.name, array_agg(o.current_price_cents ORDER BY o.current_price_cents) AS precos,
           array_agg(DISTINCT n.slug) AS redes, count(DISTINCT COALESCE(o.seller_id::text, o.id::text)) AS vend,
           bool_or(o.affiliate_link_pending OR (n.slug='mercado-livre' AND COALESCE(o.affiliate_url,'') NOT LIKE 'https://meli.la/%')) AS algum_link_pend
    FROM master_products m JOIN affiliate_offers o ON o.master_product_id = m.id JOIN affiliate_networks n ON n.id = o.network_id
    WHERE m.vertical = ${vert} AND o.status='active' AND o.quarantined_at IS NULL AND o.current_price_cents>0 AND o.last_price_confirmed_at >= ${since}::timestamptz
      AND ${eligibleOfferSql('o')} AND ${inAverageSql('o')} AND ${masterNoEscopoSql('m')}
    GROUP BY m.id, m.name`);
  const ms = rows.filter((r) => classificarTipo(vert, String(r.name)) === tipo);
  const pool = new Set(await pickProductIds({ verticals: [vert], now, maxAgeMin: RULES.DETECT_MAX_AGE_MIN, amazonMaxAgeMin: RULES.AMAZON_DETECT_MAX_AGE_MIN, eventWindowHours: 24, maxProducts: 900, achado: true }));
  const r = await detectGroupCandidates({ now, verticals: [vert], productIds: ms.map((x) => String(x.id)), history: [], includePlatform: false, achado: true });
  for (const m of ms) {
    const id = String(m.id);
    const c = r.candidates.filter((x) => x.masterProductId === id).map((x) => `${x.trigger}:${x.sendable ? 'ok' : x.notSendableReason}:${x.status}`);
    const b = r.blocked.filter((x) => x.masterProductId === id).map((x) => x.reasons.join('+'));
    console.log([String(m.name).slice(0, 48).padEnd(48), 'ofertas', (m.precos as unknown[]).length, 'vend', m.vend, 'redes', (m.redes as string[]).join('/'), 'min', Number((m.precos as number[])[0]) / 100, 'pool', pool.has(id) ? 'S' : 'n', 'linkPend', m.algum_link_pend ? 'S' : 'n', '|', c.join(',') || '-', '|', b.join(',') || '-'].join(' '));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

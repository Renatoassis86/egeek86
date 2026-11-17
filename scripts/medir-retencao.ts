/**
 * MEDIDOR DE RETENCAO (dono, 2026-11-17: "nenhum produto fique retido ... O site precisa ter todos os produtos ativos sempre. So sai quando nao estiver mais ativo no link").
 * Mede, so leitura, quantas ofertas ATIVAS com preco estao fora de site/mensagens e POR QUE. npx tsx --conditions=react-server --env-file=.env.local scripts/medir-retencao.ts
 * Causas: quarentena | porteiro (review/rejected por escopo) | link de afiliado pendente | rascunho (identidade) | leitura velha (> 7 d).
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { linkPublicavelFilter } from '../src/server/queries/public-offers';

(async () => {
  const q = async (t: string, s: ReturnType<typeof sql>) => { console.log(t, JSON.stringify(await db.execute(s))); };
  await q('FUNIL (ofertas ativas com preco)', sql`
    WITH a AS (SELECT (o.quarantined_at IS NOT NULL) quar, ((m.attributes->'catalogGate'->>'verdict') IN ('review','rejected')) gate, NOT (${linkPublicavelFilter('o')}) semlink,
        (o.last_checked_at IS NULL OR o.last_checked_at < now() - interval '7 days') velha
      FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id WHERE o.status = 'active' AND o.current_price_cents > 0)
    SELECT count(*)::int ativas, count(*) FILTER (WHERE quar)::int quarentena, count(*) FILTER (WHERE gate)::int porteiro, count(*) FILTER (WHERE semlink)::int link_pendente,
      count(*) FILTER (WHERE velha)::int leitura_velha, count(*) FILTER (WHERE NOT quar AND NOT gate AND NOT semlink AND NOT velha)::int livres FROM a`);
  await q('RASCUNHOS (identidade nao resolvida)', sql`SELECT n.slug, count(*)::int n FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'draft' AND o.current_price_cents > 0 GROUP BY 1`);
  await q('MASTERS por departamento (com ativa x visivel no site)', sql`
    SELECT m.vertical v, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0))::int com_ativa,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0 AND o.quarantined_at IS NULL AND ${linkPublicavelFilter('o')} AND o.last_checked_at > now() - interval '7 days')
        AND COALESCE(m.attributes->'catalogGate'->>'verdict', '') NOT IN ('review', 'rejected'))::int visivel
    FROM master_products m GROUP BY 1 ORDER BY 1`);
  await q('PORTEIRO por motivo (masters com oferta ativa)', sql`SELECT m.vertical v, m.attributes->'catalogGate'->>'verdict' ver, split_part(COALESCE(m.attributes->'catalogGate'->>'reason', ''), ':', 1) motivo, count(DISTINCT m.id)::int masters
    FROM master_products m WHERE m.attributes->'catalogGate'->>'verdict' IN ('review', 'rejected') AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0) GROUP BY 1, 2, 3 ORDER BY masters DESC LIMIT 25`);
  await q('QUARENTENA por motivo', sql`SELECT split_part(COALESCE(o.quarantine_reason, ''), ':', 1) motivo, count(*)::int n FROM affiliate_offers o WHERE o.status = 'active' AND o.current_price_cents > 0 AND o.quarantined_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  await q('FORA DO AR (nao ativas)', sql`SELECT o.status::text, count(*)::int n, count(*) FILTER (WHERE o.last_checked_at > now() - interval '3 days')::int lidas_3d FROM affiliate_offers o WHERE o.status NOT IN ('active', 'draft') GROUP BY 1`);
  process.exit(0);
})().catch((e) => { console.error(String(e?.message ?? e).slice(0, 400)); process.exit(1); });

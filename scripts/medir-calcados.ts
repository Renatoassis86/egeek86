/** Mede calçados (somente leitura): npx tsx --conditions=react-server --env-file=.env.local scripts/medir-calcados.ts */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
type Row = Record<string, unknown>;
const RE = "(^|[^a-z])(tenis|tênis|chuteira|chuteiras|sapato|sapatos|sapatilha|sapatilhas|sandalia|sandália|chinelo|chinelos|bota|botas|sapatenis|papete)([^a-z]|$)";
async function main() {
  const q = async (t: string, s: ReturnType<typeof sql>) => { console.log('\n== ' + t); console.table(await db.execute<Row>(s)); };
  await q('ofertas por rede/status/vertical do master (titulo calcado, sem "tenis de mesa")', sql`
    SELECT n.slug AS rede, o.status, m.vertical, count(*)::int AS ofertas, count(DISTINCT m.id)::int AS masters
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id JOIN master_products m ON m.id=o.master_product_id
    WHERE lower(o.title) ~ ${RE} AND lower(o.title) !~ 'tenis de mesa|tênis de mesa|bota[oõ]|tenis de mesa'
    GROUP BY 1,2,3 ORDER BY 1,2,3`);
  await q('masters calcado esporte: chaves de attributes.vertical', sql`
    SELECT k AS chave, count(*)::int FROM master_products m, jsonb_object_keys(COALESCE(m.attributes->'vertical','{}'::jsonb)) k
    WHERE lower(m.name) ~ ${RE} GROUP BY 1 ORDER BY 2 DESC`);
  await q('amostra de 15 masters calcado (qualquer vertical)', sql`
    SELECT m.vertical, left(m.name,60) AS nome, m.attributes->'vertical'->>'aprovacao' AS apr, m.attributes->'vertical'->'foraDeEscopo'->>'motivo' AS fora
    FROM master_products m WHERE lower(m.name) ~ ${RE} ORDER BY random() LIMIT 15`);
  await q("masters por segment (tenis/chuteira)", sql`SELECT m.attributes->'vertical'->>'segment' AS segmento, m.attributes->'vertical'->>'source' AS fonte, count(*)::int AS masters, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id=m.id AND o.status='active'))::int AS com_oferta_ativa FROM master_products m WHERE m.vertical='esporte' AND m.attributes->'vertical'->>'segment' IN ('tenis','chuteira') GROUP BY 1,2`);
  await q("calcado real (exclui raquete/bolsa/mochila) por rede", sql`SELECT n.slug AS rede, o.status, count(*)::int AS ofertas, count(DISTINCT o.master_product_id)::int AS masters FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id WHERE lower(o.title) ~ ${RE} AND lower(o.title) !~ 'raquete|bolsa|mochila|tenis de mesa|grade|secar|squash|beach|bola|bolas' GROUP BY 1,2`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

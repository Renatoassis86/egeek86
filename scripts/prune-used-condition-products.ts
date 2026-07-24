import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

/**
 * Remove produtos usados/seminovos já catalogados por engano — pedido
 * explícito do cliente (2026-07-24): Geek Deals só trabalha com item NOVO,
 * nunca usado/seminovo das plataformas de afiliado.
 *
 * Limitação honesta: só pega o que o TÍTULO denuncia textualmente ("Usado",
 * "Seminovo", etc). O Mercado Livre expõe um campo `condition` estruturado
 * que pegaria usados sem a palavra no título, mas isso não é armazenado no
 * banco hoje — auditar isso exigiria reconsultar cada uma das ~4400 ofertas
 * já catalogadas contra a API ao vivo (custo de tempo/rate-limit real, não
 * incluído aqui). O filtro de descoberta (discover-products.ts) já corta
 * daqui pra frente usando o campo estruturado quando disponível.
 *
 * Uso: npx tsx scripts/prune-used-condition-products.ts
 */
const USED_PATTERN =
  "\\musados?\\M|\\musadas?\\M|semi.?novos?|semi.?novas?|recondicionados?|recondicionadas?|segunda.?m[aã]o";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 15 });

  try {
    const matches = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM master_products WHERE name ~* ${USED_PATTERN}
    `;
    console.log('Produtos usados/seminovos encontrados:', matches.length);
    for (const m of matches) console.log(' -', m.name);

    if (matches.length === 0) {
      await sql.end();
      return;
    }

    const ids = matches.map((m) => m.id);

    await sql`DELETE FROM affiliate_price_snapshots WHERE offer_id IN (SELECT id FROM affiliate_offers WHERE master_product_id = ANY(${ids}))`;
    await sql`DELETE FROM affiliate_offers WHERE master_product_id = ANY(${ids})`;
    const result = await sql`DELETE FROM master_products WHERE id = ANY(${ids})`;

    console.log('Produtos removidos:', result.count);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

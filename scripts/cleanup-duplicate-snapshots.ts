import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

/**
 * Limpeza única de histórico já inflado: antes da correção em
 * record-price-snapshot.ts, toda checagem periódica gravava uma linha em
 * affiliate_price_snapshots mesmo com preço idêntico ao anterior. Produtos
 * monitorados há tempo acumularam dezenas de milhares de linhas repetidas
 * (ex: uma oferta de Minecraft chegou a ~1000 duplicatas consecutivas do
 * mesmo preço), deixando a query de histórico lenta o bastante pra estourar
 * o timeout da função serverless em produção.
 *
 * Critério idêntico ao já aplicado prospectivamente: remove uma linha só
 * quando o preço dela é igual ao da linha cronologicamente anterior da MESMA
 * oferta — nunca remove a primeira linha de uma oferta, nem uma transição de
 * preço real. Idempotente: rodar de novo depois de já limpo não apaga nada.
 *
 * Uso: DATABASE_URL=... npx tsx scripts/cleanup-duplicate-snapshots.ts
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 15 });

  try {
    const [{ total_before }] = await sql<{ total_before: string }[]>`
      SELECT COUNT(*)::bigint AS total_before FROM affiliate_price_snapshots
    `;
    console.log('Total antes da limpeza:', total_before);

    const result = await sql`
      WITH ranked AS (
        SELECT id, offer_id, price_cents, collected_at,
          LAG(price_cents) OVER (PARTITION BY offer_id ORDER BY collected_at, id) AS prev_price_cents
        FROM affiliate_price_snapshots
      )
      DELETE FROM affiliate_price_snapshots
      WHERE id IN (
        SELECT id FROM ranked WHERE prev_price_cents IS NOT NULL AND prev_price_cents = price_cents
      )
    `;
    console.log('Linhas removidas:', result.count);

    const [{ total_after }] = await sql<{ total_after: string }[]>`
      SELECT COUNT(*)::bigint AS total_after FROM affiliate_price_snapshots
    `;
    console.log('Total depois da limpeza:', total_after);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

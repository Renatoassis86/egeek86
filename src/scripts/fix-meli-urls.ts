import 'dotenv/config';
import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Verificando URLs do Mercado Livre no banco...');
  
  const result = await db.execute<{ count: string }>(sql`
    UPDATE affiliate_offers
    SET affiliate_url = regexp_replace(affiliate_url, 'mercadolivre\.com\.br/(MLB)(\d+)', 'mercadolivre.com.br/\1-\2', 'gi')
    WHERE affiliate_url ~* 'mercadolivre\.com\.br/MLB\d+'
    RETURNING id;
  `);

  console.log(`Linhas de ofertas atualizadas no banco: ${result.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro na atualização:', err);
  process.exit(1);
});

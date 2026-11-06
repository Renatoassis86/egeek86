import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * O produto mestre existe? Consulta LEVE por chave primária (uma linha, sem junção), usada pelas rotas de dados da camada ANTES de
 * qualquer consulta de métricas: um UUID inexistente custa 1 consulta barata em vez de 3 a 10. Propositalmente SEM cache em memória:
 * o cache não pode crescer com UUIDs inexistentes (o negativo é cacheado no CDN, por cabeçalho). `id` já vem validado como UUID.
 */
export async function produtoExiste(masterProductId: string): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM master_products WHERE id = ${masterProductId}::uuid LIMIT 1`);
  return rows.length > 0;
}

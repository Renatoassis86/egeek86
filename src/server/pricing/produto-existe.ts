import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { Vertical } from '@/lib/catalog/verticais';

/**
 * O produto mestre existe? Consulta LEVE por chave primária (uma linha, sem junção), usada pelas rotas de dados da camada ANTES de
 * qualquer consulta de métricas: um UUID inexistente custa 1 consulta barata em vez de 3 a 10. Propositalmente SEM cache em memória:
 * o cache não pode crescer com UUIDs inexistentes (o negativo é cacheado no CDN, por cabeçalho). `id` já vem validado como UUID.
 */
export async function produtoExiste(masterProductId: string, vertical: Vertical): Promise<boolean> {
  const rows = await db.execute<{ vertical: string }>(sql`SELECT vertical FROM master_products WHERE id = ${masterProductId}::uuid LIMIT 1`);
  // ISOLAMENTO (ADR 0008): produto de OUTRO departamento "não existe" para esta superfície (404), mesmo por URL/UUID direto.
  // A comparação é em JS (a consulta continua uma leitura por PK); `vertical` é obrigatório, sem default.
  return rows.length > 0 && rows[0].vertical === vertical;
}

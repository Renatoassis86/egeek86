import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Grava sold_quantity (+ sold_quantity_at) numa oferta. SQL cru de proposito: o schema Drizzle nao tem as colunas (migracao 0045 e proposta,
 * mesmo molde da 0044). So e chamado quando a API entregou o valor; falha NUNCA derruba a coleta de preco.
 * Valvula: SOLD_QUANTITY_DISABLED=1 desliga. Se a coluna nao existe (42703), desliga ate o fim do processo e avisa uma vez.
 */
let disabled = false;

export async function saveOfferSoldQuantity(offerId: string, soldQuantity: number): Promise<boolean> {
  if (disabled || process.env.SOLD_QUANTITY_DISABLED === '1') return false;
  try {
    await db.execute(sql`UPDATE affiliate_offers SET sold_quantity = ${soldQuantity}, sold_quantity_at = now() WHERE id = ${offerId}`);
    return true;
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === '42703') {
      disabled = true;
      console.warn('[sold-quantity] colunas da migracao 0045 ausentes: gravacao de sold_quantity desligada nesta execucao');
    } else {
      console.warn('[sold-quantity] falha ao gravar (ignorada):', (err as Error).message?.slice(0, 160));
    }
    return false;
  }
}

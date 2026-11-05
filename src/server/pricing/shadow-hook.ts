import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { spDay } from '@/lib/pricing/daily-state';
import { syncMinEvent, upsertOfferDays } from '@/server/pricing/price-daily';

/**
 * Gancho da coleta (modo SOMBRA, flag PRICE_DAILY_SHADOW=1): depois que `recordPriceSnapshot` grava uma
 * cotação nova, refaz a linha oferta-dia de HOJE daquela oferta e confere se o menor preço elegível do produto
 * mudou (evento em price_min_events). Uma consulta por índice (offer_id, collected_at) + leitura de um produto.
 */
export async function shadowAfterSnapshot(offerId: string): Promise<void> {
  const now = new Date();
  const today = spDay(now);
  await upsertOfferDays(db, today, today, offerId);
  const rows = await db.execute<{ master_product_id: string }>(sql`SELECT master_product_id FROM affiliate_offers WHERE id = ${offerId}`);
  const pid = rows[0]?.master_product_id;
  if (pid) await syncMinEvent(String(pid), now);
}

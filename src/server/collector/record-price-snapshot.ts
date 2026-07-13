import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliatePriceSnapshots } from '@/db/schema';

export interface RecordSnapshotInput {
  offerId: string;
  priceCents: number;
  listPriceCents?: number | null;
  couponCode?: string | null;
  source: 'manual' | 'api' | 'scrape';
}

/**
 * Insere o snapshot (histórico, append-only) e atualiza o cache
 * affiliate_offers.current_price_cents na mesma transação — caminho único
 * usado tanto pelo cadastro manual (admin) quanto pelo coletor automático,
 * pra não duplicar a lógica de sincronização do cache em dois lugares.
 */
export async function recordPriceSnapshot(input: RecordSnapshotInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(affiliatePriceSnapshots).values({
      offerId: input.offerId,
      priceCents: input.priceCents,
      listPriceCents: input.listPriceCents ?? null,
      couponCode: input.couponCode ?? null,
      source: input.source,
    });

    await tx
      .update(affiliateOffers)
      .set({ currentPriceCents: input.priceCents })
      .where(eq(affiliateOffers.id, input.offerId));
  });
}

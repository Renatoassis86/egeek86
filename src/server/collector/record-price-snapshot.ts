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
 *
 * Também marca a tag "vendedor alterou o preço" (last_price_change_at) quando
 * o preço novo difere do cache atual — não no primeiro snapshot de uma
 * oferta recém-criada (current == input.priceCents nesse caso, não conta
 * como mudança).
 */
export async function recordPriceSnapshot(input: RecordSnapshotInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ currentPriceCents: affiliateOffers.currentPriceCents })
      .from(affiliateOffers)
      .where(eq(affiliateOffers.id, input.offerId))
      .limit(1);

    await tx.insert(affiliatePriceSnapshots).values({
      offerId: input.offerId,
      priceCents: input.priceCents,
      listPriceCents: input.listPriceCents ?? null,
      couponCode: input.couponCode ?? null,
      source: input.source,
    });

    const priceChanged = current != null && current.currentPriceCents !== input.priceCents;

    await tx
      .update(affiliateOffers)
      .set({
        currentPriceCents: input.priceCents,
        ...(priceChanged
          ? { lastPriceChangeAt: new Date(), previousPriceCents: current.currentPriceCents }
          : {}),
      })
      .where(eq(affiliateOffers.id, input.offerId));
  });
}

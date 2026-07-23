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
 * Insere o snapshot (histórico, append-only) só quando o preço realmente
 * muda (ou é o primeiro snapshot da oferta) e atualiza o cache
 * affiliate_offers.current_price_cents na mesma transação — caminho único
 * usado tanto pelo cadastro manual (admin) quanto pelo coletor automático,
 * pra não duplicar a lógica de sincronização do cache em dois lugares.
 *
 * Sem o filtro de "preço mudou", toda checagem periódica (a cada 5-15min,
 * pra sempre — ver collect-prices.ts) virava uma linha nova mesmo com preço
 * idêntico ao anterior: um produto observado chegou a 15 mil linhas em 1 mês
 * só de preço repetido, deixando a consulta de histórico lenta e o gráfico
 * de cotações poluído. `last_checked_at` em affiliate_offers já registra
 * "quando foi checado pela última vez" — não precisa de uma linha de
 * histórico pra isso.
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

    const priceChanged = current == null || current.currentPriceCents !== input.priceCents;

    if (priceChanged) {
      await tx.insert(affiliatePriceSnapshots).values({
        offerId: input.offerId,
        priceCents: input.priceCents,
        listPriceCents: input.listPriceCents ?? null,
        couponCode: input.couponCode ?? null,
        source: input.source,
      });
    }

    await tx
      .update(affiliateOffers)
      .set({
        currentPriceCents: input.priceCents,
        ...(current != null && priceChanged
          ? { lastPriceChangeAt: new Date(), previousPriceCents: current.currentPriceCents }
          : {}),
      })
      .where(eq(affiliateOffers.id, input.offerId));
  });
}

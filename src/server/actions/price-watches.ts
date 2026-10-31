'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliatePriceWatches } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';
import { checkEligibility, suggestTargetPriceCents } from '@/lib/affiliate/price-verdict';
import { getMasterProductPriceStats } from '@/server/queries/product-price-stats';

/**
 * Acompanhar/parar de acompanhar um produto. Ao ACOMPANHAR grava o preço-alvo
 * sugerido (ceil(menor registrado * 1,05), ADR 0001 item 6) SÓ quando o
 * histórico é elegível (>= 5 cotações e >= 14 dias); sem base confiável o alvo
 * fica null (nada é inventado). Um alvo já existente (ex.: editado pelo
 * cliente) é preservado ao reativar.
 */
export async function toggleWatch(masterProductId: string, active: boolean): Promise<void> {
  const profile = await requireCustomer();

  let suggestedTarget: number | null = null;
  if (active) {
    const stats = await getMasterProductPriceStats(masterProductId);
    if (checkEligibility({ quoteCount: stats.quoteCount, historyDays: stats.historyDays }).eligible) {
      suggestedTarget = suggestTargetPriceCents(stats.lowAll?.priceCents);
    }
  }

  await db
    .insert(affiliatePriceWatches)
    .values({ userId: profile.id, masterProductId, isActive: active, targetPriceCents: suggestedTarget })
    .onConflictDoUpdate({
      target: [affiliatePriceWatches.userId, affiliatePriceWatches.masterProductId],
      set: active
        ? {
            isActive: true,
            targetPriceCents: sql`COALESCE(${affiliatePriceWatches.targetPriceCents}, ${suggestedTarget})`,
          }
        : { isActive: false },
    });

  revalidatePath('/conta');
  revalidatePath('/monitoramento');
}

/** Define (ou limpa, com null) o preço-alvo do alerta do cliente. Valor em centavos, inteiro > 0. */
export async function setWatchTarget(masterProductId: string, targetPriceCents: number | null): Promise<void> {
  const profile = await requireCustomer();

  if (targetPriceCents !== null && (!Number.isInteger(targetPriceCents) || targetPriceCents <= 0)) {
    throw new Error('Preço-alvo inválido.');
  }

  await db
    .update(affiliatePriceWatches)
    .set({ targetPriceCents })
    .where(and(eq(affiliatePriceWatches.userId, profile.id), eq(affiliatePriceWatches.masterProductId, masterProductId)));

  revalidatePath('/conta');
  revalidatePath('/monitoramento');
}

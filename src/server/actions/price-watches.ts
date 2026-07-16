'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { affiliatePriceWatches } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';

export async function toggleWatch(masterProductId: string, active: boolean): Promise<void> {
  const profile = await requireCustomer();

  await db
    .insert(affiliatePriceWatches)
    .values({ userId: profile.id, masterProductId, isActive: active })
    .onConflictDoUpdate({
      target: [affiliatePriceWatches.userId, affiliatePriceWatches.masterProductId],
      set: { isActive: active },
    });

  revalidatePath('/conta');
}

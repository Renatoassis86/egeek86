'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { profiles } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';

export type UpdateOwnProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Atualiza apenas os dados que a tabela `profiles` realmente guarda (nome e
 * telefone) do próprio usuário autenticado. Cidade, estado e biografia não
 * têm coluna e por isso não existem na tela.
 */
export async function updateOwnProfile(input: { name: string; phone: string }): Promise<UpdateOwnProfileResult> {
  const profile = await requireCustomer();

  const name = input.name.trim();
  const phone = input.phone.trim();

  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Informe um nome com 2 a 120 caracteres.' };
  }
  if (phone.length > 0 && !/^[0-9()+\-\s]{8,20}$/.test(phone)) {
    return { ok: false, error: 'Telefone inválido. Use apenas números, espaços, parênteses, + e -.' };
  }

  await db
    .update(profiles)
    .set({ name, phone: phone || null, updatedAt: new Date() })
    .where(eq(profiles.id, profile.id));

  revalidatePath('/conta');
  return { ok: true };
}

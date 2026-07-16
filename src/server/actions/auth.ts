'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { profiles } from '@/db/schema';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PLATFORM_VALUES } from '@/lib/auth/platforms';

const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((digits) => digits.length >= 10 && digits.length <= 13, {
    message: 'Informe um WhatsApp válido, com DDD.',
  })
  .transform((digits) => (digits.length <= 11 ? `55${digits}` : digits));

const completeRegistrationSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome completo'),
  phone: phoneSchema,
  platforms: z.array(z.enum(PLATFORM_VALUES)).min(1, 'Selecione ao menos uma plataforma'),
});

export type CompleteRegistrationInput = z.input<typeof completeRegistrationSchema>;

/**
 * Chamada direto do client logo após signUp() — não usa requireCustomer()
 * porque a linha em profiles ainda não existe nesse ponto (requireCustomer
 * redirecionaria antes de conseguir criá-la). Sem parâmetro `userId`: o id
 * vem só da sessão que o signUp() do browser client já deixou no cookie
 * (mesmo caminho de getCurrentProfile()) — não existe entrada pra um caller
 * sobrescrever de quem é o cadastro.
 */
export async function completeRegistration(
  input: CompleteRegistrationInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = completeRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Sessão expirada. Tente cadastrar novamente.' };
  }

  await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email ?? '',
      name: parsed.data.name,
      phone: parsed.data.phone,
      preferences: { platforms: parsed.data.platforms },
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        preferences: { platforms: parsed.data.platforms },
        updatedAt: new Date(),
      },
    });

  return { ok: true };
}

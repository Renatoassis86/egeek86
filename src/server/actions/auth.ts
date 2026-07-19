'use server';

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, sellers } from '@/db/schema';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PLATFORM_VALUES } from '@/lib/auth/platforms';

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  roleChoice: z.enum(['comprador', 'afiliado', 'colecionador']).default('comprador'),
  affiliateSocialLink: z.string().optional(),
  affiliateAudience: z.string().optional(),
  collectorSize: z.number().or(z.string().transform((v) => Number(v))).optional(),
  collectorFocus: z.string().optional(),
  collectorFacePhoto: z.string().optional(),
});

export type CompleteRegistrationInput = z.input<typeof completeRegistrationSchema>;

/**
 * Chamada direto do client logo após signUp() — salva o perfil do usuário,
 * o questionário de acesso escolhido e a foto de rosto/coleção para credenciamento.
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

  // Garante o tipo enum 'affiliate' no Postgres caso não exista
  try {
    await db.execute(sql`ALTER TYPE user_role ADD VALUE 'affiliate'`);
  } catch (e) {}

  let role: 'customer' | 'seller' | 'affiliate' = 'customer';

  const onboardingData: Record<string, any> = {
    platforms: parsed.data.platforms,
    roleChoice: parsed.data.roleChoice,
  };

  if (parsed.data.roleChoice === 'afiliado') {
    role = 'customer'; // Permanece customer até o admin aprovar a role 'affiliate'
    onboardingData.affiliateOnboarding = {
      status: 'pending',
      socialLink: parsed.data.affiliateSocialLink || '',
      audience: parsed.data.affiliateAudience || '',
      submittedAt: new Date().toISOString(),
    };
  } else if (parsed.data.roleChoice === 'colecionador') {
    role = 'customer'; // Permanece 'customer' (com status pending_kyc em sellers) até o administrador aprovar no admin
    onboardingData.collectorOnboarding = {
      status: 'pending_kyc',
      collectionSize: parsed.data.collectorSize || 0,
      focus: parsed.data.collectorFocus || '',
      facePhotoBase64: parsed.data.collectorFacePhoto || '',
      submittedAt: new Date().toISOString(),
    };
  }

  await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email ?? '',
      name: parsed.data.name,
      phone: parsed.data.phone,
      role: role,
      preferences: onboardingData,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        role: role,
        preferences: onboardingData,
        updatedAt: new Date(),
      },
    });

  // Se escolheu colecionador, cria o registro em sellers com status 'pending_kyc'
  if (parsed.data.roleChoice === 'colecionador') {
    const sellerSlug = slugify(`${parsed.data.name}-${user.id.slice(0, 6)}`);
    try {
      await db
        .insert(sellers)
        .values({
          userId: user.id,
          companyName: parsed.data.name,
          displayName: parsed.data.name,
          slug: sellerSlug,
          cnpj: `C2C-${user.id.slice(0, 8).toUpperCase()}`,
          emailBusiness: user.email ?? '',
          phone: parsed.data.phone,
          status: 'pending_kyc',
          description: `Coleção: ${parsed.data.collectorFocus || 'Colecionável'}`,
        })
        .onConflictDoNothing();
    } catch (e) {
      console.error('Failed to create seller record on registration:', e);
    }
  }

  return { ok: true };
}

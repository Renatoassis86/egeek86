'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { profiles, sellers } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/require-admin';

/**
 * Aprova o credenciamento de um Colecionador/Leiloeiro.
 * Altera sellers.status para 'active' e libera seus privilégios de postagem.
 */
export async function approveCollectorUser(userId: string) {
  await requireAdmin();

  try {
    // 1. Atualiza o status do vendedor para 'active'
    await db
      .update(sellers)
      .set({
        status: 'active',
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sellers.userId, userId));

    // 2. Garante o papel 'seller' no perfil
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (profile) {
      const existingPref = (profile.preferences as Record<string, any>) || {};
      const updatedPref = {
        ...existingPref,
        collectorOnboarding: {
          ...(existingPref.collectorOnboarding || {}),
          status: 'approved',
          approvedAt: new Date().toISOString(),
        },
      };

      await db
        .update(profiles)
        .set({
          role: 'seller',
          preferences: updatedPref,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));
    }

    revalidatePath('/admin/usuarios');
    revalidatePath('/admin/colecionadores');
    return { ok: true, message: 'Colecionador aprovado com sucesso!' };
  } catch (error) {
    console.error('Erro ao aprovar colecionador:', error);
    return { ok: false, error: 'Ocorreu um erro ao aprovar o colecionador.' };
  }
}

/**
 * Aprova a solicitação de papel Afiliado.
 * Promove profiles.role para 'affiliate'.
 */
export async function approveAffiliateUser(userId: string) {
  await requireAdmin();

  try {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!profile) return { ok: false, error: 'Usuário não encontrado.' };

    const existingPref = (profile.preferences as Record<string, any>) || {};
    const updatedPref = {
      ...existingPref,
      affiliateOnboarding: {
        ...(existingPref.affiliateOnboarding || {}),
        status: 'approved',
        approvedAt: new Date().toISOString(),
      },
    };

    await db
      .update(profiles)
      .set({
        role: 'affiliate',
        preferences: updatedPref,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId));

    revalidatePath('/admin/usuarios');
    return { ok: true, message: 'Afiliado aprovado com sucesso!' };
  } catch (error) {
    console.error('Erro ao aprovar afiliado:', error);
    return { ok: false, error: 'Ocorreu um erro ao aprovar o afiliado.' };
  }
}

/**
 * Altera o papel de um usuário diretamente (ex: promover a admin ou rebaixar a customer).
 */
export async function updateUserRoleAction(userId: string, newRole: 'customer' | 'seller' | 'affiliate' | 'admin') {
  await requireAdmin();

  try {
    await db
      .update(profiles)
      .set({
        role: newRole,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId));

    revalidatePath('/admin/usuarios');
    return { ok: true, message: `Papel do usuário atualizado para ${newRole}.` };
  } catch (error) {
    console.error('Erro ao atualizar papel do usuário:', error);
    return { ok: false, error: 'Não foi possível alterar o papel.' };
  }
}

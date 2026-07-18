'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dropCurations, profiles, drops } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/**
 * Registra ou atualiza um voto de curadoria comunitária de um colecionador para um drop.
 */
export async function submitDropCuration(data: {
  dropId: string;
  verdict: 'authentic' | 'fake' | 'suspicious';
  confidence: number;
  notes: string;
}) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para enviar uma curadoria.' };
    }

    if (!data.notes.trim() || data.notes.length < 10) {
      return { error: 'Por favor, escreva uma justificativa com pelo menos 10 caracteres.' };
    }

    // Verifica se já existe um voto deste usuário para este drop
    const [existing] = await db
      .select()
      .from(dropCurations)
      .where(and(eq(dropCurations.dropId, data.dropId), eq(dropCurations.userId, profile.id)))
      .limit(1);

    if (existing) {
      await db
        .update(dropCurations)
        .set({
          verdict: data.verdict,
          confidence: data.confidence,
          notes: data.notes,
          createdAt: new Date(),
        })
        .where(eq(dropCurations.id, existing.id));
    } else {
      // Cria novo voto de curadoria
      await db.insert(dropCurations).values({
        dropId: data.dropId,
        userId: profile.id,
        verdict: data.verdict,
        confidence: data.confidence,
        notes: data.notes,
      });

      // Bônus imediato de engajamento: +10 pontos pela participação
      await db
        .update(profiles)
        .set({
          geekPoints: (profile.geekPoints || 0) + 10,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, profile.id));
    }

    revalidatePath('/hype-zone/curadoria');
    return { success: true, message: 'Sua curadoria foi enviada! Você ganhou +10 Geek Points de bônus por sua contribuição.' };
  } catch (error) {
    console.error('Erro ao enviar curadoria comunitária:', error);
    return { error: 'Erro ao processar curadoria. Tente novamente.' };
  }
}

/**
 * Resgata Geek Points acumulados como cupons de desconto para a loja (100 pontos = R$ 1,00).
 */
export async function convertPointsToDiscount(pointsToConvert: number) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para resgatar seus pontos.' };
    }

    if (pointsToConvert < 100) {
      return { error: 'O resgate mínimo é de 100 Geek Points.' };
    }

    if (pointsToConvert % 100 !== 0) {
      return { error: 'O valor para resgate deve ser múltiplo de 100.' };
    }

    if ((profile.geekPoints || 0) < pointsToConvert) {
      return { error: 'Saldo de Geek Points insuficiente para este resgate.' };
    }

    // Calcula o valor em reais (100 pontos = R$ 1,00)
    const discountAmount = pointsToConvert / 100;
    const newGeekPoints = (profile.geekPoints || 0) - pointsToConvert;

    // Gera um código de cupom único
    const couponCode = `GEEKMILES-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Salva o cupom histórico nas preferências do usuário
    const currentCoupons = (profile.preferences as Record<string, any> || {}).coupons || [];
    const updatedPreferences = {
      ...(profile.preferences as Record<string, any> || {}),
      coupons: [
        ...currentCoupons,
        {
          code: couponCode,
          amount: discountAmount,
          pointsUsed: pointsToConvert,
          createdAt: new Date().toISOString(),
          status: 'active',
        }
      ]
    };

    // Deduz os pontos da conta
    await db
      .update(profiles)
      .set({
        geekPoints: newGeekPoints,
        preferences: updatedPreferences,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    revalidatePath('/hype-zone/curadoria');
    revalidatePath('/conta');
    return {
      success: true,
      couponCode,
      discountAmount,
      message: `Resgate realizado! Cupom de R$ ${discountAmount.toFixed(2)} gerado com sucesso.`
    };
  } catch (error) {
    console.error('Erro ao converter Geek Points em cupom:', error);
    return { error: 'Erro ao processar o resgate. Tente novamente.' };
  }
}

/**
 * Ação administrativa para fechar a curadoria e recompensar curadores assertivos (corretos).
 */
export async function resolveDropCuration(dropId: string, correctVerdict: 'authentic' | 'fake') {
  try {
    const profile = await getCurrentProfile();
    // Apenas admin/moderadores podem julgar os drops do conselho
    if (!profile || profile.role !== 'admin') {
      return { error: 'Apenas administradores podem julgar e encerrar a curadoria.' };
    }

    // Carrega todos os votos corretos daquele drop
    const correctVoters = await db
      .select({ id: dropCurations.id, userId: dropCurations.userId })
      .from(dropCurations)
      .where(and(eq(dropCurations.dropId, dropId), eq(dropCurations.verdict, correctVerdict)));

    // Atualiza o status do drop com base no julgamento do admin
    await db
      .update(drops)
      .set({
        status: correctVerdict === 'authentic' ? 'scheduled' : 'ended', // fake drops encerram imediatamente
        updatedAt: new Date(),
      })
      .where(eq(drops.id, dropId));

    // Recompensa cada curador assertivo com +50 pontos adicionais
    for (const voter of correctVoters) {
      // Marca a curadoria como assertiva e bonificada no banco
      await db
        .update(dropCurations)
        .set({
          isAssertive: true,
          pointsRewarded: 50,
        })
        .where(eq(dropCurations.id, voter.id));

      // Busca o perfil do usuário para somar os pontos
      const [voterProfile] = await db
        .select({ geekPoints: profiles.geekPoints })
        .from(profiles)
        .where(eq(profiles.id, voter.userId))
        .limit(1);

      if (voterProfile) {
        await db
          .update(profiles)
          .set({
            geekPoints: (voterProfile.geekPoints || 0) + 50,
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, voter.userId));
      }
    }

    revalidatePath('/hype-zone/curadoria');
    revalidatePath('/hype-zone');
    return {
      success: true,
      message: `Curadoria finalizada! ${correctVoters.length} curador(es) assertivo(s) receberam +50 Geek Points (Milhas Geek) cada.`
    };
  } catch (error) {
    console.error('Erro ao resolver curadoria do drop:', error);
    return { error: 'Ocorreu um erro no servidor ao tentar finalizar a curadoria.' };
  }
}

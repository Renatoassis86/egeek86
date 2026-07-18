'use server';

import { revalidatePath } from 'next/cache';
import { eq, and, gt, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auctions, auctionBids, profiles } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/**
 * Cria um leilão de colecionador pendente de aprovação (curadoria).
 */
export async function createCollectorAuction(data: {
  title: string;
  description: string;
  images: string[];
  startsAt: string;
  endsAt: string;
  minBidCents: number;
  reservePriceCents?: number;
  buyoutPriceCents?: number;
}) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para cadastrar um leilão.' };
    }

    if (!data.title.trim() || !data.description.trim()) {
      return { error: 'Título e descrição são campos obrigatórios.' };
    }

    if (data.images.filter(Boolean).length === 0) {
      return { error: 'Envie pelo menos 1 foto do item para leilão.' };
    }

    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { error: 'Datas e horários inválidos.' };
    }

    if (end.getTime() <= start.getTime()) {
      return { error: 'A data de término deve ser após a data de início.' };
    }

    if (data.minBidCents <= 0) {
      return { error: 'O lance mínimo inicial deve ser maior que R$ 0,00.' };
    }

    const [newAuction] = await db
      .insert(auctions)
      .values({
        title: data.title,
        description: data.description,
        images: data.images.filter(Boolean),
        sellerId: profile.id,
        startsAt: start,
        endsAt: end,
        minBidCents: data.minBidCents,
        currentBidCents: data.minBidCents, // começa no lance mínimo
        reservePriceCents: data.reservePriceCents || null,
        buyoutPriceCents: data.buyoutPriceCents || null,
        status: 'pending_curation', // aguarda conselho
      })
      .returning();

    revalidatePath('/hype-zone/leiloes');
    return {
      success: true,
      auctionId: newAuction.id,
      message: 'Leilão enviado com sucesso! Aguarde a curadoria de integridade da comunidade.',
    };
  } catch (error) {
    console.error('Erro ao cadastrar leilão:', error);
    return { error: 'Erro no servidor ao processar o cadastro do leilão.' };
  }
}

/**
 * Registra um lance oficial no leilão com verificação de regras de concorrência e prorrogação contra bots.
 */
export async function submitAuctionBid(data: {
  auctionId: string;
  amountCents: number;
}) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para dar um lance.' };
    }

    // Carrega leilão ativo
    const [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, data.auctionId))
      .limit(1);

    if (!auction) {
      return { error: 'Leilão não encontrado.' };
    }

    const now = new Date();
    if (auction.status !== 'active' && (now < auction.startsAt || now > auction.endsAt)) {
      return { error: 'Este leilão não está aberto para lances no momento.' };
    }

    // Lance mínimo e regras de incremento (Flat R$ 10.00 ou 5% do lance atual)
    const currentPrice = auction.currentBidCents || auction.minBidCents;
    const minIncrement = Math.max(1000, Math.round(currentPrice * 0.05)); // 5% do preço atual ou R$ 10,00
    const requiredBid = currentPrice === auction.minBidCents && !auction.currentBidCents 
      ? auction.minBidCents 
      : currentPrice + minIncrement;

    if (data.amountCents < requiredBid) {
      return { error: `Lance muito baixo. O lance mínimo aceitável agora é de R$ ${(requiredBid / 100).toFixed(2)}.` };
    }

    // SOFT CLOSE: Prorrogação dinâmica nos minutos finais (+2 minutos se der lance a menos de 2 minutos do fim)
    const timeRemainingMs = auction.endsAt.getTime() - now.getTime();
    let updatedEndsAt = auction.endsAt;
    const isOvertimeTriggered = timeRemainingMs > 0 && timeRemainingMs <= 2 * 60 * 1000;

    if (isOvertimeTriggered) {
      updatedEndsAt = new Date(now.getTime() + 2 * 60 * 1000); // prorroga por mais 2 minutos
      await db
        .update(auctions)
        .set({
          endsAt: updatedEndsAt,
          updatedAt: new Date(),
        })
        .where(eq(auctions.id, auction.id));
    }

    // Reseta todos os lances anteriores como "não vencedores"
    await db
      .update(auctionBids)
      .set({ isWinning: false })
      .where(eq(auctionBids.auctionId, auction.id));

    // Insere novo lance como vencedor
    await db.insert(auctionBids).values({
      auctionId: auction.id,
      userId: profile.id,
      amountCents: data.amountCents,
      isWinning: true,
    });

    // Atualiza o preço atual do leilão
    await db
      .update(auctions)
      .set({
        currentBidCents: data.amountCents,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auction.id));

    // Concede +10 XP pelo engajamento e participação ativa
    await db
      .update(profiles)
      .set({
        geekPoints: (profile.geekPoints || 0) + 10,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    revalidatePath(`/hype-zone/leiloes/${auction.id}`);
    revalidatePath('/hype-zone/leiloes');

    return {
      success: true,
      message: isOvertimeTriggered 
        ? `Lance aceito! O leilão foi estendido por mais 2 minutos contra bots. Novo fechamento: ${updatedEndsAt.toLocaleTimeString('pt-BR')}`
        : 'Lance registrado com sucesso! Você é o maior arrematante atual (+10 XP).',
    };
  } catch (error) {
    console.error('Erro ao processar lance:', error);
    return { error: 'Ocorreu um erro no servidor ao registrar seu lance.' };
  }
}

/**
 * Ação administrativa para aprovar curadoria e colocar o leilão na fila (Scheduled ou Active).
 */
export async function curateAuction(auctionId: string, verdict: 'approve' | 'reject') {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'admin') {
      return { error: 'Apenas administradores podem julgar a curadoria de leilões.' };
    }

    if (verdict === 'reject') {
      await db
        .update(auctions)
        .set({
          status: 'failed_reserve', // reprovado assume status de cancelamento/fracassado
          updatedAt: new Date(),
        })
        .where(eq(auctions.id, auctionId));
      
      revalidatePath('/hype-zone/leiloes');
      return { success: true, message: 'Leilão reprovado e arquivado.' };
    }

    // Se aprovado, define status como active ou scheduled conforme o horário
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) return { error: 'Leilão não encontrado.' };

    const now = new Date();
    const finalStatus = now >= auction.startsAt && now < auction.endsAt ? 'active' : 'scheduled';

    await db
      .update(auctions)
      .set({
        status: finalStatus,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auctionId));

    revalidatePath('/hype-zone/leiloes');
    return { success: true, message: `Leilão aprovado e agendado como ${finalStatus === 'active' ? 'Ativo' : 'Agendado'}!` };
  } catch (error) {
    console.error('Erro ao aprovar leilão:', error);
    return { error: 'Erro no servidor ao processar curadoria.' };
  }
}

/**
 * Encerra o leilão no cronômetro e processa o resultado (Reserva e Inadimplência).
 */
export async function resolveAuction(auctionId: string, isWinnerDefaulted: boolean = false) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'admin') {
      return { error: 'Apenas administradores podem gerenciar o desfecho dos leilões.' };
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) return { error: 'Leilão não encontrado.' };

    if (isWinnerDefaulted) {
      // Caso de inadimplência (desistência de pagamento do arrematante)
      // Carrega o lance vencedor
      const [winningBid] = await db
        .select()
        .from(auctionBids)
        .where(and(eq(auctionBids.auctionId, auctionId), eq(auctionBids.isWinning, true)))
        .limit(1);

      if (winningBid) {
        // Reduz o score do inadimplente (perda de 500 XP)
        const [defaultProfile] = await db
          .select({ geekPoints: profiles.geekPoints })
          .from(profiles)
          .where(eq(profiles.id, winningBid.userId))
          .limit(1);

        if (defaultProfile) {
          const currentPoints = defaultProfile.geekPoints || 0;
          await db
            .update(profiles)
            .set({
              geekPoints: Math.max(0, currentPoints - 500),
              updatedAt: new Date(),
            })
            .where(eq(profiles.id, winningBid.userId));
        }
      }

      await db
        .update(auctions)
        .set({
          status: 'defaulted',
          updatedAt: new Date(),
        })
        .where(eq(auctions.id, auctionId));

      revalidatePath('/hype-zone/leiloes');
      return { success: true, message: 'Inadimplência registrada. Comprador penalizado com -500 XP.' };
    }

    // Encerramento padrão: verifica reserva
    const hasMetReserve = !auction.reservePriceCents || (auction.currentBidCents >= auction.reservePriceCents);
    const finalStatus = hasMetReserve ? 'completed' : 'failed_reserve';

    await db
      .update(auctions)
      .set({
        status: finalStatus,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auctionId));

    revalidatePath('/hype-zone/leiloes');
    return {
      success: true,
      message: finalStatus === 'completed'
        ? 'Leilão encerrado com sucesso! Item arrematado.'
        : 'Leilão encerrado. Preço de reserva mínimo não foi atingido.',
    };
  } catch (error) {
    console.error('Erro ao resolver leilão:', error);
    return { error: 'Ocorreu um erro ao processar o desfecho do leilão.' };
  }
}

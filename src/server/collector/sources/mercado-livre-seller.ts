import 'server-only';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateSellers } from '@/db/schema';
import { getValidAccessToken } from './mercado-livre-auth';

const REPUTATION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface MeliUserReputation {
  nickname: string;
  seller_reputation: {
    level_id: string | null;
    power_seller_status: string | null;
    transactions: {
      total: number;
      ratings?: { positive: number; negative: number; neutral: number };
    };
  };
}

function computePositiveRatingPercent(ratings?: MeliUserReputation['seller_reputation']['transactions']['ratings']) {
  if (!ratings) return null;
  const total = ratings.positive + ratings.negative + ratings.neutral;
  if (total === 0) return null;
  return Number(((ratings.positive / total) * 100).toFixed(2));
}

/**
 * Vem de graça na mesma chamada de preço (/products/{id}/items já retorna
 * seller_id) — barato, atualiza sempre. Reputação em si (nickname, nível,
 * total de vendas) exige uma chamada extra (GET /users/{id}) — só dispara
 * pra vendedor novo ou com refreshedAt vencido, pra não dobrar as chamadas
 * de API em todo ciclo de coleta de preço (reputação não muda de hora em hora).
 */
export async function upsertSellerFromOffer(networkId: string, externalSellerId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(affiliateSellers)
    .where(and(eq(affiliateSellers.networkId, networkId), eq(affiliateSellers.externalSellerId, externalSellerId)))
    .limit(1);

  const isStale =
    !existing?.refreshedAt || Date.now() - existing.refreshedAt.getTime() > REPUTATION_REFRESH_INTERVAL_MS;

  if (existing && !isStale) {
    return existing.id;
  }

  let reputation: MeliUserReputation | null = null;
  try {
    const accessToken = await getValidAccessToken();
    const response = await fetch(`https://api.mercadolibre.com/users/${externalSellerId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      reputation = (await response.json()) as MeliUserReputation;
    }
  } catch {
    // Falha ao buscar reputação não deve derrubar a coleta de preço — segue
    // com o que já tem (ou cria um registro mínimo) e tenta de novo depois.
  }

  const values = {
    networkId,
    externalSellerId,
    nickname: reputation?.nickname ?? existing?.nickname ?? null,
    reputationLevel: reputation?.seller_reputation.level_id ?? existing?.reputationLevel ?? null,
    powerSellerStatus: reputation?.seller_reputation.power_seller_status ?? existing?.powerSellerStatus ?? null,
    totalSales: reputation?.seller_reputation.transactions.total ?? existing?.totalSales ?? null,
    positiveRatingPercent: reputation
      ? computePositiveRatingPercent(reputation.seller_reputation.transactions.ratings)?.toString()
      : (existing?.positiveRatingPercent ?? null),
    refreshedAt: reputation ? new Date() : (existing?.refreshedAt ?? null),
  };

  if (existing) {
    await db.update(affiliateSellers).set(values).where(eq(affiliateSellers.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(affiliateSellers).values(values).returning();
  return created.id;
}

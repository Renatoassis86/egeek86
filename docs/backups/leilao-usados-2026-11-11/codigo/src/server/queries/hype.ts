import 'server-only';
import { and, eq, inArray, lt, gt, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { drops, products, sellers, profiles, sellerMetrics, productMedia, dropWaitlist } from '@/db/schema';
import type { Drop } from '@/db/schema';

export interface CollectorInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  geekPoints: number;
  avgRating: number;
  totalReviews: number;
  badgeName: string;
}

export interface DropWithRelations extends Drop {
  collector: CollectorInfo | null;
  images: string[];
}

// Mapeia pontos para badges do colecionador
export function getBadgeName(points: number): string {
  if (points >= 5000) return 'Lendário';
  if (points >= 2000) return 'Mestre';
  if (points >= 800) return 'Veterano';
  if (points >= 200) return 'Explorador';
  return 'Iniciante';
}


async function mapDropsToRelations(dbDrops: any[]): Promise<DropWithRelations[]> {
  if (dbDrops.length === 0) return [];
  
  const results: DropWithRelations[] = [];
  
  for (const drop of dbDrops) {
    let collector: CollectorInfo | null = null;
    let images: string[] = [];

    // Se o drop tiver produto associado, buscamos as mídias e os dados do vendedor
    if (drop.productId) {
      try {
        const mediaList = await db
          .select({ url: productMedia.url })
          .from(productMedia)
          .where(eq(productMedia.productId, drop.productId))
          .orderBy(productMedia.position);
          
        images = mediaList.map((m) => m.url);
        
        // Dados do vendedor/colecionador
        const [prod] = await db
          .select({ sellerId: products.sellerId })
          .from(products)
          .where(eq(products.id, drop.productId))
          .limit(1);

        if (prod) {
          const [sell] = await db
            .select({
              id: sellers.id,
              displayName: sellers.displayName,
              userId: sellers.userId
            })
            .from(sellers)
            .where(eq(sellers.id, prod.sellerId))
            .limit(1);

          if (sell) {
            const [prof] = await db
              .select({
                name: profiles.name,
                avatarUrl: profiles.avatarUrl,
                geekPoints: profiles.geekPoints
              })
              .from(profiles)
              .where(eq(profiles.id, sell.userId))
              .limit(1);
              
            const [metrics] = await db
              .select({
                avgRating: sellerMetrics.avgRating,
                totalReviews: sellerMetrics.totalReviews
              })
              .from(sellerMetrics)
              .where(eq(sellerMetrics.sellerId, sell.id))
              .limit(1);

            collector = {
              id: sell.id,
              displayName: sell.displayName || prof?.name || 'Colecionador',
              avatarUrl: prof?.avatarUrl ?? null,
              geekPoints: prof?.geekPoints ?? 0,
              avgRating: metrics ? Number(metrics.avgRating) : 5.0,
              totalReviews: metrics ? metrics.totalReviews : 0,
              badgeName: getBadgeName(prof?.geekPoints ?? 0)
            };
          }
        }
      } catch (err) {
        console.error(`Erro ao montar relações para o drop ${drop.id}:`, err);
      }
    }

    // Fallback de imagem caso o produto não tenha mídias cadastradas
    if (images.length === 0 && drop.bannerUrl) {
      images = [drop.bannerUrl];
    }

    results.push({
      ...drop,
      collector,
      images
    });
  }

  return results;
}

/**
 * Retorna todos os drops ativos (Live) com relações do Colecionador.
 */
export async function getLiveDrops(): Promise<DropWithRelations[]> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(drops)
      .where(
        or(
          eq(drops.status, 'live'),
          and(
            eq(drops.status, 'scheduled'),
            lte(drops.startsAt, now),
            gt(drops.endsAt, now)
          )
        )
      )
      .orderBy(drops.startsAt);
      
    if (rows.length === 0) {
      return [];
    }
    
    return await mapDropsToRelations(rows);
  } catch (error) {
    console.error('Falha ao obter live drops do banco, retornando lista vazia:', error);
    return [];
  }
}

/**
 * Retorna os próximos drops (Scheduled) com relações do Colecionador.
 */
export async function getUpcomingDrops(): Promise<DropWithRelations[]> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(drops)
      .where(
        and(
          eq(drops.status, 'scheduled'),
          gt(drops.startsAt, now)
        )
      )
      .orderBy(drops.startsAt);

    if (rows.length === 0) {
      return [];
    }
    
    return await mapDropsToRelations(rows);
  } catch (error) {
    console.error('Falha ao obter upcoming drops do banco, retornando lista vazia:', error);
    return [];
  }
}

/**
 * Retorna os drops passados (Sold Out / Ended) com relações do Colecionador.
 */
export async function getPastDrops(): Promise<DropWithRelations[]> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(drops)
      .where(
        or(
          eq(drops.status, 'sold_out'),
          eq(drops.status, 'ended'),
          lt(drops.endsAt, now)
        )
      )
      .orderBy(drops.endsAt);

    if (rows.length === 0) {
      return [];
    }
    
    return await mapDropsToRelations(rows);
  } catch (error) {
    console.error('Falha ao obter past drops do banco, retornando lista vazia:', error);
    return [];
  }
}

/**
 * Retorna os IDs dos drops em que o usuário está na lista de espera.
 */
export async function getUserWaitlist(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ dropId: dropWaitlist.dropId })
      .from(dropWaitlist)
      .where(eq(dropWaitlist.userId, userId));
    return rows.map((r) => r.dropId);
  } catch (error) {
    console.error('Falha ao obter waitlist do usuário:', error);
    return [];
  }
}

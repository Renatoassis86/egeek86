import 'server-only';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateCartItems, affiliateOffers, affiliateNetworks, masterProducts, profiles, notificationPreferences } from '@/db/schema';

export interface CartListItem {
  cartItemId: string;
  offerId: string;
  offerSlug: string;
  title: string;
  masterProductId: string;
  masterProductName: string;
  imageUrl: string | null;
  networkId: string;
  networkName: string;
  currentPriceCents: number;
  affiliateLinkPending: boolean;
  addedAt: Date;
}

/** Só os IDs de oferta — pro estado inicial do botão "adicionar ao carrinho". */
export async function getCartOfferIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ offerId: affiliateCartItems.offerId })
    .from(affiliateCartItems)
    .where(and(eq(affiliateCartItems.userId, userId), isNull(affiliateCartItems.sentAt)));

  return new Set(rows.map((r) => r.offerId));
}

/** Contagem pro ícone do carrinho no header — só itens ainda não enviados. */
export async function getCartItemCount(userId: string): Promise<number> {
  const rows = await db
    .select({ offerId: affiliateCartItems.offerId })
    .from(affiliateCartItems)
    .where(and(eq(affiliateCartItems.userId, userId), isNull(affiliateCartItems.sentAt)));
  return rows.length;
}

/** Lista completa pra página /carrinho do comprador. */
export async function getCartItemsForUser(userId: string): Promise<CartListItem[]> {
  const rows = await db
    .select({
      cartItemId: affiliateCartItems.id,
      offerId: affiliateOffers.id,
      offerSlug: affiliateOffers.slug,
      title: affiliateOffers.title,
      masterProductId: masterProducts.id,
      masterProductName: masterProducts.name,
      imageUrl: affiliateOffers.imageUrl,
      networkId: affiliateNetworks.id,
      networkName: affiliateNetworks.name,
      currentPriceCents: affiliateOffers.currentPriceCents,
      affiliateLinkPending: affiliateOffers.affiliateLinkPending,
      addedAt: affiliateCartItems.addedAt,
    })
    .from(affiliateCartItems)
    .innerJoin(affiliateOffers, eq(affiliateCartItems.offerId, affiliateOffers.id))
    .innerJoin(masterProducts, eq(affiliateOffers.masterProductId, masterProducts.id))
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(and(eq(affiliateCartItems.userId, userId), isNull(affiliateCartItems.sentAt)))
    .orderBy(affiliateCartItems.addedAt);

  return rows;
}

export interface AdminCartGroup {
  userId: string;
  userName: string;
  userPhone: string | null;
  whatsappOptIn: boolean;
  items: CartListItem[];
}

/**
 * Fila do admin (/admin/carrinhos) — agrupada por comprador, só itens ainda
 * não enviados. Mesmo desenho de admin/usuarios/page.tsx: um select grande +
 * agrupamento em JS, sem tabela de fila dedicada.
 */
export async function getPendingCartsForAdmin(): Promise<AdminCartGroup[]> {
  const rows = await db
    .select({
      cartItemId: affiliateCartItems.id,
      userId: affiliateCartItems.userId,
      userName: profiles.name,
      userPhone: profiles.phone,
      whatsappOrders: notificationPreferences.whatsappOrders,
      offerId: affiliateOffers.id,
      offerSlug: affiliateOffers.slug,
      title: affiliateOffers.title,
      masterProductId: masterProducts.id,
      masterProductName: masterProducts.name,
      imageUrl: affiliateOffers.imageUrl,
      networkId: affiliateNetworks.id,
      networkName: affiliateNetworks.name,
      currentPriceCents: affiliateOffers.currentPriceCents,
      affiliateLinkPending: affiliateOffers.affiliateLinkPending,
      addedAt: affiliateCartItems.addedAt,
    })
    .from(affiliateCartItems)
    .innerJoin(profiles, eq(affiliateCartItems.userId, profiles.id))
    .innerJoin(affiliateOffers, eq(affiliateCartItems.offerId, affiliateOffers.id))
    .innerJoin(masterProducts, eq(affiliateOffers.masterProductId, masterProducts.id))
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, affiliateCartItems.userId))
    .where(isNull(affiliateCartItems.sentAt))
    .orderBy(affiliateCartItems.addedAt);

  if (rows.length === 0) return [];

  const groups = new Map<string, AdminCartGroup>();
  for (const row of rows) {
    let group = groups.get(row.userId);
    if (!group) {
      group = {
        userId: row.userId,
        userName: row.userName,
        userPhone: row.userPhone,
        // notification_preferences só existe depois que o usuário salva
        // alguma preferência — sem linha ainda = sem opt-in confirmado, nunca assume permissão.
        whatsappOptIn: row.whatsappOrders ?? false,
        items: [],
      };
      groups.set(row.userId, group);
    }
    group.items.push({
      cartItemId: row.cartItemId,
      offerId: row.offerId,
      offerSlug: row.offerSlug,
      title: row.title,
      masterProductId: row.masterProductId,
      masterProductName: row.masterProductName,
      imageUrl: row.imageUrl,
      networkId: row.networkId,
      networkName: row.networkName,
      currentPriceCents: row.currentPriceCents,
      affiliateLinkPending: row.affiliateLinkPending,
      addedAt: row.addedAt,
    });
  }

  return [...groups.values()];
}

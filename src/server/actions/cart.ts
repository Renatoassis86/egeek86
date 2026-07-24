'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateCartItems, affiliateOffers, profiles } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';
import { sendEmail } from '@/server/notifications/send-email';

export async function toggleCartItem(offerId: string, active: boolean): Promise<void> {
  const profile = await requireCustomer();

  if (active) {
    await db
      .insert(affiliateCartItems)
      .values({ userId: profile.id, offerId })
      .onConflictDoNothing({ target: [affiliateCartItems.userId, affiliateCartItems.offerId] });

    // Aviso pro admin — fire-and-forget: se RESEND_API_KEY não estiver
    // configurado, sendEmail() só retorna um erro em vez de lançar, nunca
    // trava a resposta pro comprador por causa de um e-mail que não saiu.
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      const [offer] = await db
        .select({ title: affiliateOffers.title })
        .from(affiliateOffers)
        .where(eq(affiliateOffers.id, offerId))
        .limit(1);

      sendEmail({
        to: adminEmail,
        subject: `Novo item no carrinho — ${profile.name}`,
        html: `<p><strong>${profile.name}</strong> (${profile.email}) adicionou <strong>${offer?.title ?? offerId}</strong> ao carrinho.</p><p>Veja em <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/carrinhos">/admin/carrinhos</a>.</p>`,
      }).catch(() => {});
    }
  } else {
    await db
      .delete(affiliateCartItems)
      .where(and(eq(affiliateCartItems.userId, profile.id), eq(affiliateCartItems.offerId, offerId)));
  }

  revalidatePath('/carrinho');
  revalidatePath('/admin/carrinhos');
}

export async function removeCartItem(cartItemId: string): Promise<void> {
  const profile = await requireCustomer();
  await db
    .delete(affiliateCartItems)
    .where(and(eq(affiliateCartItems.id, cartItemId), eq(affiliateCartItems.userId, profile.id)));
  revalidatePath('/carrinho');
}

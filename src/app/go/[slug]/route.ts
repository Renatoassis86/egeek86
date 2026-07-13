import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, analyticsEvents } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Cloaking link: nunca expõe affiliate_url ao usuário, registra o clique
 * como analytics_event (reaproveitado — sem tabela de clique dedicada) e
 * redireciona pro link real do afiliado.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [offer] = await db
    .select()
    .from(affiliateOffers)
    .where(and(eq(affiliateOffers.slug, slug), eq(affiliateOffers.status, 'active')))
    .limit(1);

  if (!offer) {
    return NextResponse.redirect(new URL('/ofertas', request.url), 302);
  }

  await db.insert(analyticsEvents).values({
    eventName: 'affiliate_click',
    properties: {
      offerId: offer.id,
      networkId: offer.networkId,
      slug,
      priceCentsAtClick: offer.currentPriceCents,
    },
    context: {
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
    },
  });

  return NextResponse.redirect(offer.affiliateUrl, 302);
}

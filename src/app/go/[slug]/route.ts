import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, analyticsEvents } from '@/db/schema';

export const dynamic = 'force-dynamic';

/** Só http(s) absoluto sai do site; qualquer outra coisa (javascript:, data:, relativa) é descartada. */
function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Redirecionamento de saída ("Ir à loja"). O destino vem SEMPRE do banco
 * (`affiliate_url` da oferta pelo slug), nunca de parâmetro da requisição,
 * então não existe redirecionamento aberto. Quando o link de afiliado ainda
 * está pendente, `affiliate_url` guarda a página pública da loja: o visitante
 * vai para ela do mesmo jeito e o clique é registrado normalmente (a flag
 * `linkPending` fica só no evento interno).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [offer] = await db
    .select()
    .from(affiliateOffers)
    .where(and(eq(affiliateOffers.slug, slug), eq(affiliateOffers.status, 'active')))
    .limit(1);

  if (!offer) {
    return NextResponse.redirect(new URL('/oferta-encerrada', request.url), 302);
  }

  let destinationUrl = safeExternalUrl(offer.affiliateUrl);
  if (!destinationUrl) {
    // URL ausente ou inválida: nunca redireciona para fora, volta à página da oferta.
    return NextResponse.redirect(new URL(`/ofertas/${slug}`, request.url), 302);
  }

  try {
    await db.insert(analyticsEvents).values({
      eventName: 'affiliate_click',
      properties: {
        offerId: offer.id,
        networkId: offer.networkId,
        slug,
        priceCentsAtClick: offer.currentPriceCents,
        linkPending: offer.affiliateLinkPending,
      },
      context: {
        referer: request.headers.get('referer'),
        userAgent: request.headers.get('user-agent'),
      },
    });
  } catch (err) {
    // Falha de métrica nunca pode impedir o visitante de chegar à loja.
    console.error('[go] falha ao registrar clique', err);
  }

  if (destinationUrl.includes('mercadolivre.com.br/MLB') && !destinationUrl.includes('mercadolivre.com.br/MLB-')) {
    destinationUrl = destinationUrl.replace(/mercadolivre\.com\.br\/(MLB)(\d+)/i, 'mercadolivre.com.br/$1-$2');
  }

  return NextResponse.redirect(destinationUrl, 302);
}

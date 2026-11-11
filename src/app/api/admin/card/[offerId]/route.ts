import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { loadOfferCardInput, renderOfferCard } from '@/server/messaging/offer-card';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Card de oferta (PNG 1080x1080) para o dono visualizar/baixar. Somente admin, somente leitura.
 * 404 quando a oferta não existe, não está ativa/elegível ou o preço não foi confirmado recentemente (nunca desenha dado velho).
 * `?alt=1` devolve o texto alternativo em JSON em vez da imagem.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ offerId: string }> }) {
  const noStore = { 'Cache-Control': 'no-store' };
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401, headers: noStore });
  }
  const { offerId } = await params;
  const input = await loadOfferCardInput(offerId);
  const card = input ? await renderOfferCard(input) : null;
  if (!card) {
    return NextResponse.json({ error: 'oferta indisponível para o card (inativa, inelegível ou preço sem confirmação recente)' }, { status: 404, headers: noStore });
  }
  if (request.nextUrl.searchParams.get('alt') === '1') {
    return NextResponse.json({ alt: card.alt }, { headers: noStore });
  }
  return new NextResponse(new Uint8Array(card.png), {
    headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="card-${offerId}.png"`, ...noStore },
  });
}

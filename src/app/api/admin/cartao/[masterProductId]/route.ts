import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { renderHistoryCard } from '@/server/messaging/price-card';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cartão de histórico de preço (PNG 1200x675) para o dono baixar e colar no WhatsApp. Somente admin, somente leitura.
 * 404 quando não há dado suficiente (menos de 3 dias medidos ou sem preço atual fresco): nunca desenha curva inventada.
 * `?legenda=1` devolve a legenda (HTML do Telegram) em JSON em vez da imagem.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ masterProductId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const { masterProductId } = await params;
  const card = await renderHistoryCard(masterProductId);
  if (!card) {
    return NextResponse.json({ error: 'sem dados suficientes para o cartão (mínimo de 3 dias medidos e preço atual fresco)' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (request.nextUrl.searchParams.get('legenda') === '1') {
    return NextResponse.json({ caption: card.caption, alt: card.alt }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return new NextResponse(new Uint8Array(card.png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="historico-${masterProductId}.png"`,
      'Cache-Control': 'no-store',
    },
  });
}

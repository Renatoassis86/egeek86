import { NextResponse, after, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, analyticsEvents } from '@/db/schema';
import { GAMES } from '@/lib/catalog/verticais';
import { departamentoLiberadoParaGo } from '@/server/departamentos';
import { parseOrigemClique } from '@/lib/analytics/origem-clique';

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
 * então não existe redirecionamento aberto.
 *
 * Departamentos (ata 2026-11-10, emenda E.1 item 6): aceita games OU departamento liberado pela chave do banco
 * (`departamentoLiberadoParaGo`); fechado => /oferta-encerrada.
 *
 * Link pendente (`affiliate_link_pending`) NÃO redireciona em nenhuma vertical: `affiliate_url` guarda a página
 * pública da loja, sem rastreio, e não geraria comissão. O visitante vai a /link-em-ativacao (aviso neutro) e o
 * evento `affiliate_click_blocked` é gravado para contar a demanda.
 *
 * O evento é gravado DEPOIS da resposta (`after()`), então nunca atrasa nem impede o redirecionamento.
 * Origem da mensagem de grupo: `s` (tg|wa|site) e `m` (id) entram no evento só se casarem a lista permitida;
 * nunca vão para o destino.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [offer] = await db
    .select()
    .from(affiliateOffers)
    .where(and(eq(affiliateOffers.slug, slug), eq(affiliateOffers.status, 'active'), isNull(affiliateOffers.quarantinedAt)))
    .limit(1);

  if (!offer) {
    return NextResponse.redirect(new URL('/oferta-encerrada', request.url), 302);
  }

  // Allow-list de departamento: games sempre; demais só com a chave aberta (e, se for janela do dono, só admin).
  if (offer.vertical !== GAMES) {
    let liberado = false;
    try {
      liberado = await departamentoLiberadoParaGo(offer.vertical);
    } catch (err) {
      console.error('[go] falha ao ler chave de departamento; tratando como fechado', err);
    }
    if (!liberado) return NextResponse.redirect(new URL('/oferta-encerrada', request.url), 302);
  }

  const origem = parseOrigemClique(request.nextUrl.searchParams.get('s'), request.nextUrl.searchParams.get('m'));
  const context = {
    referer: request.headers.get('referer'),
    userAgent: request.headers.get('user-agent'),
  };
  const gravar = (eventName: string, extra: Record<string, unknown>) =>
    after(async () => {
      try {
        await db.insert(analyticsEvents).values({
          eventName,
          properties: {
            offerId: offer.id,
            networkId: offer.networkId,
            slug,
            vertical: offer.vertical,
            priceCentsAtClick: offer.currentPriceCents,
            linkPending: offer.affiliateLinkPending,
            ...extra,
            ...origem,
          },
          context,
        });
      } catch (err) {
        // Falha de métrica nunca pode impedir o visitante de chegar à loja.
        console.error('[go] falha ao registrar clique', err);
      }
    });

  if (offer.affiliateLinkPending) {
    gravar('affiliate_click_blocked', { motivo: 'link_pendente' });
    return NextResponse.redirect(new URL('/link-em-ativacao', request.url), 302);
  }

  let destinationUrl = safeExternalUrl(offer.affiliateUrl);
  if (!destinationUrl) {
    // URL ausente ou inválida: nunca redireciona para fora, volta à página da oferta.
    return NextResponse.redirect(new URL(`/ofertas/${slug}`, request.url), 302);
  }

  gravar('affiliate_click', {});

  if (destinationUrl.includes('mercadolivre.com.br/MLB') && !destinationUrl.includes('mercadolivre.com.br/MLB-')) {
    destinationUrl = destinationUrl.replace(/mercadolivre\.com\.br\/(MLB)(\d+)/i, 'mercadolivre.com.br/$1-$2');
  }

  return NextResponse.redirect(destinationUrl, 302);
}

import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks } from '@/db/schema';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { recordPriceSnapshot } from '@/server/collector/record-price-snapshot';

/**
 * Receptor de notificações (webhook) do Mercado Livre — substitui polling
 * por evento: quando o preço/status de um item muda, o Mercado Livre avisa
 * em segundos em vez de esperarmos o próximo ciclo do cron (5-30min).
 *
 * Achado real (2026-08-02): o app já tinha os tópicos "Prices"/"Items"
 * habilitados no painel, mas a URL de notificação apontava pra
 * `https://egeek86.com` (a home do site) — o Mercado Livre tentava
 * entregar e caía no lugar errado, nada processava. Essa rota é o
 * endpoint de verdade; precisa trocar a URL no painel do app pra
 * `https://egeek86.com/api/webhooks/mercadolivre`.
 *
 * Exigência documentada da própria Mercado Livre: responder HTTP 200 em
 * até 500ms, senão o tópico é desativado automaticamente. Por isso todo
 * processamento real acontece depois da resposta, via `after()` (Next.js
 * 16) — a resposta sai imediata, o trabalho continua em segundo plano
 * dentro do maxDuration da rota.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface MeliNotification {
  resource: string;
  user_id: number;
  topic: string;
  application_id: number;
  attempts: number;
  sent: string;
  received: string;
}

/** Tópicos que sabemos processar — qualquer outro (Orders, Messages, etc.) é ignorado sem erro. */
const HANDLED_TOPICS = new Set(['items', 'items_prices', 'catalog_item_competition_status']);

function extractItemId(resource: string): string | null {
  const match = resource.match(/\/items\/(MLB\d+)/i);
  return match ? match[1] : null;
}

async function processNotification(notification: MeliNotification) {
  const itemId = extractItemId(notification.resource);
  if (!itemId) {
    console.error(`[webhook-meli] resource sem item_id reconhecível: ${notification.resource}`);
    return;
  }

  try {
    const accessToken = await getValidAccessToken();
    const res = await fetch(
      `https://api.mercadolibre.com/items/${itemId}?attributes=id,price,status,seller_id`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      console.error(`[webhook-meli] falha ao buscar item ${itemId}: HTTP ${res.status}`);
      return;
    }

    const item = (await res.json()) as { price?: number; status?: string };
    // Item pausado/finalizado/sem preço numérico — não inventa dado, só não atualiza.
    if (item.status !== 'active' || typeof item.price !== 'number') return;

    const [offer] = await db
      .select({ id: affiliateOffers.id })
      .from(affiliateOffers)
      .innerJoin(affiliateNetworks, eq(affiliateNetworks.id, affiliateOffers.networkId))
      .where(and(eq(affiliateOffers.externalRef, itemId), eq(affiliateNetworks.slug, 'mercado-livre')))
      .limit(1);

    // Notificação de um item que não rastreamos (ainda não descoberto, ou
    // de outro vendedor concorrente que o catálogo não capturou) — sem
    // oferta correspondente, não há o que atualizar.
    if (!offer) return;

    const priceCents = Math.round(item.price * 100);
    await recordPriceSnapshot({ offerId: offer.id, priceCents, source: 'api' });
    await db
      .update(affiliateOffers)
      .set({ lastCheckedAt: new Date(), consecutiveMissCount: 0 })
      .where(eq(affiliateOffers.id, offer.id));
  } catch (err) {
    console.error(`[webhook-meli] erro processando ${notification.resource}:`, err);
  }
}

export async function POST(request: NextRequest) {
  let notification: MeliNotification;
  try {
    notification = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  if (notification?.resource && notification?.topic && HANDLED_TOPICS.has(notification.topic)) {
    after(() => processNotification(notification));
  }

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

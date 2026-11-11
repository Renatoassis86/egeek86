import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getAdTag } from '@/lib/messaging/group-config';
import { formatOfferMessage, makeMessageKey } from '@/lib/messaging/group-messages';
import { sendTelegramGroupMessage } from '@/lib/messaging/telegram-send';
import { loadOfferCardInput, renderOfferCard } from '@/server/messaging/offer-card';
import { chatForStore, getStoreByVertical } from '@/server/stores';
import { renderStoreProfileCard } from '@/server/messaging/store-profile-card';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ENVIO DE TESTE por loja (fase de teste, dono 2026-11-11): manda ao canal da loja as ofertas mais baratas dos produtos aprovados,
 * com card e botão, para ver o resultado no grupo. Só com a chave TESTE_LOJA_KEY (sem chave = 503). ?vertical=impressao3d&n=3&dry=1
 * (dry=1 devolve só o texto). Não grava em group_messages e não passa pelos limites da automação.
 */
function authorized(request: NextRequest): 'ok' | 'desligado' | 'negado' {
  const expected = process.env.TESTE_LOJA_KEY;
  if (!expected || expected.length < 24) return 'desligado';
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'negado';
}

export async function GET(request: NextRequest) {
  const auth = authorized(request);
  if (auth === 'desligado') return NextResponse.json({ error: 'desligado' }, { status: 503 });
  if (auth === 'negado') return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  const q = new URL(request.url).searchParams;
  // ?perfil=<slug>: devolve o PNG de perfil da loja (canal do Telegram / grupo do WhatsApp).
  const perfil = q.get('perfil');
  if (perfil) {
    const png = await renderStoreProfileCard(perfil.replace(/[^a-z0-9-]/g, ''));
    if (!png) return NextResponse.json({ error: 'loja_desconhecida' }, { status: 404 });
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  }
  const vertical = (q.get('vertical') ?? 'impressao3d').replace(/[^a-z0-9]/g, '');
  const n = Math.min(Math.max(1, Number(q.get('n') ?? 3) || 3), 5);
  const dry = q.get('dry') === '1';

  const store = await getStoreByVertical(vertical);
  const chat = store ? chatForStore(store) : undefined;
  if (!dry && !chat) return NextResponse.json({ error: 'loja_sem_canal_verificado' }, { status: 409 });

  const rows = await db.execute<{ id: string; slug: string; url: string; master: string }>(sql`
    SELECT DISTINCT ON (o.master_product_id) o.id::text AS id, o.slug, o.affiliate_url AS url, o.master_product_id::text AS master
    FROM affiliate_offers o
    JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
    JOIN master_products m ON m.id = o.master_product_id
    WHERE m.vertical = ${vertical} AND o.vertical = m.vertical AND (m.attributes->'catalogGate'->>'verdict') = 'approved'
      AND o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND COALESCE(o.affiliate_url, '') <> ''
    ORDER BY o.master_product_id, o.current_price_cents ASC
    LIMIT 20`);

  const now = new Date();
  const out: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    if (out.length >= n) break;
    const card = await loadOfferCardInput(r.id).catch(() => null);
    if (!card || card.stats.avgCents == null) {
      out.push({ offer: r.id, pulado: 'sem_card_ou_media' });
      continue;
    }
    const messageKey = makeMessageKey('G2', `teste:${r.id}:${now.toISOString().slice(0, 13)}`, now);
    const text = formatOfferMessage(
      {
        model: 'media',
        vertical,
        messageKey,
        adTag: getAdTag(),
        name: card.title,
        title: card.title,
        meta: null,
        offer: { slug: r.slug, networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: card.priceCents, confirmedAt: card.checkedAt },
        avg: { cents: card.stats.avgCents, offers: card.stats.distinctOffers },
        seriesDays: card.stats.measuredDays,
        refCents: card.stats.recordCents,
        sinceDay: card.stats.seriesFirstDay,
      },
      'tg'
    );
    if (dry) {
      out.push({ offer: r.id, text });
      continue;
    }
    const png = (await renderOfferCard(card).catch(() => null))?.png ?? null;
    const sent = await sendTelegramGroupMessage({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: chat,
      text,
      photo: png,
      button: /^https:\/\//.test(r.url) ? { text: 'Ver oferta e comprar', url: r.url } : null,
    });
    out.push({ offer: r.id, ok: sent.ok, card: sent.photoSent === true, erro: sent.ok ? undefined : sent.error });
  }
  return NextResponse.json({ vertical, canal: store?.telegramChatTitle ?? null, enviados: out });
}

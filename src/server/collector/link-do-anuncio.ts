import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * #119: o link da oferta tem de levar ao MESMO anúncio cujo preço foi gravado. Depois de gravar o preço do anúncio `itemId`, se o anúncio do link
 * é conhecido (link_item_id, ou id na URL direta) e diferente, aponta o link para o anúncio certo: URL direta com matt_tool (ou sem rastreio e
 * pendente, se não houver MELI_TOOL_ID); o gerador de links (loop ml-links) regenera o meli.la depois. meli.la sem registro do anúncio
 * (link_item_id nulo) não é tocado aqui: o porteiro de mensagem (live-recheck) o trata. Mesma lógica de `planejarLinkDoAnuncio`. Nunca lança.
 */
export async function alinharLinkAoAnuncio(offerId: string, itemId: string | null | undefined): Promise<boolean> {
  if (!itemId || !/^MLB\d{6,}$/.test(itemId)) return false;
  try {
    const toolId = process.env.MELI_TOOL_ID;
    const base = `https://produto.mercadolivre.com.br/MLB-${itemId.slice(3)}`;
    const url = toolId ? `${base}?matt_tool=${toolId}` : base;
    const r = (await db.execute(sql`
      UPDATE affiliate_offers SET affiliate_url = ${url}, link_item_id = ${itemId}, affiliate_link_pending = ${!toolId}, updated_at = now()
      WHERE id = ${offerId}::uuid
        AND (last_price_confirmed_at IS NULL OR last_price_confirmed_at < now() - interval '180 minutes')
        AND COALESCE(link_item_id, CASE WHEN affiliate_url ~* 'meli[.]la|/p/MLB' THEN NULL ELSE 'MLB' || substring(affiliate_url from '/MLB-?([0-9]{6,})') END) IS NOT NULL
        AND COALESCE(link_item_id, CASE WHEN affiliate_url ~* 'meli[.]la|/p/MLB' THEN NULL ELSE 'MLB' || substring(affiliate_url from '/MLB-?([0-9]{6,})') END) <> ${itemId}
      RETURNING id`)) as unknown as unknown[];
    return r.length > 0;
  } catch (e) {
    console.error('[link-do-anuncio] falhou (ignorado):', e instanceof Error ? e.message : e);
    return false;
  }
}

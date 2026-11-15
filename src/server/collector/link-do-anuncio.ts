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
      UPDATE affiliate_offers SET affiliate_url = ${url}, link_item_id = ${itemId}, affiliate_link_pending = ${!toolId}, link_verificado_em = NULL, updated_at = now()
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

/**
 * O anúncio do link ainda está vivo? Lê a lista do catálogo da oferta pela API oficial (até 3 páginas, sem captcha). true = está na lista; false = lista
 * completa e ele não está (provável pausado/encerrado); null = não deu para saber (erro, 429, lista incompleta). Usado ANTES de um anúncio irmão assumir
 * a oferta (rodada 3, achado 25). Nunca lança.
 */
export async function anuncioDoLinkVivo(catalogoRef: string | null, itemId: string | null): Promise<boolean | null> {
  if (!catalogoRef || !itemId || !/^MLB\d+$/.test(catalogoRef)) return null;
  try {
    const { getValidAccessToken } = await import('@/server/collector/sources/mercado-livre-auth');
    const token = await getValidAccessToken();
    const alvo = itemId.replace(/\D/g, '');
    for (let off = 0; off < 300; off += 100) {
      const res = await fetch(`https://api.mercadolibre.com/products/${catalogoRef}/items?limit=100&offset=${off}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404 && off === 0) return false;
      if (res.status !== 200) return null;
      const d = (await res.json()) as { results?: { item_id: string }[]; paging?: { total?: number } };
      if ((d.results ?? []).some((x) => x.item_id.replace(/\D/g, '') === alvo)) return true;
      if (off + 100 >= (d.paging?.total ?? 0)) return false;
    }
    return null; // catálogo grande demais para decidir com 3 páginas
  } catch {
    return null;
  }
}

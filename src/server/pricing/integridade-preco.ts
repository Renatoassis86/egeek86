import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { recordPriceSnapshot } from '@/server/collector/record-price-snapshot';
import { alinharLinkAoAnuncio } from '@/server/collector/link-do-anuncio';
import { escolherAnuncio, type AnuncioCatalogo } from '@/lib/pricing/integridade-preco';

/**
 * INVARIANTE 1 (#119): toda oferta ML ativa tem anúncio concreto (`external_item_id` = MLB do anúncio, nunca o id do catálogo). Preenche pela API
 * oficial do catálogo (`/products/{id}/items`), um catálogo por vez, em lote pequeno, parando no 429. Ordem: ofertas que foram para mensagem nas
 * últimas 24 h, depois impressoras 3D, depois o resto. O anúncio escolhido é o do link (`link_item_id`) se estiver na lista; senão o mais barato
 * do vendedor naquele catálogo. Preço e anúncio entram pelo caminho único (recordPriceSnapshot com itemId): troca de anúncio zera previous_price.
 * Vendedor ausente da lista do catálogo da oferta NÃO expira aqui (o anúncio pode estar em catálogo irmão): fica sem anúncio e fora da regra rígida.
 */
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ResultadoPreenchimento { catalogos: number; ofertas: number; preenchidas: number; ausentes: number; parou: string | null }

export async function preencherAnuncios(opts: { orcamentoMs: number; maxCatalogos?: number; gravar?: boolean }): Promise<ResultadoPreenchimento> {
  const out: ResultadoPreenchimento = { catalogos: 0, ofertas: 0, preenchidas: 0, ausentes: 0, parou: null };
  const fim = Date.now() + opts.orcamentoMs;
  const catalogos = (await db.execute(sql`
    SELECT o.external_ref AS ref,
           min(CASE WHEN o.id IN (SELECT offer_id FROM group_messages WHERE created_at > now() - interval '24 hours' AND offer_id IS NOT NULL) THEN 0
                    WHEN o.vertical = 'impressao3d' THEN 1 ELSE 2 END) AS prio
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
    WHERE o.status = 'active' AND o.external_item_id IS NULL AND o.seller_id IS NOT NULL AND o.external_ref ~ '^MLB[0-9]+$' AND o.current_price_cents > 0
      AND o.external_ref NOT IN (SELECT meta->>'ref' FROM collector_runs WHERE job = 'preencher-anuncios' AND started_at > now() - interval '6 hours' AND meta->>'ref' IS NOT NULL)
    GROUP BY 1 ORDER BY 2, count(*) DESC LIMIT ${opts.maxCatalogos ?? 5}`)) as unknown as { ref: string }[];
  const token = await getValidAccessToken();
  for (const { ref } of catalogos) {
    if (Date.now() > fim - 4000) break;
    const porVendedor = new Map<string, AnuncioCatalogo[]>();
    let completo = true;
    for (let off = 0; off < 1000; off += 100) {
      await dormir(350);
      const res = await fetch(`https://api.mercadolibre.com/products/${ref}/items?limit=100&offset=${off}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) { out.parou = 'http_429'; completo = false; break; }
      if (res.status === 404 && off === 0) break;
      if (res.status !== 200) { completo = false; break; }
      const d = (await res.json()) as { results?: (AnuncioCatalogo & { seller_id: number })[]; paging?: { total?: number } };
      for (const it of d.results ?? []) if (it.condition === 'new') porVendedor.set(String(it.seller_id), [...(porVendedor.get(String(it.seller_id)) ?? []), it]);
      if (off + 100 >= (d.paging?.total ?? 0)) break;
    }
    out.catalogos++;
    if (out.parou) break;
    if (opts.gravar !== false) await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('preencher-anuncios', 'mercado-livre', now(), now(), 0, 'ok', ${JSON.stringify({ ref, vendedores: porVendedor.size, completo })}::jsonb)`);
    const ofertas = (await db.execute(sql`
      SELECT o.id::text AS id, s.external_seller_id AS seller, o.link_item_id AS link, o.current_price_cents::int AS cents
      FROM affiliate_offers o JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE o.status = 'active' AND o.external_item_id IS NULL AND o.external_ref = ${ref} AND o.current_price_cents > 0`)) as unknown as { id: string; seller: string; link: string | null; cents: number }[];
    for (const o of ofertas) {
      out.ofertas++;
      const a = escolherAnuncio(porVendedor.get(o.seller) ?? [], o.link);
      if (!a) { if (completo) out.ausentes++; continue; }
      if (opts.gravar === false) { out.preenchidas++; continue; }
      await recordPriceSnapshot({ offerId: o.id, priceCents: Math.round(a.price * 100), listPriceCents: a.original_price != null ? Math.round(a.original_price * 100) : null, source: 'api', itemId: a.item_id });
      await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now(), last_checked_at = now(), consecutive_miss_count = 0 WHERE id = ${o.id}::uuid`);
      await alinharLinkAoAnuncio(o.id, a.item_id);
      out.preenchidas++;
    }
  }
  return out;
}

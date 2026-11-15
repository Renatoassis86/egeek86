import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { verticalSql } from '@/lib/catalog/verticais';
import { ehItemMiudoOuDuvida } from '@/lib/catalog/item-miudo';
import { montarGuia3d, type ItemGuia3d, type LinhaGuia3d, type RedeGuia } from '@/lib/catalog/guia-3d';
import { departamentoClicaveisCtes } from '@/server/queries/departamento';
import { getMasterProductPriceStatsBatch, type MasterProductPriceStats } from '@/server/queries/product-price-stats';

/**
 * GUIA DAS IMPRESSORAS 3D PRIORITARIAS (#111). Mesma regra de elegibilidade do departamento: `departamentoClicaveisCtes` (publicOffersCtes,
 * porteiro aprovado, sem quarentena, link nao pendente, frescor ML/Shopee 24 h e Amazon 24 h, URL http). So le; nunca grava.
 * O menor preco registrado vem da fonte unica de estatistica (product-price-stats); sem selo, sem media propria.
 */
export interface ItemGuiaComRegistro extends ItemGuia3d {
  registradoCents: number | null;
  registradoEm: string | null;
}

interface RowGuia extends Record<string, unknown> {
  master_id: string; master_slug: string; name: string; imagem: string | null; rede: string;
  price: string | number; checked: Date | string; offer_slug: string;
}

async function calcularGuia(): Promise<ItemGuiaComRegistro[]> {
  const rows = await db.execute<RowGuia>(sql`
    WITH ${departamentoClicaveisCtes('impressao3d', { vitrine: true })}
    SELECT DISTINCT ON (sb.master_product_id, sb.network_slug)
           m.id::text AS master_id, m.slug AS master_slug, m.name, m.default_images ->> 0 AS imagem,
           sb.network_slug AS rede, sb.current_price_cents AS price, sb.last_checked_at AS checked, sb.offer_slug
    FROM seller_best sb
    INNER JOIN master_products m ON m.id = sb.master_product_id
    WHERE ${verticalSql('m', 'impressao3d')} AND m.name ~* '(bambu|kobra|anycubic)'
    ORDER BY sb.master_product_id, sb.network_slug, sb.current_price_cents ASC, sb.last_checked_at DESC
  `);
  const linhas: LinhaGuia3d[] = rows
    .filter((r) => (r.rede === 'mercado-livre' || r.rede === 'amazon' || r.rede === 'shopee') && !ehItemMiudoOuDuvida(r.name, Number(r.price), 'general', 'impressao3d'))
    .map((r) => ({
      masterId: r.master_id, masterSlug: r.master_slug, nome: r.name,
      imagem: r.imagem && /^https?:\/\//i.test(r.imagem) ? r.imagem : null,
      rede: r.rede as RedeGuia, precoCents: Number(r.price), verificadoEm: new Date(r.checked).toISOString(), ofertaSlug: r.offer_slug,
    }));
  const guia = montarGuia3d(linhas);
  const ids = guia.map((g) => g.masterId).filter((x): x is string => !!x);
  let stats = new Map<string, MasterProductPriceStats>();
  try {
    stats = await getMasterProductPriceStatsBatch(ids, { coldTimeoutMs: 4000, partialOnTimeout: true });
  } catch (e) {
    console.error('Guia 3D: estatistica de preco indisponivel (segue sem menor registrado):', e);
  }
  return guia.map((g) => {
    const low = g.masterId ? stats.get(g.masterId)?.lowAll ?? null : null;
    return { ...g, registradoCents: low?.priceCents ?? null, registradoEm: low?.at ?? null };
  });
}

/** Cache de 5 min (mesma regra da lista do departamento). */
const guiaCache = createCachedQuery(calcularGuia, ['guia-3d-v1'], { revalidate: 300, maxStaleSeconds: 3600, coldTimeoutSeconds: 30, live: true });
export async function guiaImpressoras3d(): Promise<ItemGuiaComRegistro[]> {
  return guiaCache();
}
/** Sem cache (testes e verificacao ponta a ponta contra o SELECT). */
export const guiaImpressoras3dAoVivo = calcularGuia;

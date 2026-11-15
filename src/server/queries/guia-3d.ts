import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { verticalSql } from '@/lib/catalog/verticais';
import { ehItemMiudoOuDuvida } from '@/lib/catalog/item-miudo';
import { avisosDeOfertas } from '@/server/queries/avisos-impressoras-3d';
import { ROTULO_REDE_GUIA, montarGuia3d, linhasAviso, type AvisoOfertaGuia, type ItemGuia3d, type LinhaGuia3d, type RedeGuia } from '@/lib/catalog/guia-3d';
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
  price: string | number; checked: Date | string; offer_slug: string; offer_id: string;
}

export interface DadosGuia3d {
  itens: ItemGuiaComRegistro[];
  /** masterId -> linhas de cupom/cartao da loja de menor preco (cartoes do departamento). */
  porMaster: Record<string, string[]>;
}

async function calcularGuia(): Promise<DadosGuia3d> {
  const rows = await db.execute<RowGuia>(sql`
    WITH ${departamentoClicaveisCtes('impressao3d', { vitrine: true })}
    SELECT DISTINCT ON (sb.master_product_id, sb.network_slug)
           m.id::text AS master_id, m.slug AS master_slug, m.name, m.default_images ->> 0 AS imagem,
           sb.network_slug AS rede, sb.current_price_cents AS price, sb.last_checked_at AS checked, sb.offer_slug, sb.id::text AS offer_id
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
      rede: r.rede as RedeGuia, precoCents: Number(r.price), verificadoEm: new Date(r.checked).toISOString(), ofertaSlug: r.offer_slug, offerId: r.offer_id,
    }));
  const guia = montarGuia3d(linhas);
  const ids = guia.map((g) => g.masterId).filter((x): x is string => !!x);
  let stats = new Map<string, MasterProductPriceStats>();
  try {
    stats = await getMasterProductPriceStatsBatch(ids, { coldTimeoutMs: 4000, partialOnTimeout: true });
  } catch (e) {
    console.error('Guia 3D: estatistica de preco indisponivel (segue sem menor registrado):', e);
  }
  // #112: cupom e desconto de cartao lidos na pagina (so oferta que aparece na guia ou e a mais barata de cada rede de um master prioritario).
  let avisos = new Map<string, AvisoOfertaGuia>();
  try {
    avisos = await avisosDeOfertas(linhas.map((l) => l.offerId).filter((x): x is string => !!x));
  } catch (e) {
    console.error('Guia 3D: avisos de cupom/cartao indisponiveis (segue sem):', e);
  }
  const itens = guia.map((g) => {
    const low = g.masterId ? stats.get(g.masterId)?.lowAll ?? null : null;
    const lojas = g.lojas.map((l) => ({ ...l, aviso: l.offerId ? avisos.get(l.offerId) : undefined }));
    return { ...g, lojas, menor: g.menor ? lojas.find((l) => l.rede === g.menor!.rede) ?? g.menor : null, registradoCents: low?.priceCents ?? null, registradoEm: low?.at ?? null };
  });
  // Cartoes do departamento: por master, o aviso da loja de menor preco que tem aviso (cada master da lista, nao so o da guia).
  const porMaster: Record<string, string[]> = {};
  for (const l of [...linhas].sort((a, b) => a.precoCents - b.precoCents)) {
    if (porMaster[l.masterId] || !l.offerId) continue;
    const ls = linhasAviso(avisos.get(l.offerId));
    if (ls.length) porMaster[l.masterId] = ls.map((t) => `${t} · ${ROTULO_REDE_GUIA[l.rede]}`);
  }
  return { itens, porMaster };
}

/** Cache de 5 min (mesma regra da lista do departamento). */
const dadosCache = createCachedQuery(calcularGuia, ['guia-3d-v2'], { revalidate: 300, maxStaleSeconds: 3600, coldTimeoutSeconds: 30, live: true });
export async function guiaImpressoras3d(): Promise<ItemGuiaComRegistro[]> {
  return (await dadosCache()).itens;
}
/** Linhas de cupom e cartao por master para os cartoes do departamento (mesmo cache da guia). Falha = vazio. */
export async function avisosCartoesImpressoras3d(): Promise<Record<string, string[]>> {
  try {
    return (await dadosCache()).porMaster;
  } catch {
    return {};
  }
}
/** Sem cache (testes e verificacao ponta a ponta contra o SELECT). */
export const guiaImpressoras3dAoVivo = async (): Promise<ItemGuiaComRegistro[]> => (await calcularGuia()).itens;

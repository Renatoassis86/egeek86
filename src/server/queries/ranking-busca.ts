import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { linkPublicavelFilter } from '@/server/queries/public-offers';
import { getMasterProductMetrics } from '@/server/queries/affiliate';
import { RANKING_MAX_PRODUTOS, classificar, tokensDaBusca, type Classificacao } from '@/lib/ranking-busca';

/**
 * Oferta APTA para o ranking: ativa com preço, elegível (fora de quarentena, rascunho, porteiro e título de usado/Open Box), link de afiliado publicável (R-70)
 * e sem corte por idade em nenhuma rede, Amazon inclusive (R-90; dono, 2026-11-17). Só leitura; nada é gravado.
 */
export function aptaSql() {
  return sql`o.status = 'active' AND o.current_price_cents > 0 AND ${eligibleOfferSql('o')} AND ${linkPublicavelFilter('o')}`; // sem corte por idade em nenhuma rede (R-90; dono 2026-11-17: Amazon igual às outras)
}
const ASCII = sql.raw(`translate(lower(m.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`);

export interface ProdutoRanking { id: string; titulo: string; departamento: string; ofertas: number; menorCentavos: number; imagem: string | null }
export interface OfertaRanking { slug: string; loja: string; vendedor: string | null; precoCentavos: number; conferidoEm: string }
export interface RankingProduto {
  produto: { id: string; titulo: string };
  ofertas: OfertaRanking[];
  classificacao: Classificacao;
  indicadores: { mediaCentavos: number | null; menorRegistradoCentavos: number | null; menorRegistradoEm: string | null; noMenorPreco: boolean };
}

export async function buscarProdutosRanking(q: string): Promise<ProdutoRanking[]> {
  const tokens = tokensDaBusca(q);
  if (!tokens.length) return [];
  const padrao = (t: string) => `%${t.replace(/[^a-z0-9]/g, '')}%`;
  const like = sql.join(tokens.map((t) => sql`${ASCII} LIKE ${padrao(t)}`), sql` AND `);
  const rows = await db.execute<{ id: string; name: string; vertical: string; n: number; minp: number; img: string | null }>(sql`
    SELECT m.id::text AS id, m.name, m.vertical, count(*)::int AS n, min(o.current_price_cents)::int AS minp,
           (array_agg(o.image_url ORDER BY o.current_price_cents) FILTER (WHERE o.image_url IS NOT NULL))[1] AS img
    FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id
    JOIN affiliate_networks n ON n.id = o.network_id
    WHERE ${like} AND NOT (m.attributes ? 'mergedInto') AND ${aptaSql()}
    GROUP BY m.id
    ORDER BY count(*) DESC, length(m.name), m.id
    LIMIT ${RANKING_MAX_PRODUTOS}`);
  return rows.map((r) => ({ id: r.id, titulo: r.name, departamento: r.vertical, ofertas: r.n, menorCentavos: r.minp, imagem: r.img }));
}

export async function rankingDoProduto(masterId: string): Promise<RankingProduto | null> {
  if (!/^[0-9a-f-]{36}$/i.test(masterId)) return null;
  const rows = await db.execute<{ slug: string; loja: string; vendedor: string | null; preco: number; at: Date | string | null; name: string }>(sql`
    SELECT o.slug::text AS slug, n.name AS loja, o.store_name AS vendedor, o.current_price_cents::int AS preco, o.last_checked_at AS at, m.name
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id JOIN master_products m ON m.id = o.master_product_id
    WHERE o.master_product_id = ${masterId}::uuid AND ${aptaSql()}
    ORDER BY o.current_price_cents ASC, o.id LIMIT 30`);
  if (!rows.length) return null;
  const m = await getMasterProductMetrics(masterId).catch(() => null);
  const ofertas = rows.map((r) => ({ slug: r.slug, loja: r.loja, vendedor: r.vendedor, precoCentavos: r.preco, conferidoEm: new Date(r.at ?? Date.now()).toISOString() }));
  const menor = ofertas[0].precoCentavos;
  return {
    produto: { id: masterId, titulo: rows[0].name },
    ofertas,
    classificacao: classificar({ nOfertas: ofertas.length, elegivel: !!m?.eligibility?.eligible, veredito: m?.verdict?.kind ?? null }),
    indicadores: {
      mediaCentavos: m?.eligibility?.eligible ? (m.avgPriceCents ?? null) : null,
      menorRegistradoCentavos: m?.eligibility?.eligible ? m.lowestPriceCents : null,
      menorRegistradoEm: m?.eligibility?.eligible && m.lowestPriceAt ? new Date(m.lowestPriceAt).toISOString() : null,
      noMenorPreco: !!m?.eligibility?.eligible && m.isLowestEver === true && menor <= (m.lowestPriceCents ?? 0),
    },
  };
}

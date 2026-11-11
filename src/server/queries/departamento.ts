import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicOffersCtes } from '@/server/queries/public-offers';
import { verticalSql } from '@/lib/catalog/verticais';
import {
  MIN_VENDEDORES_MEDIANA,
  OFERTA_CLICAVEL_MAX_HORAS,
  POR_PAGINA,
  REDES_DEPARTAMENTO,
  departamentoPorSlug,
  termosBusca,
  type DepartamentoSlug,
  type MasterIdentidadeInput,
} from '@/lib/catalog/departamentos';

/**
 * CONSULTAS PÚBLICAS DE DEPARTAMENTO (ata 2026-11-10, emenda E.1 item 2). Arquivo NOVO: nenhuma consulta de games
 * é editada e nenhuma delas passa por aqui.
 *
 * Regras (todas no SQL, nunca no front):
 *  - `vertical` é parâmetro OBRIGATÓRIO e deve ser um departamento do registro (games é recusado): o predicado
 *    `vertical = '<dept>'` vale para a oferta E para o master.
 *  - Master só entra com porteiro APROVADO por inclusão (`catalogGate.verdict = 'approved'` ou `manual = 'approved'`),
 *    nunca pela ausência de 'review'. `manual = 'rejected'` vence.
 *  - Oferta clicável = passa em `publicOffersCtes(vertical)` (ativa, preço > 0, plausível, sem quarentena, identidade ok)
 *    E link NÃO pendente E checada há menos de OFERTA_CLICAVEL_MAX_HORAS E rede Mercado Livre ou Shopee (Amazon fora)
 *    E URL http(s).
 *  - Sem histórico, sem selo, sem "de/por": só preço atual, número de vendedores, carimbo de tempo e, com 3+ vendedores
 *    do Mercado Livre, a mediana (rotulada pela interface como "apenas Mercado Livre").
 *  - Reaproveita `publicOffersCtes` (que já exige a vertical). `priceQuotesCtes` não é usado: não há série nos departamentos.
 */

function assertDepartamento(vertical: string): asserts vertical is DepartamentoSlug {
  if (!departamentoPorSlug(vertical)) throw new Error(`departamento inválido para consulta de nicho: ${vertical}`);
}

/** Predicado de porteiro aprovado por INCLUSÃO. `alias` = alias de master_products. */
export function masterAprovadoSql(alias: string): SQL {
  const a = sql.raw(alias.replace(/[^a-z0-9_]/gi, ''));
  return sql`(${a}.attributes -> 'catalogGate' ->> 'verdict' = 'approved' OR ${a}.attributes -> 'catalogGate' ->> 'manual' = 'approved') AND COALESCE(${a}.attributes -> 'catalogGate' ->> 'manual', '') <> 'rejected'`;
}

/** CTEs: public_offers (helper existente) + clickable (ofertas clicáveis de masters aprovados) + seller_best (1 por vendedor). */
export function departamentoClicaveisCtes(vertical: string): SQL {
  assertDepartamento(vertical);
  const horas = sql.raw(String(Math.trunc(OFERTA_CLICAVEL_MAX_HORAS)));
  const redes = sql.join(REDES_DEPARTAMENTO.map((r) => sql`${r}`), sql`, `);
  return sql`
    ${publicOffersCtes(vertical)},
    clickable AS (
      SELECT o.id, o.master_product_id, o.current_price_cents, o.last_checked_at, o.slug AS offer_slug,
             o.seller_id, n.slug AS network_slug, n.name AS network_name
      FROM affiliate_offers o
      INNER JOIN public_offers po ON po.id = o.id
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      INNER JOIN master_products m ON m.id = o.master_product_id
      WHERE ${verticalSql('o', vertical)}
        AND ${verticalSql('m', vertical)}
        AND ${masterAprovadoSql('m')}
        AND o.affiliate_link_pending = false
        AND o.quarantined_at IS NULL
        AND o.status = 'active'
        AND o.current_price_cents > 0
        AND o.last_checked_at >= now() - interval '${horas} hours'
        AND n.slug IN (${redes})
        AND o.affiliate_url ~* '^https?://'
    ),
    seller_best AS (
      SELECT DISTINCT ON (c.master_product_id, COALESCE(c.seller_id::text, c.id::text)) c.*
      FROM clickable c
      ORDER BY c.master_product_id, COALESCE(c.seller_id::text, c.id::text), c.current_price_cents ASC, c.last_checked_at DESC
    )
  `;
}

export async function contarMastersVisiveis(vertical: string): Promise<number> {
  assertDepartamento(vertical);
  const rows = await db.execute<{ n: number }>(sql`
    WITH ${departamentoClicaveisCtes(vertical)}
    SELECT COUNT(DISTINCT master_product_id)::int AS n FROM clickable
  `);
  return Number(rows[0]?.n ?? 0);
}

export interface CartaoDepartamento extends MasterIdentidadeInput {
  id: string;
  slug: string;
  nome: string;
  imagem: string | null;
  menorCents: number;
  vendedores: number;
  /** Vendedores do Mercado Livre (base da mediana). */
  vendedoresMl: number;
  /** Só preenchida com MIN_VENDEDORES_MEDIANA ou mais vendedores do Mercado Livre. */
  medianaCents: number | null;
  verificadoEm: string;
}

export interface PaginaDepartamento {
  itens: CartaoDepartamento[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

interface RowLista extends Record<string, unknown> {
  id: string; slug: string; name: string; gtin: string | null; mpn: string | null; manufacturer: string | null;
  cat: Record<string, unknown> | null; imagem: string | null;
  min_cents: string | number; vendedores: string | number; vendedores_ml: string | number; mediana: string | number | null;
  verificado_em: Date | string; total: string | number;
}

function mapCartao(r: RowLista): CartaoDepartamento {
  return {
    id: r.id,
    slug: r.slug,
    nome: r.name,
    imagem: r.imagem,
    gtin: r.gtin,
    mpn: r.mpn,
    manufacturer: r.manufacturer,
    catalogAttributes: r.cat,
    menorCents: Number(r.min_cents),
    vendedores: Number(r.vendedores),
    vendedoresMl: Number(r.vendedores_ml),
    medianaCents: r.mediana === null || r.mediana === undefined ? null : Math.round(Number(r.mediana)),
    verificadoEm: new Date(r.verificado_em).toISOString(),
  };
}

/** Lista paginada (24 por página) com busca interna por nome, ordenada pelo menor preço. */
export async function listarDepartamento(vertical: string, opts: { pagina?: number; q?: string | null } = {}): Promise<PaginaDepartamento> {
  assertDepartamento(vertical);
  const pagina = Math.max(1, Math.min(500, Math.trunc(opts.pagina ?? 1) || 1));
  const termos = termosBusca(opts.q);
  const busca = termos.length ? sql.join(termos.map((t) => sql`AND m.name ILIKE ${'%' + t + '%'}`), sql` `) : sql``;
  const minV = sql.raw(String(MIN_VENDEDORES_MEDIANA));
  const rows = await db.execute<RowLista>(sql`
    WITH ${departamentoClicaveisCtes(vertical)}
    SELECT m.id, m.slug, m.name, m.gtin, m.mpn, m.manufacturer,
           m.attributes -> 'vertical' -> 'catalogAttributes' AS cat,
           m.default_images ->> 0 AS imagem,
           MIN(sb.current_price_cents) AS min_cents,
           COUNT(*) AS vendedores,
           COUNT(*) FILTER (WHERE sb.network_slug = 'mercado-livre') AS vendedores_ml,
           CASE WHEN COUNT(*) FILTER (WHERE sb.network_slug = 'mercado-livre') >= ${minV}
                THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY sb.current_price_cents) FILTER (WHERE sb.network_slug = 'mercado-livre') END AS mediana,
           (array_agg(sb.last_checked_at ORDER BY sb.current_price_cents ASC, sb.last_checked_at DESC))[1] AS verificado_em,
           COUNT(*) OVER () AS total
    FROM seller_best sb
    INNER JOIN master_products m ON m.id = sb.master_product_id
    WHERE ${verticalSql('m', vertical)} ${busca}
    GROUP BY m.id
    ORDER BY MIN(sb.current_price_cents) ASC, m.name ASC
    LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}
  `);
  // COUNT(*) OVER () conta os grupos? Não: é avaliado depois do GROUP BY, então é o total de masters. Página fora do alcance => total 0 aqui.
  let total = rows.length ? Number(rows[0].total) : 0;
  if (!rows.length && pagina > 1) {
    const t = await db.execute<{ n: number }>(sql`
      WITH ${departamentoClicaveisCtes(vertical)}
      SELECT COUNT(DISTINCT sb.master_product_id)::int AS n FROM seller_best sb INNER JOIN master_products m ON m.id = sb.master_product_id
      WHERE ${verticalSql('m', vertical)} ${busca}
    `);
    total = Number(t[0]?.n ?? 0);
  }
  return { itens: rows.map(mapCartao), total, pagina, totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

export interface VendedorDetalhe {
  ofertaSlug: string;
  rede: 'mercado-livre' | 'shopee';
  redeNome: string;
  vendedor: string | null;
  precoCents: number;
  verificadoEm: string;
}
export interface DetalheDepartamento {
  master: CartaoDepartamento;
  /** Menor preço por loja (rede): uma linha por rede presente. */
  porLoja: VendedorDetalhe[];
  /** Menor preço de cada vendedor, até 10, do mais barato ao mais caro. */
  vendedoresLista: VendedorDetalhe[];
}

export async function detalheDepartamento(vertical: string, slug: string): Promise<DetalheDepartamento | null> {
  assertDepartamento(vertical);
  if (!slug || slug.length > 200) return null;
  const lista = await db.execute<RowLista>(sql`
    WITH ${departamentoClicaveisCtes(vertical)}
    SELECT m.id, m.slug, m.name, m.gtin, m.mpn, m.manufacturer,
           m.attributes -> 'vertical' -> 'catalogAttributes' AS cat,
           m.default_images ->> 0 AS imagem,
           MIN(sb.current_price_cents) AS min_cents,
           COUNT(*) AS vendedores,
           COUNT(*) FILTER (WHERE sb.network_slug = 'mercado-livre') AS vendedores_ml,
           CASE WHEN COUNT(*) FILTER (WHERE sb.network_slug = 'mercado-livre') >= ${sql.raw(String(MIN_VENDEDORES_MEDIANA))}
                THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY sb.current_price_cents) FILTER (WHERE sb.network_slug = 'mercado-livre') END AS mediana,
           (array_agg(sb.last_checked_at ORDER BY sb.current_price_cents ASC, sb.last_checked_at DESC))[1] AS verificado_em,
           1 AS total
    FROM seller_best sb
    INNER JOIN master_products m ON m.id = sb.master_product_id
    WHERE ${verticalSql('m', vertical)} AND m.slug = ${slug}
    GROUP BY m.id
  `);
  if (!lista.length) return null;
  const master = mapCartao(lista[0]);
  const vend = await db.execute<{ offer_slug: string; network_slug: 'mercado-livre' | 'shopee'; network_name: string; nickname: string | null; current_price_cents: string | number; last_checked_at: Date | string }>(sql`
    WITH ${departamentoClicaveisCtes(vertical)}
    SELECT sb.offer_slug, sb.network_slug, sb.network_name, s.nickname, sb.current_price_cents, sb.last_checked_at
    FROM seller_best sb
    LEFT JOIN affiliate_sellers s ON s.id = sb.seller_id
    WHERE sb.master_product_id = ${master.id}
    ORDER BY sb.current_price_cents ASC, sb.last_checked_at DESC
  `);
  const todos: VendedorDetalhe[] = vend.map((v) => ({
    ofertaSlug: v.offer_slug,
    rede: v.network_slug,
    redeNome: v.network_name,
    vendedor: v.nickname,
    precoCents: Number(v.current_price_cents),
    verificadoEm: new Date(v.last_checked_at).toISOString(),
  }));
  const vistos = new Set<string>();
  const porLoja = todos.filter((v) => (vistos.has(v.rede) ? false : (vistos.add(v.rede), true)));
  return { master, porLoja, vendedoresLista: todos.slice(0, 10) };
}

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  acumular, comissaoOferta, comissaoProduto, resumir,
  type ComissaoOferta, type ComissaoProduto, type GrupoAgregado, type GrupoResumo,
} from '@/lib/admin-gestao/taxas-comissao';

/**
 * Consultas ADMIN da comissão prevista (#62). Separadas de propósito das consultas públicas: nada daqui é importado fora de
 * src/app/admin (o teste scripts/test-comissao-admin.ts garante). Somente leitura.
 */

type Raw = Record<string, unknown>;
const ATIVA = sql`o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0`;
const TIPO_GAMES = sql`(CASE WHEN m.vertical = 'games' THEN m.product_type::text END)`;

/** Comissão por oferta (id da oferta -> valores), para as listas de ofertas do admin. */
export async function comissaoPorOfertas(ids: string[]): Promise<Map<string, ComissaoOferta>> {
  const out = new Map<string, ComissaoOferta>();
  if (ids.length === 0) return out;
  const rows = await db.execute<Raw>(sql`
    SELECT o.id::text AS id, n.slug AS rede, m.vertical, ${TIPO_GAMES} AS tipo, o.current_price_cents AS preco
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    WHERE o.id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  for (const r of rows) out.set(String(r.id), comissaoOferta(String(r.rede), r.vertical as string, r.tipo as string | null, Number(r.preco)));
  return out;
}

/** Comissão por produto (master): oferta de menor preço + faixa min/max entre as ofertas ativas. */
export async function comissaoPorMasters(ids: string[]): Promise<Map<string, ComissaoProduto>> {
  const out = new Map<string, ComissaoProduto>();
  if (ids.length === 0) return out;
  const rows = await db.execute<Raw>(sql`
    SELECT o.master_product_id::text AS mid, n.slug AS rede, m.vertical, ${TIPO_GAMES} AS tipo, o.current_price_cents AS preco
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    WHERE ${ATIVA} AND o.master_product_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const por = new Map<string, Array<{ precoCents: number; comissao: ComissaoOferta }>>();
  for (const r of rows) {
    const preco = Number(r.preco);
    const l = por.get(String(r.mid)) ?? [];
    l.push({ precoCents: preco, comissao: comissaoOferta(String(r.rede), r.vertical as string, r.tipo as string | null, preco) });
    por.set(String(r.mid), l);
  }
  for (const [mid, l] of por) out.set(mid, comissaoProduto(l));
  return out;
}

export interface ResumoComissao {
  total: GrupoResumo;
  porRede: GrupoResumo[];
  porLoja: Array<GrupoResumo & { rede: string }>;
  porCategoria: GrupoResumo[];
}

/** Agregado do catálogo ativo (ofertas ativas, fora da quarentena): totais, por rede, por loja/vendedor e por categoria. */
export async function resumoComissao(): Promise<ResumoComissao> {
  const rows = await db.execute<Raw>(sql`
    SELECT n.slug AS rede, m.vertical, ${TIPO_GAMES} AS tipo,
           COALESCE(NULLIF(BTRIM(o.store_name), ''), NULLIF(BTRIM(s.nickname), ''), '(sem loja identificada)') AS loja,
           COUNT(*)::int AS ofertas, SUM(o.current_price_cents)::bigint AS preco
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE ${ATIVA} AND NOT (m.attributes ? 'mergedInto')
    GROUP BY 1, 2, 3, 4`);
  const total = new Map<string, GrupoAgregado>();
  const rede = new Map<string, GrupoAgregado>();
  const loja = new Map<string, GrupoAgregado>();
  const cat = new Map<string, GrupoAgregado>();
  for (const r of rows) {
    const slug = String(r.rede);
    const preco = Number(r.preco);
    const n = Number(r.ofertas);
    // Taxa é fixa por (rede, categoria): comissão do grupo = soma dos preços x taxa.
    const c = comissaoOferta(slug, r.vertical as string, r.tipo as string | null, preco);
    const est = c.confianca === 'estimada';
    acumular(total, 'total', preco, c.cents, est, n);
    acumular(rede, slug, preco, c.cents, est, n);
    acumular(loja, `${slug}|${String(r.loja)}`, preco, c.cents, est, n);
    acumular(cat, `${slug}|${c.categoria}`, preco, c.cents, est, n);
  }
  return {
    total: resumir(total)[0] ?? { chave: 'total', ofertas: 0, precoCents: 0, comissaoCents: 0, ofertasEstimadas: 0, taxaMedia: null, pctEstimada: null },
    porRede: resumir(rede),
    porLoja: resumir(loja).map((g) => ({ ...g, rede: g.chave.split('|')[0], chave: g.chave.slice(g.chave.indexOf('|') + 1) })),
    porCategoria: resumir(cat),
  };
}

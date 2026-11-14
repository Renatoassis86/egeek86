import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { GAMES } from '@/lib/catalog/verticais';
import { publicOffersCtes } from '@/server/queries/public-offers';
import { masterNoEscopoSql } from '@/server/queries/escopo-vitrine';
import { getDimensionOverrides } from '@/server/queries/catalog-dimensions';
import { STATS_PERSIST_MAX_AGE_MS } from '@/server/queries/product-price-stats';
import { sellerTier } from '@/lib/affiliate/price-verdict';
import { swr } from '@/lib/cache/swr';
import { VITRINE_REGRAS, type Candidato, type ContextoAvaliacao, type PromoPrime } from '@/lib/vitrines';
import { precoComPromocao, promoPrimeLigada } from '@/lib/coupons/amazon-promocoes';
import type { GamePlatformGen } from '@/db/schema';

/**
 * POOL DAS VITRINES: UMA leitura em lote para todas as vitrines (checklist #7). Devolve, por produto, a oferta pública mais barata
 * (`public_offers`, ADR 0002: ativa, preço > 0, coleta real, plausível, fora de Open Box/usado/cross-gen/quarentena/porteiro) com os
 * agregados de oferta e a estatística de preço JÁ PRÉ-CALCULADA (`product_price_stats`, escrita pelo cron; leitura por PK dentro da
 * mesma consulta). Sem varredura de cotação: nenhuma consulta toca `affiliate_price_snapshots`.
 *
 * Teto: transação curta só com SET LOCAL statement_timeout/lock_timeout (nada fica aberto) e espera máxima do chamador.
 * O pool não é persistido: ele vive em memória por poucos minutos e alimenta os loaders persistidos (`getVitrine`).
 */

const STATEMENT_TIMEOUT = '20s';
const POOL_FRESH_MS = 120_000;
const POOL_MAX_STALE_MS = 6 * 3600_000;

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Passo A: as ofertas públicas (id, produto, preço, loja, vendedor, leitura). Uma varredura de `public_offers` (~2 s medido),
 * sem junção com o cadastro do produto: o plano do Postgres subestima as CTEs (estimou 2 linhas para ~10 mil) e junções
 * seguintes viravam laço aninhado sobre a CTE (mais de 90 s medido em 2026-11-13). Agregação e "mais barata por produto" ficam no TS.
 */
export function sqlOfertasPublicas(): SQL {
  return sql`
    WITH ${publicOffersCtes(GAMES)}
    SELECT o.id, o.master_product_id AS mid, o.current_price_cents AS p, n.slug AS net_slug, o.seller_id,
           COALESCE(o.last_price_confirmed_at, o.last_checked_at) AS read_at,
           s.reputation_level AS s_rep, s.power_seller_status AS s_power, s.total_sales AS s_sales, (s.id IS NOT NULL) AS s_has
    FROM affiliate_offers o
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    INNER JOIN public_offers po ON po.id = o.id
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.affiliate_link_pending = false AND o.affiliate_url ~* '^https?://'
  `;
}

/** Passo B: cadastro, vendedor e estatística pré-calculada só das ofertas vencedoras (PK por lista de ids). */
export function sqlDetalhes(offerIds: string[]): SQL {
  const statsMaxS = Math.round(STATS_PERSIST_MAX_AGE_MS / 1000);
  return sql`
    SELECT o.id AS offer_id, o.master_product_id AS mid, o.slug, o.title, o.image_url, n.name AS net_name,
           m.name AS mname, m.product_type, m.game_platform_gen, m.game_format, m.game_edition_type,
           m.default_images ->> 0 AS m_image, ${masterNoEscopoSql('m')} AS no_escopo,
           s.reputation_level, s.power_seller_status, s.total_sales, (s.id IS NOT NULL) AS has_seller,
           ps.payload AS stats
    FROM affiliate_offers o
    INNER JOIN master_products m ON m.id = o.master_product_id
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    LEFT JOIN product_price_stats ps ON ps.master_product_id = o.master_product_id
      AND ps.computed_at > now() - (${statsMaxS} * interval '1 second')
    WHERE o.id = ANY(string_to_array(${offerIds.join(',')}, ',')::uuid[]) AND m.vertical = 'games'
  `;
}

interface OfertaPublica {
  id: string;
  mid: string;
  p: number;
  netSlug: string;
  sellerId: string | null;
  readAt: number;
  /** Vendedor de reputação baixa (mesma regra do selo): a vitrine prefere a menor oferta de vendedor confiável. */
  fraco: boolean;
}

async function comTeto<T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(`'${STATEMENT_TIMEOUT}'`)}`);
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    return fn(tx);
  });
}

/**
 * Passo C (dono, 2026-11-14): promoção Prime NA FINALIZAÇÃO confirmada para as ofertas vencedoras (poucas linhas: coupon_items da Amazon, PK por lista de ids).
 * Só com a flag PROMO_PRIME_DERIVADA. Exige cupom `verificado` + `assinantes` + `prime_checkout`, validade lida no futuro e confirmação na página do item (120 min).
 * O preço final é DERIVADO (prateleira x (1 - pct)); a falha desta consulta nunca derruba a vitrine.
 */
export async function carregarPromosPrime(ofertas: ReadonlyArray<{ offerId: string; precoCentavos: number }>): Promise<Map<string, PromoPrime>> {
  const out = new Map<string, PromoPrime>();
  if (!promoPrimeLigada() || !ofertas.length) return out;
  try {
    const ids = ofertas.map((o) => o.offerId).join(',');
    const rows = await comTeto((tx) => tx.execute<Row>(sql`
      SELECT ci.scope->'offer_ids'->>0 AS oid, max(ci.value_num)::float AS pct, max(ci.valid_until) AS valid_until, max(r.read_at) AS conf
      FROM coupon_items ci
      JOIN offer_coupon_reads r ON r.offer_id = (ci.scope->'offer_ids'->>0)::uuid AND r.campaign_id = ci.conditions->>'promo_id'
        AND r.source = 'amazon-item-confirmado' AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '120 minutes'
      WHERE ci.network_slug = 'amazon' AND ci.state = 'verificado' AND ci.audience = 'assinantes' AND ci.conditions->>'prime_checkout' = 'true'
        AND ci.valid_until > now() AND (ci.valid_from IS NULL OR ci.valid_from <= now())
        AND ci.scope->'offer_ids'->>0 = ANY(string_to_array(${ids}, ','))
      GROUP BY 1`));
    const preco = new Map(ofertas.map((o) => [o.offerId, o.precoCentavos]));
    for (const r of rows) {
      const p = preco.get(str(r.oid));
      const pct = num(r.pct);
      if (!p || !(pct > 0 && pct <= VITRINE_REGRAS.QUEDA_MAX_PCT)) continue;
      out.set(str(r.oid), { pct, finalCentavos: precoComPromocao(p, pct), validaAte: r.valid_until ? new Date(r.valid_until as string | Date).toISOString() : null, confirmadoEm: new Date(r.conf as string | Date).toISOString() });
    }
  } catch (e) {
    console.error('[vitrines] promo prime falhou (segue sem)', e instanceof Error ? e.message.slice(0, 160) : e);
  }
  return out;
}

export async function carregarPoolBruto(): Promise<Candidato[]> {
  const brutas = await comTeto((tx) => tx.execute<Row>(sqlOfertasPublicas()));
  const ofertas: OfertaPublica[] = brutas.map((r) => ({
    id: str(r.id),
    mid: str(r.mid),
    p: num(r.p),
    netSlug: str(r.net_slug),
    sellerId: strOrNull(r.seller_id),
    readAt: r.read_at == null ? 0 : new Date(r.read_at as string | Date).getTime(),
    fraco: r.s_has ? sellerTier({ reputationLevel: strOrNull(r.s_rep), powerSellerStatus: strOrNull(r.s_power), totalSales: r.s_sales == null ? null : num(r.s_sales) }) === 'low' : false,
  }));
  // Por produto: a oferta mais barata (empate: leitura mais recente, depois id), contagens e vendedores dentro de +-10%.
  const porMaster = new Map<string, OfertaPublica[]>();
  for (const o of ofertas) {
    const l = porMaster.get(o.mid);
    if (l) l.push(o);
    else porMaster.set(o.mid, [o]);
  }
  const banda = 1 + VITRINE_REGRAS.BANDA_CORROBORACAO_PCT / 100;
  const topo = new Map<string, { oferta: OfertaPublica; ativas: number; lojas: number; proximos: number }>();
  for (const [mid, lista] of porMaster) {
    // Dono, 2026-11-13: se a mais barata é de vendedor fraco, vale a menor oferta de vendedor confiável (o produto não some por causa dela).
    lista.sort((a, b) => Number(a.fraco) - Number(b.fraco) || a.p - b.p || b.readAt - a.readAt || (a.id < b.id ? -1 : 1));
    const menor = lista[0]!;
    const vend = new Set<string>();
    for (const o of lista) if (!o.fraco && o.p <= menor.p * banda) vend.add(o.sellerId ?? o.id);
    topo.set(mid, { oferta: menor, ativas: lista.length, lojas: new Set(lista.map((o) => o.netSlug)).size, proximos: vend.size });
  }
  const ids = [...topo.values()].map((t) => t.oferta.id);
  if (!ids.length) return [];
  const det = await comTeto((tx) => tx.execute<Row>(sqlDetalhes(ids)));
  const out: Candidato[] = [];
  for (const r of det) {
    if (r.no_escopo === false) continue; // marcado fora do escopo de compra real (ata 2026-11-12)
    const t = topo.get(str(r.mid));
    if (!t) continue;
    out.push(paraCandidato(r, t.oferta, t.ativas, t.lojas, t.proximos));
  }
  const promos = await carregarPromosPrime(out.map((c) => ({ offerId: c.offerId, precoCentavos: c.precoCentavos })));
  if (promos.size) for (const c of out) { const pp = promos.get(c.offerId); if (pp) c.promoPrime = pp; }
  return out;
}

type PayloadStats = {
  avgCents?: number | null;
  quoteCount?: number;
  historyDays?: number;
  lowConfidence?: boolean;
  lowAll?: { priceCents?: number; at?: string } | null;
  lowBadgeBlock?: string | null;
};

function paraCandidato(r: Row, o: OfertaPublica, ativas: number, lojas: number, proximos: number): Candidato {
  const p = (r.stats ?? null) as PayloadStats | null;
  const imagem = strOrNull(r.image_url) ?? strOrNull(r.m_image);
  return {
    masterProductId: str(r.mid),
    offerId: o.id,
    slug: str(r.slug),
    tituloOferta: str(r.title),
    nomeMaster: str(r.mname),
    imagemUrl: imagem,
    tipoDb: str(r.product_type) as Candidato['tipoDb'],
    plataformaDb: str(r.game_platform_gen) as GamePlatformGen,
    formatoDb: str(r.game_format),
    edicaoDb: str(r.game_edition_type),
    precoCentavos: o.p,
    loja: str(r.net_name),
    lojaSlug: o.netSlug,
    lidoEm: o.readAt ? new Date(o.readAt).toISOString() : null,
    ofertasAtivas: ativas,
    lojasAtivas: lojas,
    vendedoresProximos: proximos,
    vendedor: r.has_seller ? { reputationLevel: strOrNull(r.reputation_level), powerSellerStatus: strOrNull(r.power_seller_status), totalSales: r.total_sales == null ? null : num(r.total_sales) } : null,
    stats: p
      ? {
          avgCents: p.avgCents == null ? null : Number(p.avgCents),
          quoteCount: Number(p.quoteCount ?? 0),
          historyDays: Number(p.historyDays ?? 0),
          lowConfidence: p.lowConfidence === true,
          lowAllCents: p.lowAll?.priceCents == null ? null : Number(p.lowAll.priceCents),
          lowAllAt: p.lowAll?.at ?? null,
          lowBadgeBlock: p.lowBadgeBlock ?? null,
        }
      : null,
  };
}

export interface PoolVitrines {
  candidatos: Candidato[];
  /** Masters fora da cartela e tipo efetivo (porteiro/dimensão), serializáveis. */
  ocultos: string[];
  tipoEfetivo: Array<[string, 'game' | 'console' | 'accessory']>;
  lidoEm: string;
}

async function calcularPool(): Promise<PoolVitrines> {
  const [candidatos, ov] = await Promise.all([carregarPoolBruto(), getDimensionOverrides()]);
  const tipoEfetivo: Array<[string, 'game' | 'console' | 'accessory']> = [];
  for (const t of ['game', 'console', 'accessory'] as const) for (const id of ov.toType[t]) tipoEfetivo.push([id, t]);
  return { candidatos, ocultos: ov.hidden, tipoEfetivo, lidoEm: new Date().toISOString() };
}

/**
 * Pool em memória (SWR): fresco 2 min; vencido é servido na hora e recalculado por trás (uma só vez). A frio, espera no máximo o teto da
 * consulta (o `getVitrine` que chama este pool já tem seu próprio teto de página e snapshot persistido por trás).
 */
export function lerPoolVitrines(): Promise<PoolVitrines> {
  return swr<PoolVitrines>('vitrines-pool-v1', calcularPool, { ttlMs: POOL_FRESH_MS, maxStaleMs: POOL_MAX_STALE_MS, coldTimeoutMs: 25_000, hardTimeoutMs: 30_000 });
}

export function contextoDoPool(pool: PoolVitrines, agora = new Date()): ContextoAvaliacao {
  return { agora, ocultos: new Set(pool.ocultos), tipoEfetivo: new Map(pool.tipoEfetivo) };
}

import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { verticalSql, type Vertical } from '@/lib/catalog/verticais';
import {
  PAGE_SIZE, escapeLike, foldTotais, statusDoVeredito,
  type AvgRow, type CatalogoLinha, type Filtros, type LojaTotais, type MasterStatusRow, type OfferAggRow, type SnapshotDia,
} from '@/lib/catalog/inventario';

/**
 * Consultas do inventário do catálogo (somente leitura; /admin/catalogo, export CSV, script de documento, snapshot diário).
 * Tudo em poucas consultas agregadas (sem N+1). Base atual: ~7,5 mil masters e ~16 mil ofertas.
 * Índices usados: master_products(vertical via varredura da loja), affiliate_offers_master_idx / status_published_idx,
 * price_daily_state PK (master_product_id, day).
 *
 * Definições (iguais em todas as saídas):
 *  - master contado = não fundido (`attributes.mergedInto` ausente); status = catalogGate.verdict (ausente = aprovado).
 *  - oferta ativa = status 'active', fora da quarentena de preço e com preço > 0.
 *  - link oficial = ML: affiliate_url começa com https://meli.la/ ; demais redes: affiliate_link_pending = false.
 *  - média única = linha mais recente de price_daily_state com avg_cents calculado (a mesma base do selo; cada oferta vale 1 por dia).
 */

const OFERTA_ATIVA = sql`o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0`;
const OFICIAL = sql`(CASE WHEN n.slug = 'mercado-livre' THEN COALESCE(o.affiliate_url, '') LIKE 'https://meli.la/%' ELSE NOT o.affiliate_link_pending END)`;
const NAO_FUNDIDO = sql`NOT (m.attributes ? 'mergedInto')`;
const VEREDITO = sql`COALESCE(m.attributes -> 'catalogGate' ->> 'verdict', 'approved')`;
const CA = sql`m.attributes -> 'vertical' -> 'catalogAttributes'`;
const MARCA = sql`COALESCE(NULLIF(b.name, ''), NULLIF(m.manufacturer, ''), NULLIF(${CA} ->> 'BRAND', ''), NULLIF(${CA} ->> 'BOOK_PUBLISHER', ''))`;
const MODELO = sql`COALESCE(NULLIF(${CA} ->> 'MODEL', ''), NULLIF(${CA} ->> 'AUTHOR', ''))`;
const PLATAFORMA = sql`(CASE WHEN m.vertical = 'games' AND m.game_platform_gen::text <> 'unknown' THEN m.game_platform_gen::text END)`;
const TIPO = sql`(CASE WHEN m.vertical = 'games' THEN m.product_type::text ELSE m.attributes -> 'vertical' ->> 'segment' END)`;
const CHAVE = sql`COALESCE(m.attributes -> 'vertical' ->> 'identityKey', m.gtin)`;

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const int = (v: unknown): number => Number(v ?? 0) || 0;
const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

// ---------------------------------------------------------------- totais por loja

/** Totais de TODAS as lojas em 3 consultas agregadas (masters por status, ofertas por rede, masters com média). */
export async function carregarTotaisLojas(): Promise<Record<Vertical, LojaTotais>> {
  const [masters, offers, avgs] = await Promise.all([
    db.execute<Raw>(sql`
      SELECT m.vertical, ${VEREDITO} AS status, COUNT(*)::int AS n
      FROM master_products m WHERE ${NAO_FUNDIDO} GROUP BY 1, 2`),
    db.execute<Raw>(sql`
      SELECT m.vertical, n.slug AS rede, COUNT(*)::int AS ativas, COUNT(*) FILTER (WHERE ${OFICIAL})::int AS oficiais,
             MIN(o.current_price_cents) AS min_cents, MAX(o.current_price_cents) AS max_cents, MAX(o.last_checked_at) AS ultima_coleta
      FROM affiliate_offers o
      JOIN affiliate_networks n ON n.id = o.network_id
      JOIN master_products m ON m.id = o.master_product_id
      WHERE ${OFERTA_ATIVA} AND ${NAO_FUNDIDO} GROUP BY 1, 2`),
    db.execute<Raw>(sql`
      SELECT m.vertical, COUNT(*)::int AS n
      FROM master_products m
      WHERE ${NAO_FUNDIDO} AND ${VEREDITO} = 'approved'
        AND EXISTS (SELECT 1 FROM price_daily_state s WHERE s.master_product_id = m.id AND s.avg_cents IS NOT NULL)
      GROUP BY 1`),
  ]);
  return foldTotais([...masters] as unknown as MasterStatusRow[], [...offers] as unknown as OfferAggRow[], [...avgs] as unknown as AvgRow[]);
}

/** Masters aprovados e ofertas ativas por loja e tipo/segmento (base do bloco "por departamento" do documento). */
export async function carregarPorTipo(): Promise<Array<{ vertical: string; tipo: string; masters: number; ofertas: number }>> {
  const rows = await db.execute<Raw>(sql`
    SELECT m.vertical, COALESCE(${TIPO}, '(sem tipo)') AS tipo, COUNT(*)::int AS masters,
           COALESCE(SUM(a.n), 0)::int AS ofertas
    FROM master_products m
    LEFT JOIN (
      SELECT o.master_product_id, COUNT(*) AS n FROM affiliate_offers o WHERE ${OFERTA_ATIVA} GROUP BY 1
    ) a ON a.master_product_id = m.id
    WHERE ${NAO_FUNDIDO} AND ${VEREDITO} = 'approved'
    GROUP BY 1, 2 ORDER BY 1, 3 DESC`);
  return [...rows].map((r) => ({ vertical: String(r.vertical), tipo: String(r.tipo), masters: int(r.masters), ofertas: int(r.ofertas) }));
}

// ---------------------------------------------------------------- listagem / exportação

export interface OpcoesLista {
  vertical: Vertical;
  filtros?: Partial<Pick<Filtros, 'q' | 'marca' | 'rede' | 'status' | 'link' | 'sort'>>;
  limit: number;
  offset?: number;
  /** Exportação: ordena por id e continua depois deste id (paginação por chave, sem OFFSET). */
  afterId?: string | null;
}

export interface ResultadoLista { linhas: CatalogoLinha[]; total: number }

function ordenacao(sort: string | undefined, porId: boolean): SQL {
  if (porId) return sql`m.id`;
  if (sort === 'ofertas') return sql`COALESCE(a.n_total, 0) DESC, m.name, m.id`;
  if (sort === 'preco') return sql`a.min_cents ASC NULLS LAST, m.name, m.id`;
  return sql`m.name, m.id`;
}

/**
 * Uma consulta por página: CTE `a` agrega as ofertas ativas da loja por master (1 passada), `f` filtra/ordena/numera,
 * e só as linhas da página recebem os LATERAL (oferta mais barata e média única mais recente: busca por chave primária).
 */
export async function carregarLinhas(o: OpcoesLista): Promise<ResultadoLista> {
  const f = o.filtros ?? {};
  const conds: SQL[] = [verticalSql('m', o.vertical), NAO_FUNDIDO];
  if (f.q) conds.push(sql`(m.name ILIKE ${'%' + escapeLike(f.q) + '%'} OR m.gtin = ${f.q})`);
  if (f.marca) conds.push(sql`${MARCA} ILIKE ${'%' + escapeLike(f.marca) + '%'}`);
  if (f.status) conds.push(sql`${VEREDITO} = ${f.status}`);
  if (f.rede === 'mercado-livre') conds.push(sql`COALESCE(a.n_ml, 0) > 0`);
  else if (f.rede === 'shopee') conds.push(sql`COALESCE(a.n_shopee, 0) > 0`);
  else if (f.rede === 'amazon') conds.push(sql`COALESCE(a.n_amazon, 0) > 0`);
  if (f.link === 'com') conds.push(sql`COALESCE(a.n_oficial, 0) > 0`);
  else if (f.link === 'sem') conds.push(sql`COALESCE(a.n_total, 0) > COALESCE(a.n_oficial, 0)`);
  const porId = o.afterId !== undefined;
  if (o.afterId) conds.push(sql`m.id > ${o.afterId}::uuid`);
  const where = sql.join(conds, sql` AND `);
  const order = ordenacao(f.sort, porId);
  const offset = o.offset ?? 0;

  const rows = await db.execute<Raw>(sql`
    WITH a AS (
      SELECT o.master_product_id,
             COUNT(*)::int AS n_total,
             COUNT(*) FILTER (WHERE n.slug = 'mercado-livre')::int AS n_ml,
             COUNT(*) FILTER (WHERE n.slug = 'shopee')::int AS n_shopee,
             COUNT(*) FILTER (WHERE n.slug = 'amazon')::int AS n_amazon,
             COUNT(*) FILTER (WHERE n.slug NOT IN ('mercado-livre', 'shopee', 'amazon'))::int AS n_outras,
             COUNT(*) FILTER (WHERE ${OFICIAL})::int AS n_oficial,
             MIN(o.current_price_cents) AS min_cents,
             MAX(o.last_checked_at) AS ultima
      FROM affiliate_offers o
      JOIN affiliate_networks n ON n.id = o.network_id
      JOIN master_products m ON m.id = o.master_product_id
      WHERE ${OFERTA_ATIVA} AND ${verticalSql('m', o.vertical)}
      GROUP BY o.master_product_id
    ),
    f AS (
      SELECT m.id, m.slug, m.vertical, m.name, ${MARCA} AS marca, ${MODELO} AS modelo, ${PLATAFORMA} AS plataforma, ${TIPO} AS tipo,
             ${CHAVE} AS chave, ${VEREDITO} AS status,
             COALESCE(a.n_ml, 0) AS n_ml, COALESCE(a.n_shopee, 0) AS n_shopee, COALESCE(a.n_amazon, 0) AS n_amazon,
             COALESCE(a.n_outras, 0) AS n_outras, COALESCE(a.n_total, 0) AS n_total, COALESCE(a.n_oficial, 0) AS n_oficial,
             a.min_cents, a.ultima,
             ROW_NUMBER() OVER (ORDER BY ${order}) AS rn, COUNT(*) OVER () AS total
      FROM master_products m
      LEFT JOIN brands b ON b.id = m.brand_id
      LEFT JOIN a ON a.master_product_id = m.id
      WHERE ${where}
    )
    SELECT p.*, ch.offer_id, ch.offer_slug, ch.offer_url, ch.rede_min, av.avg_cents, av.avg_day
    FROM (SELECT * FROM f WHERE rn > ${offset} AND rn <= ${offset + o.limit}) p
    LEFT JOIN LATERAL (
      SELECT o.id AS offer_id, o.slug AS offer_slug, o.affiliate_url AS offer_url, n.slug AS rede_min
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
      WHERE o.master_product_id = p.id AND ${OFERTA_ATIVA}
      ORDER BY o.current_price_cents ASC, o.id LIMIT 1
    ) ch ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.avg_cents, s.day AS avg_day FROM price_daily_state s
      WHERE s.master_product_id = p.id AND s.avg_cents IS NOT NULL ORDER BY s.day DESC LIMIT 1
    ) av ON TRUE
    ORDER BY p.rn`);

  const arr = [...rows];
  const linhas: CatalogoLinha[] = arr.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    vertical: String(r.vertical),
    nome: String(r.name),
    marca: (r.marca as string | null) ?? null,
    modelo: (r.modelo as string | null) ?? null,
    plataforma: (r.plataforma as string | null) ?? null,
    tipo: (r.tipo as string | null) ?? null,
    chave: (r.chave as string | null) ?? null,
    status: statusDoVeredito(r.status as string),
    ofertasMl: int(r.n_ml),
    ofertasShopee: int(r.n_shopee),
    ofertasAmazon: int(r.n_amazon),
    ofertasOutras: int(r.n_outras),
    ofertasTotal: int(r.n_total),
    ofertasOficiais: int(r.n_oficial),
    menorPrecoCents: num(r.min_cents),
    redeMenorPreco: (r.rede_min as string | null) ?? null,
    mediaCents: r.avg_cents == null ? null : Math.round(Number(r.avg_cents)),
    mediaDia: r.avg_day == null ? null : String(iso(r.avg_day)).slice(0, 10),
    ultimaColeta: iso(r.ultima),
    ofertaBaratoId: (r.offer_id as string | null) ?? null,
    ofertaBaratoSlug: (r.offer_slug as string | null) ?? null,
    ofertaBaratoUrl: (r.offer_url as string | null) ?? null,
  }));
  // Página além do fim: sem linhas para ler o total, relê a primeira linha só para obtê-lo.
  if (arr.length === 0 && offset > 0) return { linhas, total: (await carregarLinhas({ ...o, offset: 0, limit: 1 })).total };
  return { linhas, total: arr.length > 0 ? int(arr[0].total) : 0 };
}

/** Exportação completa de uma loja em blocos (paginação por id; cada bloco é uma consulta curta). */
export async function* iterarCatalogo(vertical: Vertical, filtros: OpcoesLista['filtros'] = {}, bloco = 1000): AsyncGenerator<CatalogoLinha[]> {
  let afterId: string | null = null;
  for (;;) {
    const { linhas }: ResultadoLista = await carregarLinhas({ vertical, filtros, limit: bloco, afterId });
    if (linhas.length === 0) return;
    yield linhas;
    afterId = linhas[linhas.length - 1].id;
    if (linhas.length < bloco) return;
  }
}

export { PAGE_SIZE };

// ---------------------------------------------------------------- histórico (snapshots)

/** Últimos `dias` dias da loja. Tabela ausente (migração 0040 ainda não aplicada) => lista vazia, nunca quebra a página. */
export async function carregarEvolucao(vertical: Vertical, dias = 14): Promise<SnapshotDia[]> {
  try {
    const rows = await db.execute<Raw>(sql`
      SELECT day, masters_approved, masters_review, masters_rejected, offers_active_ml, offers_active_shopee,
             offers_active_amazon, offers_active_other, offers_official, pct_official
      FROM catalog_inventory_snapshots WHERE vertical = ${vertical}
      ORDER BY day DESC LIMIT ${dias}`);
    return [...rows]
      .map((r) => ({
        day: String(iso(r.day)).slice(0, 10),
        mastersAprovados: int(r.masters_approved),
        mastersRevisao: int(r.masters_review),
        mastersRejeitados: int(r.masters_rejected),
        ofertasMl: int(r.offers_active_ml),
        ofertasShopee: int(r.offers_active_shopee),
        ofertasAmazon: int(r.offers_active_amazon),
        ofertasOutras: int(r.offers_active_other),
        ofertasOficiais: int(r.offers_official),
        pctOficial: num(r.pct_official),
      }))
      .reverse();
  } catch {
    return [];
  }
}

import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import type { ProductType } from '@/db/schema';
import { dimensionToProductType } from '@/lib/catalog/dimensions';
import { evaluateCatalogGate } from '@/lib/catalog/gate';

/**
 * Ponte entre a regra de dimensões (`src/lib/catalog/dimensions.ts`, regex por
 * título) e as consultas SQL públicas. A regra de título não existe em SQL,
 * então o catálogo inteiro (poucos milhares de masters: id, nome, tipo) é
 * classificado em TS, em cache, e só as EXCEÇÕES viram listas de ids:
 *   - hidden:  masters fora da cartela (merchandise, peça, outra vertical);
 *   - toType:  masters cujo tipo efetivo difere do gravado no banco.
 * As consultas anexam `catalogDimensionFilter(...)` ao WHERE. Só LEITURA: nada
 * é gravado; corrigir o dado é o plano de docs/segmentacao-catalogo-2026-10-31.md.
 */

export interface DimensionOverrides {
  hidden: string[];
  toType: Record<ProductType, string[]>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOverrides(): Promise<DimensionOverrides> {
  // Porteiro (src/lib/catalog/gate.ts): título do master + títulos das ofertas ativas +
  // mediana de preço + veredito/decisão humana gravados. Tudo em UMA consulta agregada.
  const rows = await db.execute<{
    id: string;
    name: string;
    product_type: ProductType;
    game_format: string | null;
    game_platform_gen: string | null;
    persisted: string | null;
    manual: string | null;
    titles: string[] | null;
    median_cents: string | number | null;
  }>(sql`
    WITH agg AS (
      SELECT o.master_product_id,
             array_agg(DISTINCT o.title) AS titles,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY o.current_price_cents) FILTER (WHERE o.current_price_cents > 0) AS median_cents
      FROM affiliate_offers o
      WHERE o.status = 'active'
      GROUP BY o.master_product_id
    )
    SELECT m.id, m.name, m.product_type, m.game_format, m.game_platform_gen,
           m.attributes -> 'catalogGate' ->> 'verdict' AS persisted,
           m.attributes -> 'catalogGate' ->> 'manual' AS manual,
           a.titles, a.median_cents
    FROM master_products m
    LEFT JOIN agg a ON a.master_product_id = m.id
    WHERE NOT (m.attributes ? 'mergedInto')
  `);
  const out: DimensionOverrides = { hidden: [], toType: { game: [], console: [], accessory: [] } };
  for (const r of rows) {
    const id = String(r.id);
    if (!UUID_RE.test(id)) continue;
    const dbType = r.product_type;
    const manual = r.manual === 'approved' || r.manual === 'rejected' ? r.manual : null;
    const gate = evaluateCatalogGate({
      name: String(r.name ?? ''),
      productType: dbType,
      gameFormat: r.game_format,
      gamePlatformGen: r.game_platform_gen,
      offerTitles: r.titles ?? [],
      medianPriceCents: r.median_cents == null ? null : Number(r.median_cents),
      manual,
    });
    // Veredito gravado 'review'/'rejected' (script de aplicação ou decisão humana) também esconde,
    // exceto quando há aprovação manual.
    const persistedHidden = (r.persisted === 'review' || r.persisted === 'rejected') && manual !== 'approved';
    // Veredito gravado já é filtrado em SQL (PERSISTED_HIDDEN abaixo): a lista de ids fica só com o que
    // ainda NÃO foi gravado (mestre novo), senão `<> ALL(ARRAY[...milhares])` estoura o statement_timeout.
    if (persistedHidden) continue;
    const effective = gate.verdict === 'approved' ? dimensionToProductType(gate.dimension) : null;
    if (effective === null) out.hidden.push(id);
    else if (effective !== dbType) out.toType[effective].push(id);
  }
  return out;
}

const overridesCached = createCachedQuery(loadOverrides, ['catalog-dimension-overrides-v4'], {
  revalidate: 300,
  tags: ['affiliate-offers'],
});

/** Exceções de dimensão do catálogo (cache de 5 min). */
export async function getDimensionOverrides(): Promise<DimensionOverrides> {
  return overridesCached();
}

/** `ARRAY['uuid',...]::uuid[]` (ids já validados como UUID; vazio vira array vazio tipado). */
function uuidArray(ids: string[]): SQL {
  const safe = ids.filter((i) => UUID_RE.test(i));
  return safe.length
    ? sql.raw(`ARRAY[${safe.map((i) => `'${i.toLowerCase()}'`).join(',')}]::uuid[]`)
    : sql.raw('ARRAY[]::uuid[]');
}

/**
 * Predicado de WHERE: o master só passa se estiver na cartela pública.
 *  - sem `type`: qualquer aba pública (esconde só os fora da cartela);
 *  - com `type`: exatamente a aba pedida (tipo EFETIVO = tipo pedido).
 * `idCol`/`typeCol` são fragmentos de coluna, ex.: `sql\`mp.id\``, `sql\`${masterProducts.id}\``.
 */
export async function catalogDimensionFilter(opts: { idCol: SQL; typeCol: SQL; type?: ProductType }): Promise<SQL> {
  const o = await getDimensionOverrides();
  const { idCol, typeCol, type } = opts;
  // Porteiro (gate.ts): masters com veredito gravado 'review'/'rejected' nunca passam.
  const gateOk = sql`${idCol} NOT IN (${PERSISTED_HIDDEN})`;
  if (!type) return sql`(${idCol} <> ALL(${uuidArray(o.hidden)}) AND ${gateOk})`;
  const moved = [...o.hidden, ...o.toType.game, ...o.toType.console, ...o.toType.accessory];
  return sql`(((${typeCol} = ${type} AND ${idCol} <> ALL(${uuidArray(moved)})) OR ${idCol} = ANY(${uuidArray(o.toType[type])})) AND ${gateOk})`;
}

/** Subconsulta: masters com veredito gravado não aprovado (em revisão ou rejeitado). */
const PERSISTED_HIDDEN = sql`SELECT pg.id FROM master_products pg WHERE pg.attributes -> 'catalogGate' ->> 'verdict' IN ('review', 'rejected')`;

/** Só a parte "esconder" (para contadores sobre `public_offers`, sem tipo). */
export async function catalogHiddenFilter(idCol: SQL): Promise<SQL> {
  return catalogDimensionFilter({ idCol, typeCol: sql`NULL` });
}

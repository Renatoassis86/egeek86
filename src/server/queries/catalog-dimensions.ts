import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCachedQuery } from '@/lib/cache/server-cache';
import type { ProductType } from '@/db/schema';
import { classifyCatalogItem, dimensionToProductType } from '@/lib/catalog/dimensions';

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
  const rows = await db.execute<{ id: string; name: string; product_type: ProductType }>(sql`
    SELECT m.id, m.name, m.product_type
    FROM master_products m
    WHERE NOT (m.attributes ? 'mergedInto')
  `);
  const out: DimensionOverrides = { hidden: [], toType: { game: [], console: [], accessory: [] } };
  for (const r of rows) {
    const id = String(r.id);
    if (!UUID_RE.test(id)) continue;
    const dbType = r.product_type;
    const effective = dimensionToProductType(classifyCatalogItem(String(r.name ?? ''), dbType).dimension);
    if (effective === null) out.hidden.push(id);
    else if (effective !== dbType) out.toType[effective].push(id);
  }
  return out;
}

const overridesCached = createCachedQuery(loadOverrides, ['catalog-dimension-overrides-v1'], {
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
  if (!type) return sql`(${idCol} <> ALL(${uuidArray(o.hidden)}))`;
  const moved = [...o.hidden, ...o.toType.game, ...o.toType.console, ...o.toType.accessory];
  return sql`((${typeCol} = ${type} AND ${idCol} <> ALL(${uuidArray(moved)})) OR ${idCol} = ANY(${uuidArray(o.toType[type])}))`;
}

/** Só a parte "esconder" (para contadores sobre `public_offers`, sem tipo). */
export async function catalogHiddenFilter(idCol: SQL): Promise<SQL> {
  return catalogDimensionFilter({ idCol, typeCol: sql`NULL` });
}

/**
 * Auditoria de segmentacao do catalogo por dimensao (SOMENTE LEITURA).
 * Uso: npx tsx --env-file=.env.local --conditions=react-server scripts/audit-segmentacao.ts [saida.json]
 *
 * - Conta masters por tipo gravado x dimensao efetiva (regra de titulo de
 *   src/lib/catalog/dimensions.ts), total e so com oferta publica (ADR 0002).
 * - Valida o predicado SQL (catalogDimensionFilter) contra a contagem em TS.
 * - Roda buscas reais (searchProductsUncached) e lista o que cada aba mostra.
 * Nao escreve no banco (transacao READ ONLY nas consultas brutas). Nao imprime credenciais.
 */
import fs from 'node:fs';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { classifyCatalogItem, type CatalogDimension } from '../src/lib/catalog/dimensions';
import type { ProductType } from '../src/db/schema';

interface Row {
  id: string;
  name: string;
  t: ProductType;
  p: string;
  pub_offers: number;
  minp: number | null;
  merged: boolean;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  const pg = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });

  const rows = await pg.begin('read only', async (tx) =>
    tx<Row[]>`
      WITH live_networks AS (
        SELECT DISTINCT lo.network_id FROM affiliate_offers lo
        WHERE lo.created_at < now() - interval '7 days' AND lo.last_price_change_at >= now() - interval '7 days'),
      fresh AS (
        SELECT fo.id, fo.master_product_id, fo.current_price_cents FROM affiliate_offers fo
        WHERE fo.status = 'active' AND fo.current_price_cents > 0 AND fo.last_checked_at >= now() - interval '7 days'
          AND (COALESCE(fo.last_price_change_at, fo.created_at) >= now() - interval '7 days'
               OR fo.network_id IN (SELECT network_id FROM live_networks))),
      pm AS (SELECT master_product_id, COUNT(*)::int n, percentile_cont(0.5) WITHIN GROUP (ORDER BY current_price_cents) med FROM fresh GROUP BY 1),
      pub AS (SELECT f.master_product_id mid, COUNT(*)::int offers, MIN(f.current_price_cents) minp
              FROM fresh f JOIN pm ON pm.master_product_id = f.master_product_id
              WHERE pm.n < 3 OR f.current_price_cents >= pm.med * 0.35 GROUP BY 1)
      SELECT m.id, m.name, m.product_type::text AS t, m.game_platform_gen::text AS p,
             COALESCE(pub.offers, 0)::int AS pub_offers, pub.minp::int AS minp, (m.attributes ? 'mergedInto') AS merged
      FROM master_products m LEFT JOIN pub ON pub.mid = m.id`
  );
  const live = rows.filter((r) => !r.merged);

  type Cell = { total: number; pub: number };
  const matrix: Record<string, Cell> = {};
  const samples: Record<string, Array<{ id: string; name: string; why: string; pub: number; minp: number | null }>> = {};
  const effPub: Record<string, number> = {};
  const dbPub: Record<string, number> = {};
  const effAll: Record<string, number> = {};
  const dbAll: Record<string, number> = {};
  const updates: Array<{ id: string; from: string; to: string; reason: string; name: string; pub: number }> = [];

  for (const r of live) {
    const c = classifyCatalogItem(r.name, r.t);
    const key = `${r.t}>${c.dimension}`;
    (matrix[key] ||= { total: 0, pub: 0 }).total++;
    if (r.pub_offers > 0) matrix[key].pub++;
    dbAll[r.t] = (dbAll[r.t] ?? 0) + 1;
    effAll[c.dimension] = (effAll[c.dimension] ?? 0) + 1;
    if (r.pub_offers > 0) {
      dbPub[r.t] = (dbPub[r.t] ?? 0) + 1;
      effPub[c.dimension] = (effPub[c.dimension] ?? 0) + 1;
    }
    if (c.dimension !== r.t) {
      (samples[key] ||= []).push({ id: r.id, name: r.name, why: `${c.reason}:${c.matched}`, pub: r.pub_offers, minp: r.minp });
      updates.push({ id: r.id, from: r.t, to: c.dimension, reason: `${c.reason}:${c.matched}`, name: r.name, pub: r.pub_offers });
    }
  }

  // --- Valida predicado SQL contra TS (usa o codigo real das consultas) ---
  const { db } = await import('../src/lib/db');
  const { catalogDimensionFilter } = await import('../src/server/queries/catalog-dimensions');
  const sqlCheck: Record<string, { sql: number; ts: number }> = {};
  for (const type of ['game', 'console', 'accessory'] as ProductType[]) {
    const f = await catalogDimensionFilter({ idCol: sql`m.id`, typeCol: sql`m.product_type`, type });
    const res = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM master_products m WHERE NOT (m.attributes ? 'mergedInto') AND ${f}`);
    sqlCheck[type] = { sql: Number(res[0].n), ts: effAll[type] ?? 0 };
  }
  const fAny = await catalogDimensionFilter({ idCol: sql`m.id`, typeCol: sql`m.product_type` });
  const anyRes = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM master_products m WHERE NOT (m.attributes ? 'mergedInto') AND ${fAny}`);
  sqlCheck['(qualquer aba publica)'] = {
    sql: Number(anyRes[0].n),
    ts: (effAll.game ?? 0) + (effAll.console ?? 0) + (effAll.accessory ?? 0),
  };

  // --- Buscas reais ---
  const { searchProductsUncached, suggestProducts } = await import('../src/server/queries/search-products');
  const { getHomeSearchData } = await import('../src/server/queries/home-search');
  const terms = ['zelda', 'switch', 'controle', 'resident evil', 'mario kart', 'ps5', 'xbox'];
  const searches: Array<Record<string, unknown>> = [];
  for (const term of terms) {
    for (const type of ['game', 'console', 'accessory'] as ProductType[]) {
      const r = await searchProductsUncached({ term, type, pageSize: 12 });
      searches.push({
        term,
        type,
        total: r.total,
        facets: r.facets.types,
        top: r.items.map((i) => `${i.productType}|${i.platform}|${i.rawName.slice(0, 80)}`),
      });
    }
    const sug = await suggestProducts(term, 8);
    searches.push({ term, type: 'autocomplete', total: sug.length, top: sug.map((s) => `${s.productType}|${s.title.slice(0, 80)}`) });
  }
  const home = await getHomeSearchData();

  await pg.end();
  const out = { total: live.length, matrix, dbAll, effAll, dbPub, effPub, sqlCheck, samples, home, searches, updates };
  fs.writeFileSync(process.argv[2] ?? 'audit-segmentacao.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ total: live.length, dbAll, effAll, dbPub, effPub, sqlCheck, home: home.totals, homePlatforms: home.platforms }, null, 1));
}

main().catch((e) => {
  console.error('FALHA', e instanceof Error ? e.message : e);
  process.exit(1);
});

export type { CatalogDimension };

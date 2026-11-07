/**
 * SOMENTE LEITURA (READ ONLY). Lista os masters ML com 2+ catalogos (definicao E: vendedor, active, fora de quarentena)
 * para a triagem em bloco (ata 2026-11-06, decisao 5). Grava CSV em docs/. Nada e escrito no banco.
 *   npx tsx --env-file=.env.local scripts/listar-masters-multicatalogo.ts
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      const rows = await tx`
        SELECT o.master_product_id::text AS mid, m.name AS nome, o.external_ref AS cat, o.seller_id::text AS seller,
               o.current_price_cents::bigint AS preco
        FROM affiliate_offers o
        JOIN affiliate_networks nw ON nw.id = o.network_id AND nw.slug = 'mercado-livre'
        JOIN master_products m ON m.id = o.master_product_id
        WHERE o.external_ref IS NOT NULL AND o.seller_id IS NOT NULL AND o.status = 'active' AND o.quarantined_at IS NULL
          AND o.master_product_id IN (
            SELECT o2.master_product_id FROM affiliate_offers o2
            JOIN affiliate_networks n2 ON n2.id = o2.network_id AND n2.slug = 'mercado-livre'
            WHERE o2.external_ref IS NOT NULL AND o2.seller_id IS NOT NULL AND o2.status = 'active' AND o2.quarantined_at IS NULL
            GROUP BY 1 HAVING count(DISTINCT o2.external_ref) >= 2)`;
      const by = new Map<string, { nome: string; cats: Map<string, number[]>; sellers: Map<string, Set<string>> }>();
      for (const r of rows) {
        const g = by.get(r.mid) ?? { nome: String(r.nome), cats: new Map(), sellers: new Map() };
        (g.cats.get(r.cat) ?? g.cats.set(r.cat, []).get(r.cat)!).push(Number(r.preco));
        (g.sellers.get(r.seller) ?? g.sellers.set(r.seller, new Set()).get(r.seller)!).add(r.cat);
        by.set(r.mid, g);
      }
      const med = (v: number[]) => { const x = [...v].sort((p, q) => p - q); const m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
      const out = [...by.entries()].map(([mid, g]) => {
        const catRows: string[] = [];
        let outliers = 0;
        for (const [cat, prices] of g.cats) {
          const outros = [...g.cats.entries()].filter(([c]) => c !== cat).flatMap(([, p]) => p);
          const ref = med(outros);
          const mn = Math.min(...prices);
          const out = prices.length <= 2 && ref > 0 && (mn > 2 * ref || mn < 0.5 * ref);
          if (out) outliers++;
          catRows.push(cat + ':' + prices.length + 'of:R$' + (mn / 100).toFixed(2) + (out ? ':OUTLIER' : ''));
        }
        const sellersEmVarios = [...g.sellers.values()].filter((s) => s.size >= 2).length;
        const sugestao = outliers > 0 ? 'OUTLIER DE PRECO: catalogo com <=2 ofertas fora de 0,5x-2x da mediana dos outros (checar anuncio, nao identidade)' : sellersEmVarios > 0 ? 'CONSOLIDAR: mesmo vendedor em 2+ catalogos' : 'CONSOLIDAR: catalogos paralelos coerentes';
        return { mid, nome: g.nome, catalogos: g.cats.size, ofertas: [...g.cats.values()].flat().length, vendedores_em_2plus_catalogos: sellersEmVarios, outliers, detalhe: catRows.join(' | '), sugestao };
      }).sort((x, y) => y.outliers - x.outliers);
      const cols = Object.keys(out[0]);
      const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
      fs.writeFileSync('docs/triagem-masters-multicatalogo-v2-2026-11-06.csv', '﻿' + [cols.join(';'), ...out.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(';'))].join('\n') + '\n');
      const cnt = (t: string) => out.filter((r) => r.sugestao.startsWith(t)).length;
      console.log({ masters: out.length, outlier_de_preco: cnt('OUTLIER'), consolidar_coerente: cnt('CONSOLIDAR: catalogos'), consolidar_mesmo_vendedor: cnt('CONSOLIDAR: mesmo') });
      console.table(out.slice(0, 10).map((r) => ({ id: r.mid.slice(0, 8), nome: r.nome.slice(0, 38), cat: r.catalogos, out: r.outliers })));
    });
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

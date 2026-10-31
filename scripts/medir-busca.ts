/**
 * Medicao do motor de busca (SOMENTE LEITURA). Uso:
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/medir-busca.ts [saida.json]
 * Nao imprime credenciais. Busca: versao sem cache; mede tempo de parede
 * (inclui a ida e volta ate o banco a partir da maquina que roda).
 * Autocomplete: mede o indice em memoria (frio, recarga, quente, apos TTL).
 */
import fs from 'node:fs';
import {
  getSearchInsightsUncached,
  reloadSuggestIndexFromDatabaseForMeasurement,
  resetSuggestIndexForMeasurement,
  searchProductsUncached,
  suggestProducts,
  type SearchProductsParams,
} from '../src/server/queries/search-products';

const CASES: SearchProductsParams[] = [
  { term: 'resident evil village ps5' },
  { term: 'mario kart 8' },
  { term: 'mario kart 7' },
  { term: 'zelda' },
  { term: 'god of war' },
  { term: 'god of war ragnarok ps5' },
  { term: 'fifa' },
  { term: 'fc 25' },
  { term: 'xyz123' },
  { term: 'ps5' },
  { term: 'controle' },
  { term: 'controle', type: 'accessory' },
  { term: 'gta v' },
  { term: 'pokemon' },
  { term: 'super mario' },
  { term: 'call of duty' },
  { term: 'final fantasy 7' },
  { term: 'the last of us' },
  { term: 'elden ring' },
  { term: 'spider man' },
  { term: 'zelsa' },
  { term: 'resident evl vilage' },
  { term: 'console ps5', type: 'console' },
  { term: 'xbox series x', type: 'console' },
  { term: 'switch 2' },
  { term: 'mario', sort: 'price_asc' },
  { term: 'mario', sort: 'discount' },
  { term: 'zelda', sort: 'stores' },
  { term: 'zelda', store: 'mercado-livre', minPriceCents: 10000, maxPriceCents: 30000 },
  { term: 'zelda', condition: 'used' },
];

const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];

async function main() {
  const onlySuggest = process.argv.includes('--so-autocomplete');
  const out: unknown[] = [];
  if (!onlySuggest) {
    for (const p of CASES) {
      const t0 = Date.now();
      const r = await searchProductsUncached({ pageSize: 10, ...p });
      const ms = Date.now() - t0;
      console.log(`\n=== ${JSON.stringify(p)}  ${ms} ms  total=${r.total} reason=${r.emptyReason} plat=${r.appliedPlatform} types=${JSON.stringify(r.facets.types)} dym=${JSON.stringify(r.didYouMean)}`);
      const t1 = Date.now();
      const ins = p.sort === 'discount' ? null : await getSearchInsightsUncached(r.items.map((i) => i.masterProductId));
      const msIns = ins ? Date.now() - t1 : 0;
      if (ins) console.log(`  insights ${r.items.length} itens: ${msIns} ms`);
      for (const it of r.items.slice(0, 10)) {
        const x = it.insights ?? ins?.[it.masterProductId] ?? null;
        console.log(
          `  [${it.relevance.toFixed(2)}] ${it.title} | ${it.platformLabel} | R$ ${(it.lowestPriceCents / 100).toFixed(2)} ${it.lowestStoreName} | ${it.storeCount} lojas/${it.offerCount} ofertas | ` +
            (x
              ? x.verdict + (x.avgPriceCents ? ' media ' + (x.avgPriceCents / 100).toFixed(2) : '') + (x.lowestEverBadge ? ' MENOR' : '') + (x.priceFalling ? ' QUEDA' : '') +
                (x.historicLow ? ' histMin ' + (x.historicLow.priceCents / 100).toFixed(2) + (x.historicLow.floorReplacedRaw ? '(piso)' : '') : '')
              : 'sem insights') +
            ` | url=${it.outboundUrl ? 'sim' : 'nao'} aff=${it.isAffiliateLink}`
        );
      }
      out.push({ params: p, ms, msIns, total: r.total, reason: r.emptyReason, dym: r.didYouMean, titles: r.items.map((i) => `${i.title} [${i.platformLabel}]`) });
    }
  }

  console.log('\n##### AUTOCOMPLETE (indice em memoria)');
  const TERMS = ['resi', 'resident evil v', 'resident evil ps5', 'resident evil ps4', 'mario k', 'mario kart 8', 'zel', 'god of', 'god of war ps4', 'fif', 'xyz', 'contr', 'pok', 'gta', 'final fantasy vii', 'zelsa'];

  // 1) frio: processo sem indice
  resetSuggestIndexForMeasurement();
  let t0 = Date.now();
  await suggestProducts('zel', 8);
  const coldFirst = Date.now() - t0;
  console.log(`1a chamada a frio (carrega o indice): ${coldFirst} ms`);

  // 2) carga direta do banco, repetida (custo da recarga em segundo plano)
  const loads: number[] = [];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    t0 = Date.now();
    n = await reloadSuggestIndexFromDatabaseForMeasurement();
    loads.push(Date.now() - t0);
  }
  console.log(`recarga do banco (${n} produtos): ${loads.join(', ')} ms`);

  // 3) quente: cada termo 30 vezes
  const hot: number[] = [];
  for (const term of TERMS) {
    const times: number[] = [];
    let res: Awaited<ReturnType<typeof suggestProducts>> = [];
    for (let i = 0; i < 30; i++) {
      const a0 = process.hrtime.bigint();
      res = await suggestProducts(term, 8);
      times.push(Number(process.hrtime.bigint() - a0) / 1e6);
    }
    hot.push(...times);
    console.log(`'${term}' mediana ${pct(times, 0.5).toFixed(2)} ms, p95 ${pct(times, 0.95).toFixed(2)} ms, max ${Math.max(...times).toFixed(2)} ms -> ${res.map((x) => `${x.title} [${x.platformLabel}]`).join(' ; ').slice(0, 230)}`);
  }
  console.log(`QUENTE geral (${hot.length} chamadas): mediana ${pct(hot, 0.5).toFixed(2)} ms, p95 ${pct(hot, 0.95).toFixed(2)} ms, max ${Math.max(...hot).toFixed(2)} ms`);

  // 4) stale-while-revalidate: avanca o relogio alem do TTL; a chamada deve responder na hora e recarregar por baixo
  const realNow = Date.now;
  Date.now = () => realNow() + 200_000;
  t0 = realNow();
  const stale = await suggestProducts('zel', 8);
  const staleMs = realNow() - t0;
  Date.now = realNow;
  await new Promise((r) => setTimeout(r, 2500)); // deixa a recarga terminar
  t0 = Date.now();
  await suggestProducts('zel', 8);
  console.log(`apos TTL: resposta ${staleMs} ms com ${stale.length} itens (indice velho); chamada seguinte ${Date.now() - t0} ms`);

  if (process.argv[2] && !process.argv[2].startsWith('--')) fs.writeFileSync(process.argv[2], JSON.stringify({ search: out, suggest: { coldFirst, loads, hotMedian: pct(hot, 0.5), hotP95: pct(hot, 0.95), staleMs } }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 500)); process.exit(1); });

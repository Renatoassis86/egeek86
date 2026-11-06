/**
 * Testes da coleta por (rede, master) do Mercado Livre (ata 2026-11-06, decisao 1). Sem banco, sem API real, sem rede.
 * Escritos ANTES do codigo (src/lib/affiliate/master-consolidation.ts e master-grouping-config.ts).
 *
 * Uso: npx tsx scripts/test-collector-multicatalog.ts   (codigo 1 se falhar)
 *
 * Fixtures:
 *  - RE3 (master 6813e83f): vendedor A2ZGAMESINCBRF (3003302367) com 3 anuncios em 3 catalogos, valores e ids REAIS da
 *    consulta oficial de 2026-11-06 (ata): 188,76 / 190,02 / 192,12.
 *  - Demais casos: entradas ESTRUTURAIS de teste (nao sao dado de plataforma, nada vai a banco ou a tela). O que importa
 *    ali e a relacao entre os valores (menor, igual, ausente), nao o valor em si.
 */
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/lib/concurrency';
import { pickCatalogPlaceholder } from '../src/lib/affiliate/catalog-placeholder';
import fs from 'node:fs';
import {
  CatalogPagingError,
  fetchCatalogAllPages,
  parseMeliCatalogPage,
  withExemptRetry,
  sanitizeErrorForSummary,
  type CatalogPage,
  collapseBySeller,
  consolidateMasterResults,
  createCallBudget,
  createCatalogFetcher,
  decideMasterExpiry,
  fetchMasterCatalogs,
  groupDueOffers,
  masterCallCap,
  type CatalogOutcome,
  type Listing,
} from '../src/lib/affiliate/master-consolidation';
import { getMasterGroupingScope, shouldGroupByMaster } from '../src/lib/affiliate/master-grouping-config';

let n = 0;
const pending: Promise<void>[] = [];
const t = (name: string, fn: () => void | Promise<void>) => {
  const r = fn();
  if (r instanceof Promise) {
    pending.push(r.then(() => { n++; console.log('ok -', name); }));
  } else {
    n++;
    console.log('ok -', name);
  }
};

const L = (seller: string, item: string, priceCents: number, extra: Partial<Listing> = {}): Listing => ({
  externalSellerId: seller, externalItemId: item, priceCents, listPriceCents: null, ...extra,
});
const ok = (externalRef: string, results: Listing[]): CatalogOutcome => ({ externalRef, status: 'ok', results });
const noVerdicts = new Map<string, { excluded: boolean }>();
const ser = (c: { bestByCatalog: Map<string, unknown> }) => JSON.stringify({ ...c, bestByCatalog: [...c.bestByCatalog.entries()] });

// ---- RE3 real (ata 2026-11-06) ----
const A2Z = '3003302367';
const RE3_CATALOGS = [
  ok('MLB46308238', [L(A2Z, 'MLB5957823202', 18876), L('s-outro-1', 'MLB1001', 19900)]),
  ok('MLB46286520', [L(A2Z, 'MLB5957931472', 19002), L('s-outro-2', 'MLB1002', 21990)]),
  ok('MLB45004754', [L(A2Z, 'MLB5957852488', 19212), L('s-outro-1', 'MLB1003', 20500)]),
];

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

// =============== 1. consolidacao: um vendedor, um preco (o menor) ===============
t('RE3 real: A2Z em 3 catalogos -> UMA oferta a R$ 188,76 (o menor anuncio)', () => {
  const c = consolidateMasterResults(RE3_CATALOGS, noVerdicts);
  assert.equal(c.complete, true);
  const a2z = c.sellers.filter((s) => s.externalSellerId === A2Z);
  assert.equal(a2z.length, 1);
  assert.equal(a2z[0].priceCents, 18876);
  assert.equal(a2z[0].externalItemId, 'MLB5957823202');
  assert.equal(a2z[0].catalogRef, 'MLB46308238');
});

t('RE3 real: saida invariante a ordem dos catalogos E dos itens (todas as permutacoes)', () => {
  const base = ser(consolidateMasterResults(RE3_CATALOGS, noVerdicts));
  for (const perm of permutations(RE3_CATALOGS)) {
    assert.equal(ser(consolidateMasterResults(perm, noVerdicts)), base);
    const rev = perm.map((c) => ({ ...c, results: [...c.results].reverse() }));
    assert.equal(ser(consolidateMasterResults(rev, noVerdicts)), base);
  }
});

t('RE3 real: um preco por vendedor (sem vendedor repetido), vendedores distintos preservados', () => {
  const c = consolidateMasterResults(RE3_CATALOGS, noVerdicts);
  const ids = c.sellers.map((s) => s.externalSellerId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [A2Z, 's-outro-1', 's-outro-2'].sort());
  assert.equal(c.sellers.find((s) => s.externalSellerId === 's-outro-1')!.priceCents, 19900); // menor entre 19900 e 20500
});

t('Celeste (estrutura): 2 catalogos, mesmo vendedor, precos diferentes -> o menor; ordem nao importa', () => {
  const a = ok('MLB-A', [L('v1', 'MLB-1', 21988)]);
  const b = ok('MLB-B', [L('v1', 'MLB-2', 20888)]);
  for (const perm of permutations([a, b])) {
    const c = consolidateMasterResults(perm, noVerdicts);
    assert.equal(c.sellers.length, 1);
    assert.equal(c.sellers[0].priceCents, 20888);
  }
});

t('vendedor presente em apenas um catalogo -> entra com o preco desse catalogo', () => {
  const c = consolidateMasterResults([ok('A', [L('v1', 'i1', 10000)]), ok('B', [L('v2', 'i2', 12000)])], noVerdicts);
  assert.deepEqual(c.sellers.map((s) => [s.externalSellerId, s.priceCents]), [['v1', 10000], ['v2', 12000]]);
});

t('empate de preco: desempata pelo item id (deterministico), nao pela ordem de chegada', () => {
  const a = ok('A', [L('v1', 'MLB-9', 5000)]);
  const b = ok('B', [L('v1', 'MLB-2', 5000)]);
  for (const perm of permutations([a, b])) {
    assert.equal(consolidateMasterResults(perm, noVerdicts).sellers[0].externalItemId, 'MLB-2');
  }
});

t('mesmo item id nos dois catalogos: 1 resultado, catalogRef deterministico (menor ref)', () => {
  const a = ok('B', [L('v1', 'MLB-7', 5000)]);
  const b = ok('A', [L('v1', 'MLB-7', 5000)]);
  for (const perm of permutations([a, b])) {
    const s = consolidateMasterResults(perm, noVerdicts).sellers;
    assert.equal(s.length, 1);
    assert.equal(s[0].catalogRef, 'A');
  }
});

t('nenhum preco e inventado: todo preco de saida existe na entrada, com o mesmo item e lista', () => {
  const input = [ok('A', [L('v1', 'i1', 10000, { listPriceCents: 12000 })]), ok('B', [L('v1', 'i2', 9000, { listPriceCents: null })])];
  const s = consolidateMasterResults(input, noVerdicts).sellers[0];
  const src = input.flatMap((c) => c.results).find((r) => r.externalItemId === s.externalItemId)!;
  assert.equal(s.priceCents, src.priceCents);
  assert.equal(s.listPriceCents, src.listPriceCents);
});

t('catalogo unico: saida identica a do coletor atual (collapseBySeller), so ordenada por vendedor', () => {
  const results = [L('v2', 'i3', 9000), L('v1', 'i1', 8000), L('v1', 'i2', 7000), L('v3', 'i4', 6000)];
  const legacy = collapseBySeller(results, noVerdicts as never).map((r) => [r.externalSellerId, r.externalItemId, r.priceCents]).sort();
  const master = consolidateMasterResults([ok('A', results)], noVerdicts).sellers.map((r) => [r.externalSellerId, r.externalItemId, r.priceCents]).sort();
  assert.deepEqual(master, legacy);
});

// =============== 2. identidade (Open Box nunca representa o vendedor) ===============
t('anuncio Open Box (identidade excluida) nunca representa o vendedor se ele tem outro anuncio idoneo, mesmo mais caro e em outro catalogo', () => {
  const verdicts = new Map([['openbox', { excluded: true }]]);
  const c = consolidateMasterResults([ok('A', [L('v1', 'openbox', 5000)]), ok('B', [L('v1', 'normal', 9000)])], verdicts);
  assert.equal(c.sellers.length, 1);
  assert.equal(c.sellers[0].externalItemId, 'normal');
  assert.equal(c.sellers[0].priceCents, 9000);
});

t('vendedor so com anuncio excluido: sai com o excluido (o coletor liga como draft, igual hoje)', () => {
  const verdicts = new Map([['openbox', { excluded: true }]]);
  const c = consolidateMasterResults([ok('A', [L('v1', 'openbox', 5000)])], verdicts);
  assert.equal(c.sellers[0].externalItemId, 'openbox');
});

// =============== 3. placeholder por catalogo ===============
t('placeholder: cada catalogo recebe o melhor preco do SEU catalogo, nao o minimo global', () => {
  const c = consolidateMasterResults(RE3_CATALOGS, noVerdicts);
  assert.equal(c.bestByCatalog.get('MLB46308238')!.priceCents, 18876);
  assert.equal(c.bestByCatalog.get('MLB46286520')!.priceCents, 19002 < 21990 ? 19002 : 21990);
  assert.equal(c.bestByCatalog.get('MLB45004754')!.priceCents, 19212 < 20500 ? 19212 : 20500);
});

t('placeholder: anuncio excluido nao vira melhor preco; catalogo so com excluidos fica sem entrada', () => {
  const verdicts = new Map([['ob', { excluded: true }]]);
  const c = consolidateMasterResults([ok('A', [L('v1', 'ob', 1000), L('v2', 'good', 8000)]), ok('B', [L('v3', 'ob', 900)])], verdicts);
  assert.equal(c.bestByCatalog.get('A')!.priceCents, 8000);
  assert.equal(c.bestByCatalog.has('B'), false);
});

t('placeholder + pickCatalogPlaceholder: master com 3 catalogos e 1 placeholder -> so o dono grava (correcao de 05/11 preservada)', () => {
  const c = consolidateMasterResults(RE3_CATALOGS, noVerdicts);
  const candidates = [{ id: 'ph-A', externalRef: 'MLB46308238' }];
  const writes = [...c.bestByCatalog.keys()].map((ref) => pickCatalogPlaceholder(candidates, ref)?.id).filter(Boolean);
  assert.deepEqual(writes, ['ph-A']);
});

t('catalogo respondeu OK e vazio: aparece em emptyCatalogs (placeholder dele conta falta), sem bestByCatalog', () => {
  const c = consolidateMasterResults([ok('A', []), ok('B', [L('v1', 'i1', 5000)])], noVerdicts);
  assert.deepEqual(c.emptyCatalogs, ['A']);
  assert.equal(c.bestByCatalog.has('A'), false);
  assert.equal(c.unionSize, 1);
});

// =============== 4. falha parcial: tudo ou nada ===============
const failing = (externalRef: string): CatalogOutcome => ({ externalRef, status: 'failed', error: 'HTTP 429', results: [] });

t('falha parcial: 1 catalogo falhou e outro respondeu -> complete=false, NENHUM preco, NENHUMA expiracao', () => {
  const c = consolidateMasterResults([ok('A', [L('v1', 'i1', 5000)]), failing('B')], noVerdicts);
  assert.equal(c.complete, false);
  assert.deepEqual(c.sellers, []);
  assert.equal(c.bestByCatalog.size, 0);
  const d = decideMasterExpiry({ complete: c.complete, unionSize: 1, offers: [{ id: 'o1', isPlaceholder: false }], updatedOfferIds: new Set(), sellerUpsertFailed: false });
  assert.deepEqual(d, { action: 'none', expireIds: [], missIds: [] });
});

t('falha parcial com catalogo "skipped" (parou apos falha) tambem e incompleta', () => {
  const c = consolidateMasterResults([ok('A', []), { externalRef: 'B', status: 'skipped', results: [] }], noVerdicts);
  assert.equal(c.complete, false);
});

t('fetchMasterCatalogs: falha persistente (apos 1 retry) para de chamar os demais (economia de cota) e marca complete=false', async () => {
  const calls: string[] = [];
  const r = await fetchMasterCatalogs(['A', 'B', 'C'], async (ref) => {
    calls.push(ref);
    if (ref === 'B') throw new Error('timeout');
    return [L('v', 'i-' + ref, 100)];
  }, { retries: 1 });
  assert.equal(r.complete, false);
  assert.deepEqual(calls, ['A', 'B', 'B']); // B tentado 2x, C nunca
  assert.deepEqual(r.outcomes.map((o) => o.status), ['ok', 'failed', 'skipped']);
  assert.equal(r.attempts, 3);
  assert.match(r.outcomes[1].error ?? '', /timeout/);
});

t('fetchMasterCatalogs: falha transitoria resolvida no retry -> completo, attempts conta o retry', async () => {
  let k = 0;
  const r = await fetchMasterCatalogs(['A', 'B'], async (ref) => {
    if (ref === 'A' && k++ === 0) throw new Error('429');
    return [L('v', 'i-' + ref, 100)];
  }, { retries: 1 });
  assert.equal(r.complete, true);
  assert.equal(r.attempts, 3);
});

t('fetchMasterCatalogs: busca em SEQUENCIA e em ordem estavel (ordenada), mesmo recebendo refs embaralhadas', async () => {
  const order: string[] = [];
  let running = 0, maxRunning = 0;
  await fetchMasterCatalogs(['C', 'A', 'B', 'A'], async (ref) => {
    running++; maxRunning = Math.max(maxRunning, running);
    order.push(ref);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    return [];
  });
  assert.deepEqual(order, ['A', 'B', 'C']); // dedup + ordenado
  assert.equal(maxRunning, 1);
});

// =============== 5. expiracao ===============
const offers = [
  { id: 'sellerA', isPlaceholder: false },
  { id: 'sellerB', isPlaceholder: false },
  { id: 'ph', isPlaceholder: true },
];

t('vendedor SOME de um catalogo mas continua em outro -> NAO expira (esta na uniao)', () => {
  // o coletor marca como atualizada toda oferta cujo vendedor aparece em QUALQUER catalogo
  const c = consolidateMasterResults([ok('A', []), ok('B', [L('sellerA-ext', 'i1', 5000), L('sellerB-ext', 'i2', 6000)])], noVerdicts);
  assert.equal(c.sellers.length, 2);
  const d = decideMasterExpiry({ complete: c.complete, unionSize: c.unionSize, offers, updatedOfferIds: new Set(['sellerA', 'sellerB']), sellerUpsertFailed: false });
  assert.deepEqual(d.expireIds, []);
});

t('vendedor some de TODOS os catalogos (outros continuam) -> expira, imediato; placeholder nunca expira por aqui', () => {
  const d = decideMasterExpiry({ complete: true, unionSize: 1, offers, updatedOfferIds: new Set(['sellerA']), sellerUpsertFailed: false });
  assert.equal(d.action, 'expire');
  assert.deepEqual(d.expireIds, ['sellerB']);
  assert.deepEqual(d.missIds, []);
});

t('uniao vazia (todos os catalogos OK e vazios) -> contador de faltas em TODAS as ofertas (igual ao coletor atual), nada expira na hora', () => {
  const d = decideMasterExpiry({ complete: true, unionSize: 0, offers, updatedOfferIds: new Set(), sellerUpsertFailed: false });
  assert.equal(d.action, 'miss');
  assert.deepEqual(d.expireIds, []);
  assert.deepEqual(d.missIds.sort(), ['ph', 'sellerA', 'sellerB']);
});

t('falha ao gravar vendedor (upsert) no ciclo -> nao expira ninguem (conservador)', () => {
  const d = decideMasterExpiry({ complete: true, unionSize: 1, offers, updatedOfferIds: new Set(['sellerA']), sellerUpsertFailed: true });
  assert.deepEqual(d.expireIds, []);
});

t('incompleto nunca expira, qualquer que seja a uniao', () => {
  for (const unionSize of [0, 1, 5]) {
    const d = decideMasterExpiry({ complete: false, unionSize, offers, updatedOfferIds: new Set(), sellerUpsertFailed: false });
    assert.equal(d.action, 'none');
  }
});

// =============== 6. idempotencia e ciclos alternados ===============
t('idempotencia: duas passadas seguidas sobre a mesma entrada geram a mesma saida', () => {
  const a = consolidateMasterResults(RE3_CATALOGS, noVerdicts);
  const b = consolidateMasterResults(RE3_CATALOGS, noVerdicts);
  assert.deepEqual(a, b);
});

/** Simulador em memoria de "uma oferta por (master, vendedor), preco ultimo gravado". */
function simulate(mode: 'legacy' | 'master', cycles: number, catalogs: CatalogOutcome[], seed: number): number[] {
  const store = new Map<string, number>();
  const history: number[] = [];
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = 0; i < cycles; i++) {
    const order = [...catalogs].sort(() => rnd() - 0.5); // ordem de resposta/processamento muda a cada ciclo
    if (mode === 'legacy') {
      for (const cat of order) for (const r of collapseBySeller(cat.results, noVerdicts as never)) store.set(r.externalSellerId, r.priceCents);
    } else {
      for (const r of consolidateMasterResults(order, noVerdicts).sellers) store.set(r.externalSellerId, r.priceCents);
    }
    history.push(store.get(A2Z)!);
  }
  return history;
}

t('ciclos alternados: o modo legado OSCILA entre 188,76/190,02/192,12 (reproduz o bug); o modo master fica em 188,76 em 200 ciclos', () => {
  const legacy = simulate('legacy', 200, RE3_CATALOGS, 7);
  assert.ok(new Set(legacy).size > 1, 'o legado deveria oscilar');
  const master = simulate('master', 200, RE3_CATALOGS, 7);
  assert.deepEqual([...new Set(master)], [18876]);
});

// =============== 7. flag, escopo e agrupamento ===============
t('config: flag desligada por padrao (ausente, vazia, "0", "true") -> nenhum master agrupado, mesmo com lista', () => {
  for (const v of [undefined, '', '0', 'true', 'on']) {
    const scope = getMasterGroupingScope({ COLLECT_MASTER_GROUPING: v, COLLECT_MASTER_GROUPING_MASTERS: '6813e83f-ef94-4b10-b54d-6e844c8a05b5' });
    assert.equal(scope.enabled, false);
    assert.equal(shouldGroupByMaster('6813e83f-ef94-4b10-b54d-6e844c8a05b5', scope), false);
  }
});

t('config: flag ligada SEM lista de masters -> nao agrupa nenhum (seguro: exige lista ou "*")', () => {
  const scope = getMasterGroupingScope({ COLLECT_MASTER_GROUPING: '1' });
  assert.equal(scope.enabled, true);
  assert.equal(shouldGroupByMaster('6813e83f-ef94-4b10-b54d-6e844c8a05b5', scope), false);
});

t('config: flag ligada + lista de pilotos (ids parciais NAO valem; caixa e espacos ignorados) -> so os listados', () => {
  const scope = getMasterGroupingScope({
    COLLECT_MASTER_GROUPING: '1',
    COLLECT_MASTER_GROUPING_MASTERS: ' 48F4279E-d37a-4369-b8fe-499e81c461cb , 6813e83f-ef94-4b10-b54d-6e844c8a05b5 ',
  });
  assert.equal(shouldGroupByMaster('48f4279e-d37a-4369-b8fe-499e81c461cb', scope), true);
  assert.equal(shouldGroupByMaster('6813e83f-ef94-4b10-b54d-6e844c8a05b5', scope), true);
  assert.equal(shouldGroupByMaster('48f4279e', scope), false);
  assert.equal(shouldGroupByMaster('00000000-0000-0000-0000-000000000000', scope), false);
});

t('config: "*" liga para todos os masters', () => {
  const scope = getMasterGroupingScope({ COLLECT_MASTER_GROUPING: '1', COLLECT_MASTER_GROUPING_MASTERS: '*' });
  assert.equal(shouldGroupByMaster('qualquer', scope), true);
});

type Due = { id: string; externalRef: string | null; networkId: string; networkSlug: string; masterProductId: string };
const due = (id: string, ref: string, master: string, network = 'net-ml'): Due => ({ id, externalRef: ref, networkId: network, networkSlug: 'mercado-livre', masterProductId: master });

/** Copia LITERAL do agrupamento original de collect-prices.ts (linhas 160-175) = oraculo da flag desligada. */
function legacyGroupingOracle(dueOffers: Due[]) {
  const groups = new Map<string, { networkId: string; networkSlug: string; externalRef: string; masterProductId: string; offerIds: string[] }>();
  for (const offer of dueOffers) {
    const key = `${offer.networkId}:${offer.externalRef}`;
    const existing = groups.get(key);
    if (existing) existing.offerIds.push(offer.id);
    else groups.set(key, { networkId: offer.networkId, networkSlug: offer.networkSlug, externalRef: offer.externalRef!, masterProductId: offer.masterProductId, offerIds: [offer.id] });
  }
  return Array.from(groups.values());
}

t('FLAG OFF IDENTICA: groupDueOffers sem predicado reproduz o agrupamento original, byte a byte, em 300 entradas aleatorias', () => {
  let s = 12345;
  const rnd = (m: number) => { s = (s * 1103515245 + 12345) % 2147483648; return s % m; };
  for (let k = 0; k < 300; k++) {
    const list: Due[] = [];
    const len = rnd(40);
    for (let i = 0; i < len; i++) list.push(due(`o${k}-${i}`, `MLB${rnd(8)}`, `m${rnd(4)}`, rnd(5) === 0 ? 'net-2' : 'net-ml'));
    const out = groupDueOffers(list, () => false);
    assert.deepEqual(out.catalogGroups, legacyGroupingOracle(list));
    assert.deepEqual(out.masterTargets, []);
    assert.equal(out.masterBaselineCalls, 0);
  }
});

t('FLAG OFF IDENTICA: collapseBySeller extraido e igual ao original (copia literal) em 500 entradas aleatorias', () => {
  function original(results: Listing[], verdicts: Map<string, { excluded: boolean }>): Listing[] {
    const bad = (r: Listing) => (verdicts.get(r.externalItemId)?.excluded ? 1 : 0);
    const bySeller = new Map<string, Listing>();
    for (const r of results) {
      const cur = bySeller.get(r.externalSellerId);
      if (!cur || bad(r) < bad(cur) || (bad(r) === bad(cur) && (r.priceCents < cur.priceCents || (r.priceCents === cur.priceCents && r.externalItemId < cur.externalItemId)))) bySeller.set(r.externalSellerId, r);
    }
    return Array.from(bySeller.values());
  }
  let s = 99;
  const rnd = (m: number) => { s = (s * 1103515245 + 12345) % 2147483648; return s % m; };
  for (let k = 0; k < 500; k++) {
    const list: Listing[] = [];
    const verdicts = new Map<string, { excluded: boolean }>();
    for (let i = 0; i < rnd(15); i++) {
      const id = `i${rnd(10)}`;
      list.push(L(`s${rnd(4)}`, id, 1000 + rnd(6) * 100));
      if (rnd(4) === 0) verdicts.set(id, { excluded: true });
    }
    assert.deepEqual(collapseBySeller(list, verdicts), original(list, verdicts));
  }
});

t('flag ligada para 1 master: so as ofertas dele viram alvo; o resto segue agrupado por catalogo (como hoje)', () => {
  const list = [due('o1', 'A', 'pilot'), due('o2', 'B', 'pilot'), due('o3', 'B', 'pilot'), due('o4', 'C', 'other'), due('o5', 'A', 'other')];
  const out = groupDueOffers(list, (m) => m === 'pilot');
  assert.equal(out.masterTargets.length, 1);
  assert.equal(out.masterTargets[0].masterProductId, 'pilot');
  assert.deepEqual(out.masterTargets[0].dueOfferIds, ['o1', 'o2', 'o3']);
  assert.deepEqual(out.catalogGroups.map((g) => [g.externalRef, g.offerIds]), [['C', ['o4']], ['A', ['o5']]]);
  assert.equal(out.masterBaselineCalls, 2); // catalogos A e B que o legado chamaria para o piloto
});

t('dois masters piloto compartilhando um catalogo: dois alvos separados (cada um com seu master), sem misturar ofertas', () => {
  const out = groupDueOffers([due('o1', 'X', 'm1'), due('o2', 'X', 'm2')], () => true);
  assert.equal(out.masterTargets.length, 2);
  assert.deepEqual(out.masterTargets.map((m) => [m.masterProductId, m.dueOfferIds]), [['m1', ['o1']], ['m2', ['o2']]]);
  assert.equal(out.masterBaselineCalls, 1); // o legado chamaria X uma vez
});

t('master piloto e master nao-piloto no mesmo catalogo: piloto vai por master, o outro continua no grupo por catalogo', () => {
  const out = groupDueOffers([due('o1', 'X', 'pilot'), due('o2', 'X', 'other')], (m) => m === 'pilot');
  assert.equal(out.masterTargets.length, 1);
  assert.deepEqual(out.catalogGroups.map((g) => [g.externalRef, g.masterProductId, g.offerIds]), [['X', 'other', ['o2']]]);
});

t('redes diferentes com o mesmo master geram alvos separados (rede, master)', () => {
  const out = groupDueOffers([due('o1', 'A', 'm', 'net-ml'), due('o2', 'A', 'm', 'net-x')], () => true);
  assert.equal(out.masterTargets.length, 2);
});

// =============== 8. cota ===============
t('cota: teto = ceil(+10%) da linha de base; primeiro master sempre passa; os demais so se couberem; refs ja reservadas nao custam', () => {
  assert.equal(masterCallCap(10), 11);
  assert.equal(masterCallCap(2), 3);
  assert.equal(masterCallCap(0), 0);
  const b = createCallBudget(masterCallCap(10)); // 11
  assert.equal(b.tryReserve(['a', 'b', 'c', 'd', 'e', 'f', 'g']), true); // primeiro: sempre
  assert.equal(b.tryReserve(['h', 'i', 'j', 'k']), true); // 7 + 4 = 11
  assert.equal(b.tryReserve(['l']), false); // 12 > 11
  assert.equal(b.tryReserve(['a', 'b']), true); // ja reservadas, custo 0
  assert.equal(b.used(), 11);
});

t('cota: primeiro master maior que o teto ainda passa (senao um master de 19 catalogos nunca seria coletado)', () => {
  const b = createCallBudget(3);
  assert.equal(b.tryReserve(Array.from({ length: 19 }, (_, i) => 'c' + i)), true);
  assert.equal(b.tryReserve(['z']), false);
});

// =============== 9. concorrencia ===============
t('concorrencia: masters em paralelo (4) com atrasos aleatorios e catalogo compartilhado -> mesmo resultado do sequencial e 1 chamada por catalogo', async () => {
  const catalog: Record<string, Listing[]> = {
    X: [L('v1', 'x1', 300), L('v2', 'x2', 500)],
    Y: [L('v1', 'y1', 250)],
    Z: [L('v3', 'z1', 100)],
    W: [L('v1', 'w1', 275), L('v3', 'w2', 90)],
  };
  const masters: Record<string, string[]> = { m1: ['X', 'Y'], m2: ['X', 'Z'], m3: ['Y', 'Z', 'W'], m4: ['W'], m5: ['X'], m6: ['Z', 'W'] };
  const run = async (concurrency: number, jitter: boolean) => {
    const calls = new Map<string, number>();
    const fetcher = createCatalogFetcher(async (ref: string) => {
      calls.set(ref, (calls.get(ref) ?? 0) + 1);
      if (jitter) await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 8)));
      return catalog[ref];
    });
    const out = await mapWithConcurrency(Object.keys(masters), concurrency, async (m) => {
      const r = await fetchMasterCatalogs(masters[m], fetcher);
      const c = consolidateMasterResults(r.outcomes, noVerdicts);
      return [m, ser(c)] as const;
    });
    return { out, calls };
  };
  const seq = await run(1, false);
  for (let k = 0; k < 15; k++) {
    const par = await run(4, true);
    assert.deepEqual(par.out, seq.out);
    for (const [ref, nCalls] of par.calls) assert.equal(nCalls, 1, `catalogo ${ref} chamado ${nCalls}x`);
  }
});

t('concorrencia: cache do fetcher nao guarda falha (retry busca de novo) e dedupe chamadas simultaneas do mesmo catalogo', async () => {
  let k = 0;
  const fetcher = createCatalogFetcher(async (ref: string) => {
    k++;
    await new Promise((r) => setTimeout(r, 3));
    if (k === 1) throw new Error('boom');
    return [L('v', 'i-' + ref, 1)];
  });
  const [a, b] = await Promise.allSettled([fetcher('A'), fetcher('A')]);
  assert.equal(a.status, 'rejected');
  assert.equal(b.status, 'rejected'); // simultaneas compartilham a mesma falha
  assert.equal(k, 1);
  const again = await fetcher('A'); // falha nao ficou em cache
  assert.equal(again.length, 1);
  assert.equal(k, 2);
  await fetcher('A');
  assert.equal(k, 2); // sucesso fica em cache no ciclo
});

t('resposta invertida: catalogos que respondem na ordem inversa (atrasos opostos) nao mudam a saida', async () => {
  const mk = (delays: Record<string, number>) => createCatalogFetcher(async (ref: string) => {
    await new Promise((r) => setTimeout(r, delays[ref]));
    return RE3_CATALOGS.find((c) => c.externalRef === ref)!.results;
  });
  const refs = RE3_CATALOGS.map((c) => c.externalRef);
  const a = await fetchMasterCatalogs(refs, mk({ MLB46308238: 1, MLB46286520: 6, MLB45004754: 12 }));
  const b = await fetchMasterCatalogs([...refs].reverse(), mk({ MLB46308238: 12, MLB46286520: 6, MLB45004754: 1 }));
  assert.equal(ser(consolidateMasterResults(a.outcomes, noVerdicts)), ser(consolidateMasterResults(b.outcomes, noVerdicts)));
});


// =============== 10. PAGINACAO de /products/{catalog}/items (so no caminho por master; ata 2026-11-06, secao de implementacao) ===============
// Fatos medidos na API oficial: resposta traz paging {total, offset, limit}; limit padrao 100; limit/offset funcionam
// (limit=10&offset=95 -> 2 itens de total 97). Teto maximo de limit DESCONHECIDO: nunca pedimos mais que 100.
// Aqui o "servidor" e um mock em memoria (sem API real, sem banco). Itens sao estruturais.
const mkItems = (count: number, seller = (i: number) => `s${i}`, prefix = 'it'): Listing[] =>
  Array.from({ length: count }, (_, i) => L(seller(i), `${prefix}${i}`, 1000 + i));

interface MockOpts {
  /** o servidor limita a pagina a este tamanho (menor que o pedido) */
  serverCap?: number;
  /** falha (throw) nestas chamadas (1-based, contando tentativas) */
  failCalls?: number[];
  /** devolve paging nulo */
  noPaging?: boolean;
  /** mexe na pagina devolvida */
  mutate?: (page: CatalogPage<Listing>, call: number, offset: number) => CatalogPage<Listing>;
  reverseItems?: boolean;
  jitter?: boolean;
}
function mockServer(all: Listing[], opts: MockOpts = {}) {
  const log: Array<{ ref: string; offset: number; limit: number }> = [];
  let call = 0;
  const fetchPage = async (ref: string, offset: number, limit: number): Promise<CatalogPage<Listing>> => {
    call++;
    log.push({ ref, offset, limit });
    if (opts.jitter) await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)));
    if (opts.failCalls?.includes(call)) throw new Error('HTTP 500');
    const eff = Math.min(limit, opts.serverCap ?? limit);
    let slice = all.slice(offset, offset + eff);
    if (opts.reverseItems) slice = [...slice].reverse();
    let page: CatalogPage<Listing> = {
      items: slice,
      rawIds: slice.map((x) => x.externalItemId),
      paging: opts.noPaging ? null : { total: all.length, offset, limit: eff },
    };
    if (opts.mutate) page = opts.mutate(page, call, offset);
    return page;
  };
  return { fetchPage, log, calls: () => call };
}
const kindOf = async (p: Promise<unknown>) => {
  try { await p; return 'ok'; } catch (e) { return e instanceof CatalogPagingError ? e.kind : `outro:${(e as Error).message}`; }
};

t('paginacao: total<=100 -> 1 chamada (limit=100, offset=0), todos os itens', async () => {
  const srv = mockServer(mkItems(40));
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 40);
  assert.equal(r.pages, 1);
  assert.deepEqual(srv.log, [{ ref: 'MLB1', offset: 0, limit: 100 }]);
});

t('paginacao: catalogo vazio (total 0, 0 itens) -> 1 chamada, resultado vazio legitimo (nao e falha)', async () => {
  const srv = mockServer([]);
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 0);
  assert.equal(r.total, 0);
  assert.equal(srv.calls(), 1);
});

t('paginacao: total=100 EXATO -> 1 chamada (nao pede pagina vazia)', async () => {
  const srv = mockServer(mkItems(100));
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 100);
  assert.equal(srv.calls(), 1);
});

t('paginacao: total=101 -> 2 chamadas (offsets 0 e 100)', async () => {
  const srv = mockServer(mkItems(101));
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 101);
  assert.deepEqual(srv.log.map((x) => x.offset), [0, 100]);
});

t('paginacao: total=250 -> 3 paginas (offsets 0,100,200; limit sempre 100, nunca acima), 250 itens, total e paginas reportados', async () => {
  const srv = mockServer(mkItems(250));
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 250);
  assert.deepEqual(srv.log.map((x) => [x.offset, x.limit]), [[0, 100], [100, 100], [200, 100]]);
  assert.equal(r.total, 250);
  assert.equal(r.pages, 3);
  assert.equal(r.calls, 3);
});

t('paginacao: servidor que limita a pagina (60 < 100) -> avanca pelo que veio ate completar, sem perder item', async () => {
  const srv = mockServer(mkItems(250), { serverCap: 60 });
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 250);
  assert.deepEqual(srv.log.map((x) => x.offset), [0, 60, 120, 180, 240]);
});

t('paginacao: paging AUSENTE -> falha paging-ausente (nao assume lista completa), sem retry (nao e falha de rede)', async () => {
  const srv = mockServer(mkItems(30), { noPaging: true });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'paging-ausente');
  assert.equal(srv.calls(), 1);
});

t('paginacao: paging inconsistente (total negativo / nao inteiro / NaN / offset diferente do pedido / total muda entre paginas) -> falha', async () => {
  const bad = (mut: (p: CatalogPage<Listing>, call: number) => CatalogPage<Listing>) =>
    kindOf(fetchCatalogAllPages('MLB1', mockServer(mkItems(250), { mutate: (p, c) => mut(p, c) }).fetchPage));
  assert.equal(await bad((p) => ({ ...p, paging: { ...p.paging!, total: -1 } })), 'paging-inconsistente');
  assert.equal(await bad((p) => ({ ...p, paging: { ...p.paging!, total: 250.5 } })), 'paging-inconsistente');
  assert.equal(await bad((p) => ({ ...p, paging: { ...p.paging!, total: Number.NaN } })), 'paging-inconsistente');
  assert.equal(await bad((p, c) => (c === 2 ? { ...p, paging: { ...p.paging!, offset: 5 } } : p)), 'paging-inconsistente');
  assert.equal(await bad((p, c) => (c === 2 ? { ...p, paging: { ...p.paging!, total: 260 } } : p)), 'paging-inconsistente');
});

t('paginacao: pagina do MEIO falha de forma persistente -> 1 retry nela e FALHA (3 chamadas: ok, falha, retry); nada devolvido', async () => {
  const srv = mockServer(mkItems(250), { failCalls: [2, 3] });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'pagina-falhou');
  assert.equal(srv.calls(), 3);
});

t('paginacao: pagina do meio falha UMA vez e passa no retry -> completo; as chamadas (inclusive o retry) sao contadas', async () => {
  const srv = mockServer(mkItems(250), { failCalls: [2] });
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 250);
  assert.equal(r.pages, 3);
  assert.equal(r.calls, 4);
});

t('paginacao: ULTIMA pagina devolve menos que o esperado (200 de 250) -> falha incompleto (nunca lista parcial)', async () => {
  const srv = mockServer(mkItems(250), { mutate: (p, c) => (c === 3 ? { ...p, items: [], rawIds: [] } : p) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'incompleto');
});

t('paginacao: pagina devolve 0 itens no meio (sem progresso) -> falha incompleto, sem laco infinito', async () => {
  const srv = mockServer(mkItems(250), { mutate: (p, c) => (c === 2 ? { ...p, items: [], rawIds: [] } : p) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'incompleto');
  assert.ok(srv.calls() <= 10);
});

t('paginacao: itens REPETIDOS entre paginas deslocando a lista (faltam itens) -> falha incompleto', async () => {
  const items = mkItems(250);
  const srv = mockServer(items, { mutate: (p, c) => (c === 2 ? { ...p, items: items.slice(95, 195), rawIds: items.slice(95, 195).map((x) => x.externalItemId) } : p) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'incompleto');
});

t('paginacao: dedupe por item id -- API devolve 1 item a mais repetido (106 brutos, 105 unicos = total) -> completo, 105 itens, sem duplicata', async () => {
  const items = mkItems(105);
  const srv = mockServer(items, {
    mutate: (p, c) => {
      if (c !== 2) return p;
      const extra = [items[3], ...p.items]; // repete it3 (ja veio na pagina 1)
      return { ...p, items: extra, rawIds: extra.map((x) => x.externalItemId) };
    },
  });
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.length, 105);
  assert.equal(new Set(r.items.map((x) => x.externalItemId)).size, 105);
});

t('paginacao: teto de paginas -- total 1000 (10 paginas) passa; total 1001 (11) FALHA teto-paginas com exatamente 10 chamadas', async () => {
  const ok10 = mockServer(mkItems(1000));
  assert.equal((await fetchCatalogAllPages('MLB1', ok10.fetchPage)).items.length, 1000);
  const over = mockServer(mkItems(1001));
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', over.fetchPage)), 'teto-paginas');
  assert.equal(over.calls(), 10);
  const custom = mockServer(mkItems(250));
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', custom.fetchPage, { maxPages: 2 })), 'teto-paginas');
});

t('paginacao: orcamento -- charge() e consultado ANTES de cada tentativa; recusa no meio do catalogo = falha orcamento (2 chamadas feitas, nada devolvido)', async () => {
  const srv = mockServer(mkItems(250));
  let allowed = 2;
  const checks: number[] = [];
  const kind = await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage, { charge: () => { checks.push(srv.calls()); return allowed-- > 0; } }));
  assert.equal(kind, 'orcamento');
  assert.equal(srv.calls(), 2);
  assert.deepEqual(checks, [0, 1, 2]); // consultou antes de chamar a 1a, a 2a e a 3a (recusada)
});

t('paginacao: o retry TAMBEM consome orcamento (cada tentativa cobra 1)', async () => {
  const srv = mockServer(mkItems(150), { failCalls: [1] });
  let charged = 0;
  await fetchCatalogAllPages('MLB1', srv.fetchPage, { charge: () => { charged++; return true; } });
  assert.equal(charged, 3); // 1a tentativa (falhou) + retry + pagina 2
});

t('paginacao: tamanho de pagina acima de 100 e limitado a 100 (teto da API desconhecido: nunca pedir > 100)', async () => {
  const srv = mockServer(mkItems(250));
  await fetchCatalogAllPages('MLB1', srv.fetchPage, { pageSize: 500 });
  assert.ok(srv.log.every((x) => x.limit <= 100));
});

// ---- parse da resposta oficial ----
t('parseMeliCatalogPage: so condition=new vira anuncio; rawIds contam TODAS as condicoes (offset avanca pelos brutos); paging repassado', () => {
  const body = {
    paging: { total: 3, offset: 0, limit: 100 },
    results: [
      { item_id: 'MLB1', price: 10.5, original_price: 12, seller_id: 11, condition: 'new' },
      { item_id: 'MLB2', price: 9, original_price: null, seller_id: 12, condition: 'used' },
      { item_id: 'MLB3', price: 7.99, original_price: null, seller_id: 13, condition: 'new' },
    ],
  };
  const p = parseMeliCatalogPage(body);
  assert.deepEqual(p.rawIds, ['MLB1', 'MLB2', 'MLB3']);
  assert.deepEqual(p.items.map((i) => [i.externalItemId, i.externalSellerId, i.priceCents, i.listPriceCents]), [['MLB1', '11', 1050, 1200], ['MLB3', '13', 799, null]]);
  assert.deepEqual(p.paging, { total: 3, offset: 0, limit: 100 });
});

t('parseMeliCatalogPage: paging ausente/malformado -> paging=null (a falha e decidida por fetchCatalogAllPages); results nao-array -> lanca', () => {
  assert.equal(parseMeliCatalogPage({ results: [] }).paging, null);
  assert.equal(parseMeliCatalogPage({ results: [], paging: { total: 'x' } }).paging, null);
  assert.equal(parseMeliCatalogPage({ results: [], paging: null }).paging, null);
  assert.throws(() => parseMeliCatalogPage({ paging: { total: 1, offset: 0, limit: 100 } }));
  assert.throws(() => parseMeliCatalogPage(null));
});

t('parseMeliCatalogPage: item bruto sem item_id ocupa posicao (conta no offset) e nao vira anuncio', () => {
  const p = parseMeliCatalogPage({ paging: { total: 2, offset: 0, limit: 100 }, results: [{ item_id: null, price: 1, seller_id: 1, condition: 'new' }, { item_id: 'MLB9', price: 2, seller_id: 2, condition: 'new' }] });
  assert.equal(p.rawIds.length, 2);
  assert.equal(new Set(p.rawIds).size, 2);
  assert.equal(p.items.length, 1);
});

// ---- orcamento (custo = paginas) ----
t('orcamento por pagina: 1o master e isento do teto (sem starvation); demais so ate o teto; recusa quando used >= cap', () => {
  const b = createCallBudget(3);
  assert.equal(b.canAdmit('mA', 2), true); // 1o: isento
  assert.equal(b.canAdmit('mB', 2), true); // cap 3, usado 0
  assert.equal(b.tryCharge('mB'), true);
  assert.equal(b.tryCharge('mB'), true);
  assert.equal(b.tryCharge('mB'), true);
  assert.equal(b.tryCharge('mB'), false); // 4a pagina de mB: acabou
  assert.equal(b.canAdmit('mC', 1), false);
  for (let i = 0; i < 25; i++) assert.equal(b.tryCharge('mA'), true); // isento: custo real e contado, nunca recusado
  assert.equal(b.used(), 28);
  assert.equal(b.canAdmit('mA', 1), true);
});

t('orcamento por pagina: canAdmit exige folga minima sem consumir', () => {
  const b = createCallBudget(5);
  b.canAdmit('first', 0);
  assert.equal(b.canAdmit('x', 6), false);
  assert.equal(b.used(), 0);
  assert.equal(b.canAdmit('x', 5), true);
  assert.equal(b.used(), 0);
});

// ---- integracao: master com catalogo paginado ----
const pagedFetcherFor = (cats: Record<string, Listing[]>, opts: Record<string, MockOpts> = {}, charge?: () => boolean) => {
  const servers = new Map<string, ReturnType<typeof mockServer>>();
  const srvOf = (ref: string) => { let s = servers.get(ref); if (!s) { s = mockServer(cats[ref], opts[ref]); servers.set(ref, s); } return s; };
  const fetchFn = async (ref: string) => (await fetchCatalogAllPages(ref, srvOf(ref).fetchPage, { charge })).items;
  return { fetchFn, srvOf, servers };
};

t('master + paginacao: vendedor SO na pagina 3 (item 220 de 250) esta na uniao e NAO e expirado; um corte em 100 o expiraria (o bug evitado)', async () => {
  const items = mkItems(250, (i) => (i === 220 ? 'vP3' : `s${i}`));
  const { fetchFn } = pagedFetcherFor({ A: items });
  const r = await fetchMasterCatalogs(['A'], fetchFn, { retries: 0 });
  const c = consolidateMasterResults(r.outcomes, noVerdicts);
  assert.equal(c.complete, true);
  assert.ok(c.sellers.some((s) => s.externalSellerId === 'vP3'));
  const offers = [{ id: 'oP3', isPlaceholder: false }, { id: 'o0', isPlaceholder: false }];
  const updated = new Set(['oP3', 'o0']);
  assert.deepEqual(decideMasterExpiry({ complete: c.complete, unionSize: c.unionSize, offers, updatedOfferIds: updated, sellerUpsertFailed: false }).expireIds, []);
  // contraprova (comportamento sem paginacao): so a 1a pagina => vP3 ausente => seria expirado
  const cut = consolidateMasterResults([ok('A', items.slice(0, 100))], noVerdicts);
  assert.ok(!cut.sellers.some((s) => s.externalSellerId === 'vP3'));
  const wrong = decideMasterExpiry({ complete: true, unionSize: cut.unionSize, offers, updatedOfferIds: new Set(['o0']), sellerUpsertFailed: false });
  assert.deepEqual(wrong.expireIds, ['oP3']);
});

t('master + paginacao: falha parcial (catalogo B, pagina 2 cai) -> complete=false, NENHUM preco, NENHUMA expiracao; C nem e chamado', async () => {
  const cats = { A: mkItems(120, (i) => `a${i}`, 'a'), B: mkItems(250, (i) => `b${i}`, 'b'), C: mkItems(10, (i) => `c${i}`, 'c') };
  const { fetchFn, servers } = pagedFetcherFor(cats, { B: { failCalls: [2, 3] } });
  const r = await fetchMasterCatalogs(['A', 'B', 'C'], fetchFn, { retries: 0 });
  assert.equal(r.complete, false);
  assert.deepEqual(r.outcomes.map((o) => o.status), ['ok', 'failed', 'skipped']);
  assert.equal(servers.has('C'), false);
  const c = consolidateMasterResults(r.outcomes, noVerdicts);
  assert.deepEqual(c.sellers, []);
  const d = decideMasterExpiry({ complete: c.complete, unionSize: 99, offers: [{ id: 'o', isPlaceholder: false }], updatedOfferIds: new Set(), sellerUpsertFailed: false });
  assert.deepEqual(d, { action: 'none', expireIds: [], missIds: [] });
});

t('master + paginacao: orcamento acaba NO MEIO de um catalogo -> outcome failed com errorKind=orcamento, resto skipped, master incompleto', async () => {
  const cats = { A: mkItems(250, (i) => `a${i}`, 'a'), B: mkItems(10, (i) => `b${i}`, 'b') };
  const b = createCallBudget(2);
  b.canAdmit('exempt', 0); // outro master e o isento; este e um master comum
  const { fetchFn } = pagedFetcherFor(cats, {}, () => b.tryCharge('m'));
  const r = await fetchMasterCatalogs(['A', 'B'], fetchFn, { retries: 0 });
  assert.equal(r.complete, false);
  assert.equal(r.outcomes[0].status, 'failed');
  assert.equal(r.outcomes[0].errorKind, 'orcamento');
  assert.equal(r.outcomes[1].status, 'skipped');
  assert.equal(b.used(), 2);
  assert.deepEqual(consolidateMasterResults(r.outcomes, noVerdicts).sellers, []);
});

t('master + paginacao: ordem invertida (itens de cada pagina em ordem oposta) e atrasos aleatorios -> mesma saida', async () => {
  const cats = { A: mkItems(250, (i) => `s${i % 40}`, 'a'), B: mkItems(130, (i) => `s${i % 25}`, 'b') };
  const base = ser(consolidateMasterResults((await fetchMasterCatalogs(['A', 'B'], pagedFetcherFor(cats).fetchFn, { retries: 0 })).outcomes, noVerdicts));
  for (let k = 0; k < 10; k++) {
    const f = pagedFetcherFor(cats, { A: { reverseItems: true, jitter: true }, B: { reverseItems: true, jitter: true } });
    const out = ser(consolidateMasterResults((await fetchMasterCatalogs(['B', 'A'], f.fetchFn, { retries: 0 })).outcomes, noVerdicts));
    assert.equal(out, base);
  }
});

t('master + paginacao: concorrencia (masters em paralelo dividindo um catalogo de 250) -> catalogo compartilhado paginado UMA vez (3 chamadas), mesmo resultado do sequencial', async () => {
  const cats = { X: mkItems(250, (i) => `s${i % 60}`, 'x'), Y: mkItems(30, (i) => `s${i}`, 'y') };
  const masters: Record<string, string[]> = { m1: ['X', 'Y'], m2: ['X'], m3: ['Y', 'X'], m4: ['X'] };
  const run = async (conc: number, jitter: boolean) => {
    const calls = new Map<string, number>();
    const servers: Record<string, ReturnType<typeof mockServer>> = {};
    const fetcher = createCatalogFetcher<Listing>(async (ref) => {
      const srv = (servers[ref] ??= mockServer(cats[ref as 'X' | 'Y'], { jitter }));
      const r = await fetchCatalogAllPages(ref, srv.fetchPage, { charge: () => { calls.set(ref, (calls.get(ref) ?? 0) + 1); return true; } });
      return r.items;
    });
    const out = await mapWithConcurrency(Object.keys(masters), conc, async (m) => {
      const r = await fetchMasterCatalogs(masters[m], fetcher, { retries: 0 });
      return [m, ser(consolidateMasterResults(r.outcomes, noVerdicts))] as const;
    });
    return { out, calls };
  };
  const seq = await run(1, false);
  for (let k = 0; k < 8; k++) {
    const par = await run(4, true);
    assert.deepEqual(par.out, seq.out);
    assert.equal(par.calls.get('X'), 3);
    assert.equal(par.calls.get('Y'), 1);
  }
});

t('fetcher com ctx: createCatalogFetcher repassa o contexto ao 1o chamador; falha continua sem cache', async () => {
  const seen: string[] = [];
  let k = 0;
  const f = createCatalogFetcher<Listing, string>(async (ref, ctx) => { seen.push(`${ref}:${ctx}`); if (k++ === 0) throw new Error('x'); return []; });
  await assert.rejects(f('A', 'm1'));
  await f('A', 'm2');
  await f('A', 'm3'); // cache
  assert.deepEqual(seen, ['A:m1', 'A:m2']);
});

// ---- flag desligada: legado intocado ----
t('FLAG OFF: o legado fetchSnapshots NAO pagina (sem limit/offset) -- risco conhecido, registrado na ata (TODO no codigo)', () => {
  const src = fs.readFileSync(new URL('../src/server/collector/sources/mercado-livre.ts', import.meta.url), 'utf8');
  const start = src.indexOf('async fetchSnapshots');
  const end = src.indexOf('async fetchCatalogPage');
  assert.ok(start > 0 && end > start, 'fetchCatalogPage deve vir depois do legado');
  const legacy = src.slice(start, end);
  assert.ok(legacy.includes('/items`'));
  assert.ok(!/limit=|offset=/.test(legacy));
  assert.ok(legacy.includes('TODO(paginacao-legado)'));
});

t('FLAG OFF: collect-prices so usa o caminho paginado dentro de processMasterTarget (legado chama source.fetchSnapshots como antes)', () => {
  const src = fs.readFileSync(new URL('../src/server/collector/collect-prices.ts', import.meta.url), 'utf8');
  const legacyFn = src.slice(src.indexOf('const processCatalogGroup'), src.indexOf('const tasks:'));
  assert.ok(legacyFn.includes('source.fetchSnapshots(group.externalRef)'));
  assert.ok(!/fetchCatalogPage|fetchCatalogAllPages/.test(legacyFn));
});


// =============== 11. Ressalvas do QA (R1-R4, S1): isencao deterministica, reserva atomica, isento nao herda falha alheia, catalogo vazio sem paging, validacao dura ===============
t('R1: setExempt elege o master isento ANTES da corrida; a ordem de chegada do canAdmit nao muda quem e isento', () => {
  const b = createCallBudget(2);
  b.setExempt('m1');
  assert.equal(b.isExempt('m1'), true);
  assert.equal(b.canAdmit('m2', 1), true); // m2 chegou primeiro, mas NAO vira isento
  assert.equal(b.isExempt('m2'), false);
  assert.equal(b.tryCharge('m2'), true);
  assert.equal(b.tryCharge('m2'), true);
  assert.equal(b.tryCharge('m2'), false); // teto 2 vale para m2
  for (let i = 0; i < 10; i++) assert.equal(b.tryCharge('m1'), true); // isento nunca recusado
});

t('R1: sem setExempt o comportamento antigo continua (1o a perguntar e isento)', () => {
  const b = createCallBudget(1);
  assert.equal(b.canAdmit('x', 1), true);
  assert.equal(b.isExempt('x'), true);
});

t('R1: admissao ATOMICA -- admit reserva a folga minima; 2 masters nao disputam a mesma folga', () => {
  const b = createCallBudget(5);
  b.setExempt('iso');
  assert.equal(b.admit('a', 3), true);
  assert.equal(b.admit('b', 3), false); // 5 - 3 reservadas < 3
  assert.equal(b.admit('b', 2), true);
  assert.equal(b.admit('iso', 99), true); // isento: sempre, sem reservar
  // a esgota sua reserva (3) e nao consegue pegar a de b
  assert.equal(b.tryCharge('a'), true);
  assert.equal(b.tryCharge('a'), true);
  assert.equal(b.tryCharge('a'), true);
  assert.equal(b.tryCharge('a'), false); // folga livre = 5 - 3 cobradas - 2 reservadas de b = 0
  assert.equal(b.tryCharge('b'), true);
  assert.equal(b.tryCharge('b'), true);
  assert.equal(b.used(), 5);
  b.release('a');
  b.release('b');
  assert.equal(b.admit('c', 1), false); // teto cheio
});

t('R1: release devolve a reserva nao usada (master que acabou com menos paginas do que a folga reservada)', () => {
  const b = createCallBudget(4);
  b.setExempt('iso');
  assert.equal(b.admit('a', 3), true);
  assert.equal(b.tryCharge('a'), true); // usou 1 de 3
  assert.equal(b.admit('b', 3), false); // 4 - 1 cobrada - 2 reservadas restantes = 1 < 3
  b.release('a');
  assert.equal(b.admit('b', 3), true); // sobraram 3
});

t('R2: o master ISENTO que aguarda promessa em cache disparada por outro master e falhada por ORCAMENTO refaz a busca com isencao', async () => {
  const b = createCallBudget(1);
  b.setExempt('iso');
  const srv = mockServer(mkItems(250));
  const fetcher = createCatalogFetcher<Listing, string>(async (ref, owner = '') =>
    (await fetchCatalogAllPages(ref, srv.fetchPage, { charge: () => b.tryCharge(owner) })).items);
  const wrapped = withExemptRetry(fetcher, (o) => b.isExempt(o));
  const plain = fetcher('X', 'other'); // outro master dispara: paga 1 pagina e o orcamento acaba na 2a
  const [iso, other2, otherPlain] = await Promise.allSettled([wrapped('X', 'iso'), wrapped('X', 'other2'), plain]);
  assert.equal(iso.status, 'fulfilled');
  assert.equal((iso as PromiseFulfilledResult<Listing[]>).value.length, 250);
  assert.equal(other2.status, 'rejected'); // master comum que pegou a falha alheia NAO e retentado
  assert.equal(otherPlain.status, 'rejected');
  assert.equal(((otherPlain as PromiseRejectedResult).reason as CatalogPagingError).kind, 'orcamento');
});

t('R2: withExemptRetry nao retenta outras falhas (so orcamento) nem para master comum', async () => {
  let calls = 0;
  const f = createCatalogFetcher<Listing, string>(async () => { calls++; throw new CatalogPagingError('incompleto', 'X', 'x'); });
  const wrapped = withExemptRetry(f, () => true);
  await assert.rejects(wrapped('X', 'iso'));
  assert.equal(calls, 1);
});

t('R3: 200 bem formado com results vazio e SEM paging (catalogo sem vendedores) -> catalogo vazio, 1 chamada, marcado emptyWithoutPaging', async () => {
  const empty = async (): Promise<CatalogPage<Listing>> => ({ items: [], rawIds: [], paging: null });
  let calls = 0;
  const r = await fetchCatalogAllPages('MLB1', async () => { calls++; return empty(); });
  assert.deepEqual([r.items.length, r.total, r.pages, r.emptyWithoutPaging], [0, 0, 1, true]);
  assert.equal(calls, 1);
  const normal = await fetchCatalogAllPages('MLB1', mockServer(mkItems(5)).fetchPage);
  assert.equal(normal.emptyWithoutPaging, false);
});

t('R3: qualquer resposta com itens e sem paging continua falhando (itens aproveitaveis OU so brutos nao-new); vazio sem paging fora da 1a pagina tambem falha', async () => {
  const withItems = mockServer(mkItems(3), { noPaging: true });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', withItems.fetchPage)), 'paging-ausente');
  const rawOnly = async (): Promise<CatalogPage<Listing>> => ({ items: [], rawIds: ['u1', 'u2'], paging: null });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', rawOnly)), 'paging-ausente');
  const srv = mockServer(mkItems(250), { mutate: (p, c) => (c === 2 ? { items: [], rawIds: [], paging: null } : p) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'paging-ausente');
});

t('R3: parse de {results: []} sem paging -> pagina vazia com paging null (a decisao e do fetchCatalogAllPages); body sem results continua lancando', () => {
  const p = parseMeliCatalogPage({ results: [] });
  assert.deepEqual([p.items.length, p.rawIds.length, p.paging], [0, 0, null]);
  assert.throws(() => parseMeliCatalogPage({}));
});

t('S1: total 0 com itens presentes -> paging-inconsistente (fecha)', async () => {
  const srv = mockServer(mkItems(5), { mutate: (p) => ({ ...p, paging: { ...p.paging!, total: 0 } }) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'paging-inconsistente');
});

t('S1: mais itens UNICOS que o total (60 ids, total 50) -> paging-inconsistente; mesmo id repetido nao conta como excesso', async () => {
  const srv = mockServer(mkItems(60), { mutate: (p) => ({ ...p, paging: { ...p.paging!, total: 50 } }) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'paging-inconsistente');
});

// ---- mutantes sobreviventes do QA ----
t('R4a: falha de paginacao NAO repete o catalogo inteiro em fetchMasterCatalogs (mesmo com retries=1): 1 chamada, errorKind preservado', async () => {
  let calls = 0;
  const r = await fetchMasterCatalogs(['A'], async () => { calls++; throw new CatalogPagingError('incompleto', 'A', 'x'); }, { retries: 1 });
  assert.equal(calls, 1);
  assert.equal(r.attempts, 1);
  assert.equal(r.outcomes[0].errorKind, 'incompleto');
  // erro comum (nao de paginacao) continua com retry
  let c2 = 0;
  await fetchMasterCatalogs(['A'], async () => { c2++; throw new Error('rede'); }, { retries: 1 });
  assert.equal(c2, 2);
});

t('R4b: dedupe por item id -- o PRIMEIRO vale (preco da 1a pagina), mesmo se a repeticao vier com outro preco', async () => {
  const items = mkItems(105);
  const srv = mockServer(items, {
    mutate: (p, c) => {
      if (c !== 2) return p;
      const dup = { ...items[3], priceCents: 999999 };
      return { ...p, items: [dup, ...p.items], rawIds: [dup.externalItemId, ...p.rawIds] };
    },
  });
  const r = await fetchCatalogAllPages('MLB1', srv.fetchPage);
  assert.equal(r.items.find((x) => x.externalItemId === 'it3')!.priceCents, items[3].priceCents);
  assert.equal(r.items.length, 105);
});


// =============== 12. Brecha R3 (paging presente mas invalido) e sanitizacao de erro no summary ===============
const viaParser = (body: unknown) => async (): Promise<CatalogPage<Listing>> => parseMeliCatalogPage(body);

t('R3 brecha: paging PRESENTE mas invalido com results vazio -> FALHA paging-inconsistente (nunca "vazio sem paging"): total string, so total, objeto vazio', async () => {
  for (const paging of [{ total: '5', offset: 0, limit: 100 }, { total: 5 }, {}]) {
    assert.equal(await kindOf(fetchCatalogAllPages('MLB1', viaParser({ results: [], paging }))), 'paging-inconsistente', JSON.stringify(paging));
  }
});

t('R3 brecha: outros paging invalidos tambem falham fechado (negativo, NaN, nao inteiro, offset/limit faltando ou negativo, string, array, 0, false), com results vazio ou nao', async () => {
  const bads: unknown[] = [
    { total: -1, offset: 0, limit: 100 }, { total: Number.NaN, offset: 0, limit: 100 }, { total: 1.5, offset: 0, limit: 100 },
    { total: 5, offset: 0 }, { total: 5, limit: 100 }, { total: 5, offset: -1, limit: 100 }, { total: 5, offset: 0, limit: -1 },
    'x', [], 0, false,
  ];
  for (const paging of bads) {
    for (const results of [[], [{ item_id: 'MLB1', price: 1, seller_id: 1, condition: 'new' }]]) {
      assert.equal(await kindOf(fetchCatalogAllPages('MLB1', viaParser({ results, paging }))), 'paging-inconsistente', JSON.stringify([paging, results.length]));
    }
  }
});

t('R3 brecha: paging AUSENTE de fato (chave ausente ou null) segue valendo vazio SO na 1a pagina com zero itens brutos; com itens continua paging-ausente', async () => {
  for (const body of [{ results: [] }, { results: [], paging: null }]) {
    const r = await fetchCatalogAllPages('MLB1', viaParser(body));
    assert.deepEqual([r.items.length, r.total, r.emptyWithoutPaging], [0, 0, true]);
  }
  const one = { results: [{ item_id: 'MLB1', price: 1, seller_id: 1, condition: 'used' }] }; // so bruto nao-new
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', viaParser(one))), 'paging-ausente');
  const srv = mockServer(mkItems(250), { mutate: (p, c) => (c === 2 ? parseMeliCatalogPage({ results: [] }, 100) : p) });
  assert.equal(await kindOf(fetchCatalogAllPages('MLB1', srv.fetchPage)), 'paging-ausente'); // vazio sem paging fora da 1a pagina
});

t('R3 brecha: parse -- paging valido continua passando (inclusive total 0 e offset/limit zero); invalido nao vira null "ausente"', () => {
  assert.deepEqual(parseMeliCatalogPage({ results: [], paging: { total: 0, offset: 0, limit: 100 } }).paging, { total: 0, offset: 0, limit: 100 });
  const bad = parseMeliCatalogPage({ results: [], paging: { total: 5 } });
  assert.equal(bad.pagingInvalid, true);
  assert.equal(parseMeliCatalogPage({ results: [] }).pagingInvalid ?? false, false);
});

t('erro no summary: sanitizeErrorForSummary corta em 200 caracteres e REDIGE Bearer/access_token/refresh_token/client_secret antes de cortar', () => {
  const secret = 'APP_USR-1234567890-abcdef-SECRETVALUE';
  const raw = `Falha ao renovar token: ${'x'.repeat(50)} {"access_token":"${secret}","refresh_token":"TG-REFRESHSECRET","client_secret":"CS-SECRET"} Authorization: Bearer ${secret} access_token=${secret}`;
  const out = sanitizeErrorForSummary(raw);
  assert.ok(out.length <= 200 + 1, `tamanho ${out.length}`);
  for (const s of ['SECRETVALUE', 'REFRESHSECRET', 'CS-SECRET', 'APP_USR-1234567890']) assert.ok(!out.includes(s), `vazou ${s}`);
  // segredo logo antes do corte tambem nao vaza pela metade
  const edge = 'a'.repeat(190) + ' Bearer ' + secret;
  const outEdge = sanitizeErrorForSummary(edge);
  assert.ok(!outEdge.includes('APP_USR') && !outEdge.includes('SECRET'));
  assert.equal(sanitizeErrorForSummary('HTTP 500 (offset 100)'), 'HTTP 500 (offset 100)'); // mensagem curta e inocente intacta
  assert.equal(sanitizeErrorForSummary(''), '');
});

t('erro no summary: no caminho paginado, o texto do erro (com token) NAO chega ao outcome.error nem ao CatalogPagingError', async () => {
  const leak = 'Mercado Livre auth falhou: {"access_token":"APP_USR-LEAKME","message":"' + 'y'.repeat(400) + '"} Bearer APP_USR-LEAKME';
  const r = await fetchMasterCatalogs(['A'], async (ref) => (await fetchCatalogAllPages(ref, async () => { throw new Error(leak); }, { retries: 0 })).items, { retries: 0 });
  assert.equal(r.outcomes[0].status, 'failed');
  assert.ok(!(r.outcomes[0].error ?? '').includes('LEAKME'));
  assert.ok((r.outcomes[0].error ?? '').length <= 260); // prefixo [kind] ref + ate 200
  const plain = await fetchMasterCatalogs(['A'], async () => { throw new Error(leak); }, { retries: 0 }); // fetchFn generico (fora da paginacao) tambem
  assert.ok(!(plain.outcomes[0].error ?? '').includes('LEAKME'));
});

t('legado intacto: fetchSnapshots/mercado-livre-auth/processCatalogGroup nao usam sanitizeErrorForSummary (comportamento do legado inalterado)', () => {
  const cp = fs.readFileSync(new URL('../src/server/collector/collect-prices.ts', import.meta.url), 'utf8');
  const legacyFn = cp.slice(cp.indexOf('const processCatalogGroup'), cp.indexOf('const tasks:'));
  assert.ok(!legacyFn.includes('sanitizeErrorForSummary'));
  const ml = fs.readFileSync(new URL('../src/server/collector/sources/mercado-livre.ts', import.meta.url), 'utf8');
  assert.ok(!ml.includes('sanitizeErrorForSummary'));
});

Promise.all(pending)
  .then(() => console.log(`${n} testes ok`))
  .catch((e) => { console.error(e); process.exit(1); });

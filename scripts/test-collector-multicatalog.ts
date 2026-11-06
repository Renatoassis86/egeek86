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
import {
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

Promise.all(pending)
  .then(() => console.log(`${n} testes ok`))
  .catch((e) => { console.error(e); process.exit(1); });

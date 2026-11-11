/**
 * Teste da AMAZON NA MÉDIA ÚNICA (ADR 0010, fase 1; flag PRICE_AMAZON_MODE = off | shadow | on).
 *   Parte 1 (pura, sem banco):  npx tsx scripts/test-amazon-media.ts
 *   Parte 2 (banco, SÓ LEITURA): npx tsx --conditions=react-server --env-file=.env.local scripts/test-amazon-media.ts
 * Cobre: a função única da flag; paridade do modo off (nenhuma mudança sem Amazon); sombra; modo on (peso 1 por oferta-dia por ASIN);
 * frescor de 24 h por confirmação; Amazon-only (mediana de 14 dias do próprio ASIN); régua de 10%; texto da mensagem (carimbo, sem outra loja).
 * Os preços são valores de teste de funções puras (nada é gravado nem exibido ao cliente). A parte 2 lê dados reais.
 */
import {
  AMAZON_FRESH_MAX_AGE_MS,
  amazonCountsIn,
  amazonScope,
  parseAmazonMode,
} from '../src/lib/pricing/amazon-mode';
import {
  computeDayState,
  computeLiveMin,
  computeLiveMinFromOffers,
  ownSeriesMedian,
  type OfferDayRow,
  type OfferInput,
} from '../src/lib/pricing/daily-state';
import { ofertaFresca } from '../src/lib/pricing/lojas-hoje';
import { summarizeAmazonShadow, type AmazonShadowDiff } from '../src/lib/pricing/amazon-shadow';
import { chooseInsight, type OfferCardInput } from '../src/lib/pricing/offer-card-model';
import { amazonReference, evaluateProductV2, type DayPoint, type OfferFact, type ProductFacts } from '../src/lib/messaging/group-rules';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}
function eq<T>(a: T, b: T, name: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b });
}

const H = 3_600_000;
const MIN = 60_000;

// ---------------------------------------------------------------------------
// 1) A flag: uma função só; valor desconhecido = off (falha fechada)
// ---------------------------------------------------------------------------
eq(parseAmazonMode(undefined), 'off', 'flag ausente = off');
eq(parseAmazonMode(''), 'off', 'flag vazia = off');
eq(parseAmazonMode('ON'), 'on', 'ON (maiúsculo) = on');
eq(parseAmazonMode(' shadow '), 'shadow', 'shadow com espaços');
eq(parseAmazonMode('1'), 'off', 'valor desconhecido = off');
eq(parseAmazonMode('true'), 'off', 'true = off (só on liga)');
eq(amazonScope('off'), 'exclude', 'off exclui');
eq(amazonScope('shadow'), 'exclude', 'shadow exclui (o público lê como off)');
eq(amazonScope('on'), 'include', 'on inclui');
ok(amazonCountsIn('on', 'games'), 'on + games conta');
ok(amazonCountsIn('on', 'livros') && amazonCountsIn('on', 'esporte') && !amazonCountsIn('off', 'games') && !amazonCountsIn('shadow', 'livros'), 'on conta em todas as lojas (dono, 2026-11-11); off e shadow não');
ok(!amazonCountsIn('off', 'games') && !amazonCountsIn('shadow', 'games'), 'off e shadow nunca contam');
ok(AMAZON_FRESH_MAX_AGE_MS === 24 * H, 'frescor da Amazon = 24 h');

// ---------------------------------------------------------------------------
// 2) Média oferta-dia com e sem Amazon (peso 1 por ASIN) e frescor por confirmação
// ---------------------------------------------------------------------------
const NOW = new Date('2026-11-11T15:00:00Z'); // 11/11 12:00 em Brasília
const TODAY = '2026-11-11';
function row(day: string, cents: number, at: string): OfferDayRow {
  return { day, medianCents: cents, lastCents: cents, minCents: cents, maxCents: cents, nCollected: 1, lastObservedAt: new Date(at) };
}
const ml = (id: string, cents: number): OfferInput => ({
  offerId: id, storeKey: `s-${id}`, networkId: 'ml', sellerId: `s-${id}`, active: true, isAmazon: false,
  rows: [row(TODAY, cents, '2026-11-11T14:00:00Z')],
});
// ASIN: UMA cotação antiga (preço estável desde 09/11), confirmado `confH` horas antes de NOW.
const asin = (id: string, cents: number, confH: number | null, over: Partial<OfferInput> = {}): OfferInput => ({
  offerId: id, storeKey: `rede:amazon`, networkId: 'amz', sellerId: null, active: true, isAmazon: true,
  freshness: confH == null ? null : { confirmedAt: new Date(NOW.getTime() - confH * H), maxAgeMs: AMAZON_FRESH_MAX_AGE_MS },
  rows: [row('2026-11-09', cents, '2026-11-09T03:00:00Z')],
  ...over,
});
const base3 = [ml('a', 10000), ml('b', 11000), ml('c', 12000)];

// Sem Amazon (paridade): nenhuma diferença quando nenhuma oferta tem `isAmazon`/`freshness`
let st = computeDayState(TODAY, NOW, base3);
ok(st.avgCents === 11000 && st.nOffers === 3 && st.minCents === 10000 && st.quality === 'complete', 'sem Amazon: média 11000, n 3, mínimo 10000', st);
const legacyShape = base3.map((o) => ({ offerId: o.offerId, storeKey: o.storeKey, networkId: o.networkId, sellerId: o.sellerId, active: o.active, rows: o.rows }));
eq(computeDayState(TODAY, NOW, legacyShape), st, 'sem Amazon: OfferInput antigo (sem os campos novos) dá resultado idêntico');

// Frescor: última cotação há ~60 h; o regime antigo (48 h) a deixa stale; a confirmação de 2 h a mantém
st = computeDayState(TODAY, NOW, [...base3, asin('z', 9000, 2)]);
ok(st.nOffers === 4 && st.members.z === 9000 && st.minCents === 9000, 'Amazon confirmada há 2 h entra mesmo com a última cotação de 60 h', st);
st = computeDayState(TODAY, NOW, [...base3, asin('z', 9000, null)]);
ok(st.nOffers === 3 && st.staleOffers === 1 && !('z' in st.members), 'sem confirmação (regime antigo de 48 h): a mesma oferta é stale', st);
// Limite de 24 h
st = computeDayState(TODAY, NOW, [...base3, asin('z', 9000, 24)]);
ok('z' in st.members, 'confirmada há exatamente 24 h: entra');
st = computeDayState(TODAY, NOW, [...base3, { ...asin('z', 9000, 24), freshness: { confirmedAt: new Date(NOW.getTime() - 24 * H - 1), maxAgeMs: AMAZON_FRESH_MAX_AGE_MS } }]);
ok(!('z' in st.members) && st.staleOffers === 1 && st.nOffers === 3, 'confirmada há 24 h + 1 ms: sai da média, conta como stale (não removida)', st);
st = computeDayState(TODAY, NOW, [...base3, asin('z', 9000, 26)]);
ok(!('z' in st.members) && st.staleOffers === 1, '26 h sem confirmação: sai da média');
// Reentrada: nova confirmação traz de volta
st = computeDayState(TODAY, NOW, [...base3, asin('z', 9000, 0.1)]);
ok('z' in st.members, 'nova confirmação: reentra na média');
// Ausência na busca (consecutive_miss_count > 0 vira active=false no carregador): não é carregada
st = computeDayState(TODAY, NOW, [...base3, asin('z', 9000, 1, { active: false })]);
ok(!('z' in st.members), 'Amazon inativa/ausente da busca não é carregada para o dia sem cotação');
// Dia fechado: referência anterior à confirmação => idade 0 (preço não mudou entre a cotação e a confirmação)
st = computeDayState('2026-11-10', NOW, [asin('z', 9000, 1), ml('a', 10000), ml('b', 11000), ml('c', 12000)].map((o) => (o.rows.length && o.offerId !== 'z' ? { ...o, rows: [row('2026-11-10', o.rows[0].lastCents, '2026-11-10T14:00:00Z')] } : o)));
ok('z' in st.members && st.nOffers === 4, 'dia fechado 10/11: ASIN estável confirmada depois do fim do dia entra');
// Peso 1 por ASIN: 2 ASIN + 3 lojas = 5 oferta-dias
st = computeDayState(TODAY, NOW, [...base3, asin('z1', 9000, 1), asin('z2', 8000, 2)]);
ok(st.nOffers === 5 && st.avgCents === (10000 + 11000 + 12000 + 9000 + 8000) / 5, 'peso 1 por ASIN (média simples de 5 oferta-dias)', st);
ok(st.avgCents! >= st.minCents! && st.avgCents! <= (st.maxCents as number), 'média fica entre o mínimo e o máximo');
// A mesma oferta vale 1 mesmo com várias cotações no dia (mediana do dia)
const multi = asin('z', 9000, 1, { rows: [{ ...row(TODAY, 9000, '2026-11-11T13:00:00Z'), nCollected: 5, medianCents: 9000 }] });
st = computeDayState(TODAY, NOW, [...base3, multi]);
ok(st.nOffers === 4 && st.nQuotes === 3 + 5, 'oferta coletada várias vezes continua valendo 1');
// Menor preço do momento
const live = computeLiveMin([ml('a', 10000), asin('z', 9000, 3)], NOW);
ok(live?.minCents === 9000 && live.offerId === 'z', 'menor preço do momento considera a Amazon fresca por confirmação');
ok(computeLiveMin([ml('a', 10000), asin('z', 9000, 30)], NOW)?.minCents === 10000, 'menor preço do momento: Amazon com 30 h sem confirmar fica fora');
// Preço agora / lojas de hoje (cadastro): teto próprio da oferta
const lv = (cents: number, ageH: number, max?: number) => {
  const at = new Date(NOW.getTime() - ageH * H);
  return { offerId: `o${cents}`, priceCents: cents, quotedAt: at, checkedAt: at, ...(max ? { maxAgeMs: max } : {}) };
};
ok(ofertaFresca(lv(9000, 20, AMAZON_FRESH_MAX_AGE_MS), NOW), 'lojas de hoje: Amazon com 20 h de confirmação é fresca');
ok(!ofertaFresca(lv(9000, 25, AMAZON_FRESH_MAX_AGE_MS), NOW), 'lojas de hoje: Amazon com 25 h não é fresca');
ok(ofertaFresca(lv(9000, 30), NOW), 'lojas de hoje: demais redes seguem 48 h (30 h é fresca)');
ok(computeLiveMinFromOffers([lv(9000, 20, AMAZON_FRESH_MAX_AGE_MS), lv(10000, 5)], NOW)?.minCents === 9000, 'preço agora: Amazon 20 h entra');
ok(computeLiveMinFromOffers([lv(9000, 25, AMAZON_FRESH_MAX_AGE_MS), lv(10000, 5)], NOW)?.minCents === 10000, 'preço agora: Amazon 25 h fica fora');

// Mediana de 14 dias do próprio ASIN (Amazon-only)
const ownOffer = (nDays: number, cents = 10000): OfferInput => ({
  offerId: 'solo', storeKey: 'rede:amazon', networkId: 'amz', sellerId: null, active: true, isAmazon: true,
  freshness: { confirmedAt: new Date(NOW.getTime() - 1 * H), maxAgeMs: AMAZON_FRESH_MAX_AGE_MS },
  rows: [row(`2026-11-${String(11 - nDays).padStart(2, '0')}`, cents, `2026-11-${String(11 - nDays).padStart(2, '0')}T12:00:00Z`)],
});
eq(ownSeriesMedian(ownOffer(8), TODAY, NOW), { cents: 10000, days: 8 }, 'mediana própria: preço estável com 8 dias de série (carry-forward por confirmação)');
eq(ownSeriesMedian(ownOffer(6), TODAY, NOW), null, 'mediana própria: 6 dias de série = insuficiente (mínimo 7)');
const twoPrices: OfferInput = { ...ownOffer(9), rows: [row('2026-11-02', 10000, '2026-11-02T12:00:00Z'), row('2026-11-08', 9000, '2026-11-08T12:00:00Z')] };
const m2 = ownSeriesMedian(twoPrices, TODAY, NOW);
ok(m2 != null && m2.days === 9 && m2.cents === 10000, 'mediana própria: 6 dias a 10000 e 3 a 9000 => 10000', m2);

// Resumo da sombra
const diffs: AmazonShadowDiff[] = [
  { productId: 'aaaaaaaa-1', day: TODAY, amazonOffers: 1, nPublic: 3, nWith: 4, avgPublicCents: 10000, avgWithCents: 9000, avgChangePct: -10, minPublicCents: 9500, minWithCents: 8000, amazonIsMin: true },
  { productId: 'bbbbbbbb-2', day: TODAY, amazonOffers: 2, nPublic: 3, nWith: 5, avgPublicCents: 10000, avgWithCents: 10100, avgChangePct: 1, minPublicCents: 9500, minWithCents: 9500, amazonIsMin: false },
  { productId: 'cccccccc-3', day: TODAY, amazonOffers: 1, nPublic: 2, nWith: 3, avgPublicCents: null, avgWithCents: 9000, avgChangePct: null, minPublicCents: 9500, minWithCents: 9000, amazonIsMin: true },
];
const sh = summarizeAmazonShadow(diffs);
ok(sh.productsCompared === 3 && sh.avgChanged === 2 && sh.absChangeOver5 === 1 && sh.absChangeOver2 === 1 && sh.maxAbsChangePct === 10 && sh.amazonIsMin === 2 && sh.top[0].p === 'aaaaaaaa', 'resumo da sombra', sh);
ok(JSON.stringify(sh).length < 3000, 'resumo da sombra cabe no teto de collector_runs.meta');

// ---------------------------------------------------------------------------
// 3) Mensagens: off idêntico a hoje; shadow idêntico a off; on com média; Amazon-only; régua de 10%
// ---------------------------------------------------------------------------
const NOWM = new Date('2026-11-11T14:00:00Z'); // 11:00 Brasília
const TODAYM = '2026-11-11';
const flat = (n: number, v: number, endDay = '2026-11-10'): DayPoint[] => {
  const out: DayPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(`${endDay}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ day: d.toISOString().slice(0, 10), minCents: v });
  }
  return out;
};
function offerF(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Jogo Tomba Edicao Especial Nintendo Switch Fisico', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 826,
    confirmedAt: new Date(NOWM.getTime() - 10 * MIN), priceSince: new Date(NOWM.getTime() - 3 * H),
    affiliateLinkPending: false, quarantined: false, missCount: 0, returnedAt: null, ...over,
  };
}
const amzF = (over: Partial<OfferFact> = {}) =>
  offerF({ offerId: 'amz', priceCents: 9400, networkSlug: 'amazon', networkName: 'Amazon', sellerId: null, sellerReputation: null, sellerTotalSales: null, ...over });
function prod(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'p1', masterName: 'Tomba! Edição Especial', vertical: 'games', productType: 'game', platformLabel: 'Switch', format: 'physical', catalogGate: 'approved',
    offers: [amzF(), offerF({ offerId: 'b', priceCents: 11000 }), offerF({ offerId: 'c', priceCents: 12000 }), offerF({ offerId: 'd', priceCents: 12500 })],
    avg: { cents: 11500, distinctOffers: 4, offerDays: 43, spanDays: 17, eligible: true },
    minEvent: null,
    record: { since: new Date('2026-11-03T15:00:00Z'), minCents: 10000 },
    series: flat(8, 10500),
    amazonSeries: flat(8, 10000),
    ...over,
  };
}
const baseCtx = { now: NOWM, maxAgeMin: 120, adTag: '#publicidade', amazonMaxAgeMin: 60, amazonPaused: false };
const amzCand = (r: ReturnType<typeof evaluateProductV2>) => r.candidates.find((c) => c.networkSlug === 'amazon');
const strip = (r: ReturnType<typeof evaluateProductV2>) => JSON.stringify(r);

// 3a) PARIDADE: off e shadow são idênticos ao comportamento sem a flag (nenhum campo novo no resultado)
for (const p of [prod(), prod({ amazonOnly: true }), prod({ offers: [offerF({ offerId: 'a', priceCents: 9400 }), offerF({ offerId: 'b', priceCents: 11000 }), offerF({ offerId: 'c', priceCents: 12000 })], amazonSeries: [] })]) {
  const none = strip(evaluateProductV2(p, baseCtx));
  ok(strip(evaluateProductV2(p, { ...baseCtx, amazonMode: 'off' })) === none, 'mensagens: modo off == sem flag (paridade exata)');
  ok(strip(evaluateProductV2(p, { ...baseCtx, amazonMode: 'shadow' })) === none, 'mensagens: modo shadow == sem flag (nada muda)');
}
let r = evaluateProductV2(prod(), baseCtx);
let az = amzCand(r);
ok(!!az && az.trigger === 'OK1' && !az.sendable && az.notSendableReason === 'abaixo_da_media_menos_de_10pct', 'off: a Amazon dispara OK1 mas a régua de 10% a bloqueia por falta de média (como hoje)', az?.notSendableReason);

// 3b) ON, Amazon com média única (inclui a Amazon): passa na régua normal
const onCtx = { ...baseCtx, amazonMode: 'on' as const };
r = evaluateProductV2(prod(), onCtx);
az = amzCand(r);
ok(!!az && az.sendable && az.belowAvgPct != null && az.belowAvgPct >= 10 && az.avgCents === 11500, 'on: Amazon 18% abaixo da média única passa na régua de 10%', { az: az?.notSendableReason, pct: az?.belowAvgPct });
ok(!!az && az.texts.telegram.includes('Preço na Amazon em 11/11 às 10:50, sujeito a alteração.') && az.texts.whatsapp.includes('Preço na Amazon em 11/11 às 10:50, sujeito a alteração.'), 'on: carimbo da Amazon obrigatório nos dois canais', az?.texts.telegram);
ok(!!az && /Vs\. média do mercado/.test(az.texts.telegram) && !/média das lojas/i.test(az.texts.telegram + az.texts.whatsapp), 'on: "média do mercado", nunca "média das lojas"', az?.texts.telegram);
ok(!!az && !/mercado ?livre|shopee|magalu/i.test(az.texts.telegram.replace(/média do mercado/gi, '')) && !/mercado ?livre|shopee|magalu/i.test(az.texts.whatsapp.replace(/média do mercado/gi, '')), 'on: mensagem da Amazon não cita outra loja', az?.texts.telegram);
ok(!!az && textProblems(az.texts.telegram, 'tg').length === 0 && textProblems(az.texts.whatsapp, 'wa').length === 0 && !/afiliad/i.test(az.texts.telegram + az.texts.whatsapp), 'on: texto passa na barreira e não diz "afiliado"');
ok(!!az && !az.texts.telegram.includes('11000') && !az.texts.telegram.includes('R$ 110,00') && !az.texts.telegram.includes('R$ 120,00'), 'on: nenhum preço de outra loja no texto');
// régua: 6% abaixo da média = bloqueia
r = evaluateProductV2(prod({ offers: [amzF({ priceCents: 10800 }), offerF({ offerId: 'b', priceCents: 11000 }), offerF({ offerId: 'c', priceCents: 12000 }), offerF({ offerId: 'd', priceCents: 12500 })], amazonSeries: flat(8, 11500) }), onCtx);
az = amzCand(r);
ok(!az || !az.sendable, 'on: Amazon só 6% abaixo da média continua bloqueada pela régua de 10%', az?.belowAvgPct);
// Amazon 9% x 10%: fronteira
r = evaluateProductV2(prod({ avg: { cents: 10000, distinctOffers: 4, offerDays: 43, spanDays: 17, eligible: true }, offers: [amzF({ priceCents: 9000 }), offerF({ offerId: 'b', priceCents: 11000 }), offerF({ offerId: 'c', priceCents: 12000 }), offerF({ offerId: 'd', priceCents: 12500 })], amazonSeries: flat(8, 10000) }), onCtx);
ok(!!amzCand(r)?.sendable, 'on: exatamente 10,0% abaixo da média passa');
r = evaluateProductV2(prod({ avg: { cents: 10000, distinctOffers: 4, offerDays: 43, spanDays: 17, eligible: true }, offers: [amzF({ priceCents: 9001 }), offerF({ offerId: 'b', priceCents: 11000 }), offerF({ offerId: 'c', priceCents: 12000 }), offerF({ offerId: 'd', priceCents: 12500 })], amazonSeries: flat(8, 10000) }), onCtx);
ok(!amzCand(r)?.sendable, 'on: 9,99% abaixo da média não passa');
// Fora de games: nada muda
ok(amazonReference({ vertical: 'livros', amazonOnly: false }, { ownMedian14: null }, { cents: 11500, distinctOffers: 4 }, 'on') !== null, 'on em livros: a Amazon compara com a média do mercado');
// Os alertas das demais lojas não mudam com a flag (produto sem Amazon)
const noAmz = prod({ offers: [offerF({ offerId: 'a', priceCents: 9400 }), offerF({ offerId: 'b', priceCents: 11000 }), offerF({ offerId: 'c', priceCents: 12000 })], amazonSeries: [], avg: { cents: 11500, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true }, series: flat(8, 10000) });
ok(strip(evaluateProductV2(noAmz, onCtx)) === strip(evaluateProductV2(noAmz, baseCtx)), 'on: produto sem Amazon gera exatamente as mesmas mensagens que off (ML/Shopee intocados)');

// 3c) Amazon-only: menos de 3 ASIN => mediana de 14 dias do próprio ASIN e piso de lojas dispensado
const solo = (cents: number, own: OfferFact['ownMedian14'], extra: Partial<ProductFacts> = {}) =>
  prod({ offers: [amzF({ priceCents: cents, ownMedian14: own })], avg: null, series: [], amazonSeries: flat(9, 10000), amazonOnly: true, ...extra });
r = evaluateProductV2(solo(9000, { cents: 10000, days: 10 }), onCtx);
az = amzCand(r);
ok(!!az && az.sendable && Math.round(az.belowAvgPct as number) === 10, 'Amazon-only: 10% abaixo da mediana de 14 dias do próprio ASIN passa', { r: az?.notSendableReason, blocked: r.blocked });
ok(!!az && /Vs\. mediana de 10 dias deste anúncio/.test(az.texts.telegram) && !/média das lojas/i.test(az.texts.telegram) && !/média/i.test(az.texts.telegram.replace(/Vs\. mediana[^\n]*/g, '')), 'Amazon-only: rótulo "mediana ... deste anúncio", sem "média das lojas"', az?.texts.telegram);
ok(!!az && az.texts.telegram.includes('Preço na Amazon em 11/11 às 10:50, sujeito a alteração.') && textProblems(az.texts.telegram, 'tg').length === 0, 'Amazon-only: carimbo e barreira de texto ok');
r = evaluateProductV2(solo(9100, { cents: 10000, days: 10 }), onCtx);
ok(!amzCand(r)?.sendable, 'Amazon-only: 9% abaixo da mediana própria = bloqueada');
r = evaluateProductV2(solo(9000, { cents: 10000, days: 6 }), onCtx);
ok(!amzCand(r)?.sendable, 'Amazon-only: série própria de 6 dias (mínimo 7) = sem referência, bloqueada');
r = evaluateProductV2(solo(9000, null), onCtx);
ok(!amzCand(r)?.sendable, 'Amazon-only: sem mediana própria = bloqueada');
r = evaluateProductV2(solo(9000, { cents: 10000, days: 10 }), baseCtx);
ok(!amzCand(r)?.sendable && r.blocked.some((b) => b.reasons.some((x) => x.startsWith('lojas_1'))), 'off: Amazon-only segue bloqueada (piso de 3 lojas), como hoje');
// Amazon-only com 3+ ASIN: média na Amazon
const trio = prod({
  offers: [amzF({ offerId: 'amz1', priceCents: 9000 }), amzF({ offerId: 'amz2', priceCents: 11000 }), amzF({ offerId: 'amz3', priceCents: 12000 })],
  avg: { cents: 11000, distinctOffers: 3, offerDays: 20, spanDays: 8, eligible: true }, series: [], amazonSeries: flat(8, 10000), amazonOnly: true,
});
r = evaluateProductV2(trio, onCtx);
az = r.candidates.find((c) => c.offerIds[0] === 'amz1');
ok(!!az && az.sendable && /Vs\. média na Amazon/.test(az.texts.telegram) && !/média das lojas|do mercado/i.test(az.texts.telegram), 'Amazon-only com 3 ASIN: "média na Amazon", nunca "das lojas"', az?.texts.telegram ?? r.blocked);
// referência pura
eq(amazonReference({ vertical: 'games', amazonOnly: false }, { ownMedian14: { cents: 10000, days: 10 } }, null, 'on'), null, 'produto com outras lojas e sem média: sem referência (a mediana própria só vale para Amazon-only)');
eq(amazonReference({ vertical: 'games', amazonOnly: true }, { ownMedian14: { cents: 10000, days: 7 } }, null, 'on')?.scope, 'own', 'mediana própria com exatamente 7 dias vale');
eq(amazonReference({ vertical: 'games', amazonOnly: true }, { ownMedian14: { cents: 10000, days: 10 } }, null, 'off'), null, 'off: nunca há referência');

if (process.env.AMAZON_TEST_VERBOSE) {
  console.log('--- on, com média ---',  amzCand(evaluateProductV2(prod(), onCtx))?.texts.telegram);
  console.log('--- on, Amazon-only ---',  amzCand(evaluateProductV2(solo(9000, { cents: 10000, days: 10 }), onCtx))?.texts.telegram);
}

// 3d) Cartão de oferta: o insight da Amazon só compara com a média no modo on
const card = (over: Partial<OfferCardInput>): OfferCardInput => ({
  title: 'Jogo X', platformLabel: 'PS5', store: 'Amazon', isAmazon: true, priceCents: 8000, checkedAt: NOW, imageUrl: null, today: TODAY,
  stats: { recordCents: null, seriesFirstDay: null, measuredDays: 0, avgCents: 10000, distinctOffers: 4, prev: null }, ...over,
});
ok(chooseInsight(card({})) === null, 'cartão off: Amazon sem insight de média');
ok(chooseInsight(card({ amazonAvg: 'market' }))?.text === 'R$ 20 abaixo da média do mercado', 'cartão on: "abaixo da média do mercado"', chooseInsight(card({ amazonAvg: 'market' })));
ok(chooseInsight(card({ amazonAvg: 'amazon' }))?.text === 'R$ 20 abaixo da média na Amazon', 'cartão on, só Amazon: "média na Amazon"');
ok(chooseInsight(card({ isAmazon: false, store: 'Mercado Livre' }))?.text === 'R$ 20 abaixo da média das lojas', 'cartão demais lojas: texto de sempre');

// ---------------------------------------------------------------------------
// 4) PARTE 2 (banco, só leitura): paridade do modo off contra o SQL original e do modo on
// ---------------------------------------------------------------------------
async function dbPart() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL ausente: parte 2 (banco) ignorada. Rode com --conditions=react-server --env-file=.env.local');
    return;
  }
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db');
  const { loadOffers } = await import('../src/server/pricing/price-daily');
  const { loadLiveOffers } = await import('../src/server/pricing/price-metrics-v2');
  const { eligibleOfferSql } = await import('../src/server/pricing/eligibility-sql');
  const { PRICE_DAILY_REGIME_START, addDays, OFFER_ACTIVE_DAYS, spDay } = await import('../src/lib/pricing/daily-state');
  type R = Record<string, unknown>;
  const now = new Date();
  const today = spDay(now);
  const from = addDays(PRICE_DAILY_REGIME_START, -OFFER_ACTIVE_DAYS);

  // SQL ORIGINAL (antes da flag), copiado literalmente de `loadOffers` e `loadLiveOffers`: a referência da paridade.
  const origOffers = async (ids: string[]): Promise<Map<string, OfferInput[]>> => {
    const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    const rows = await db.execute<R>(sql`
      SELECT o.master_product_id, o.id AS offer_id, o.status = 'active' AS active, o.network_id, o.seller_id, n.slug AS net_slug,
             COALESCE(o.seller_id::text, 'rede:' || o.network_id::text) AS store_key,
             d.day::text AS day, d.median_cents, d.last_cents, d.min_cents, d.max_cents, d.n_collected, d.last_observed_at
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      INNER JOIN price_daily_offer d ON d.offer_id = o.id AND d.day >= ${from}::date
      WHERE o.master_product_id IN (${list}) AND ${eligibleOfferSql('o')}
      ORDER BY o.id, d.day`);
    const out = new Map<string, OfferInput[]>();
    const by = new Map<string, OfferInput & { amazon: boolean }>();
    for (const r of rows) {
      const oid = String(r.offer_id);
      let o = by.get(oid);
      if (!o) {
        o = { offerId: oid, storeKey: String(r.store_key), networkId: (r.network_id as string) ?? null, sellerId: (r.seller_id as string) ?? null, active: r.active === true, rows: [], amazon: String(r.net_slug) === 'amazon' };
        by.set(oid, o);
        const arr = out.get(String(r.master_product_id)) ?? [];
        arr.push(o);
        out.set(String(r.master_product_id), arr);
      }
      o.rows.push({ day: String(r.day), medianCents: Number(r.median_cents), lastCents: Number(r.last_cents), minCents: Number(r.min_cents), maxCents: Number(r.max_cents), nCollected: Number(r.n_collected), lastObservedAt: new Date(r.last_observed_at as string) });
    }
    return out;
  };
  const dayKey = (offers: OfferInput[], d: string) => {
    const s = computeDayState(d, now, offers);
    return JSON.stringify([s.minCents, s.minOfferId, s.avgCents, s.medianCents, s.maxCents, s.nOffers, s.nStores, s.nQuotes, s.freshOffers, s.staleOffers, s.outlierOffers, s.quality, Object.entries(s.members).sort()]);
  };
  const days: string[] = [];
  for (let d = PRICE_DAILY_REGIME_START; d <= today; d = addDays(d, 1)) days.push(d);

  const amzProds = (await db.execute<R>(sql`
    SELECT DISTINCT o.master_product_id::text AS id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE n.slug = 'amazon' AND o.vertical = 'games'`)).map((r) => String(r.id));
  const plainProds = (await db.execute<R>(sql`
    SELECT m.id::text AS id FROM master_products m
    WHERE m.vertical = 'games' AND EXISTS (SELECT 1 FROM price_daily_offer d WHERE d.master_product_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.master_product_id = m.id AND n.slug = 'amazon')
    ORDER BY m.id LIMIT 400`)).map((r) => String(r.id));
  console.log(`banco: ${amzProds.length} produtos games com Amazon; ${plainProds.length} sem Amazon (amostra)`);

  const prevMode = process.env.PRICE_AMAZON_MODE;
  try {
    delete process.env.PRICE_AMAZON_MODE; // padrão = off
    for (const [label, ids] of [['sem Amazon', plainProds], ['com Amazon', amzProds]] as const) {
      let diffs = 0;
      let cmp = 0;
      let leaks = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const orig = await origOffers(chunk);
        const off = await loadOffers(db, chunk, from); // flag ausente = off
        for (const pid of chunk) {
          const o0 = (orig.get(pid) ?? []).filter((o) => !(o as OfferInput & { amazon?: boolean }).amazon);
          const o1 = off.get(pid) ?? [];
          if (o1.some((o) => o.isAmazon)) leaks++;
          for (const d of days) {
            cmp++;
            if (dayKey(o0, d) !== dayKey(o1, d)) diffs++;
          }
        }
      }
      ok(diffs === 0 && leaks === 0, `PARIDADE off (${label}): ${ids.length} produtos x ${days.length} dias = ${cmp} estados idênticos ao SQL original (sem Amazon); 0 ofertas Amazon vazando`, { diffs, leaks });
    }

    // Modo on: a Amazon entra, com peso 1 por ASIN, frescor 24 h; os demais membros não mudam de valor
    let withAmz = 0;
    let checked = 0;
    let bad = 0;
    for (let i = 0; i < amzProds.length; i += 100) {
      const chunk = amzProds.slice(i, i + 100);
      const off = await loadOffers(db, chunk, from, { amazon: 'exclude' });
      const on = await loadOffers(db, chunk, from, { amazon: 'include' });
      for (const pid of chunk) {
        const a = off.get(pid) ?? [];
        const b = on.get(pid) ?? [];
        const amzOn = b.filter((o) => o.isAmazon);
        if (amzOn.length) withAmz++;
        const s0 = computeDayState(today, now, a);
        const s1 = computeDayState(today, now, b);
        checked++;
        const amzIds = new Set(amzOn.map((o) => o.offerId));
        const amzMembers = Object.keys(s1.members).filter((k) => amzIds.has(k)).length;
        const nonAmzSame = Object.entries(s0.members).every(([k, v]) => s1.members[k] === v || s1.quality === 'gap');
        const inRange = s1.avgCents == null || (s1.minCents != null && s1.maxCents != null && s1.avgCents >= s1.minCents && s1.avgCents <= s1.maxCents);
        if (amzMembers > amzOn.length || !nonAmzSame || !inRange || s1.nOffers < s0.nOffers - 0) bad++;
      }
    }
    ok(bad === 0, `modo on (${checked} produtos, ${withAmz} com ofertas Amazon): peso <= 1 por ASIN, membros não-Amazon inalterados, média entre mínimo e máximo, n(on) >= n(off)`, { bad });

    // Preço agora / lojas de hoje: off não deixa a Amazon aparecer; on traz só a confirmada <= 24 h
    let liveBad = 0;
    for (const pid of amzProds.slice(0, 120)) {
      process.env.PRICE_AMAZON_MODE = 'off';
      const lOff = await loadLiveOffers(pid, now);
      process.env.PRICE_AMAZON_MODE = 'on';
      const lOn = await loadLiveOffers(pid, now);
      delete process.env.PRICE_AMAZON_MODE;
      const amzIds = new Set((await db.execute<R>(sql`SELECT o.id::text AS id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.master_product_id = ${pid}::uuid AND n.slug = 'amazon'`)).map((r) => String(r.id)));
      if (lOff.some((o) => amzIds.has(o.offerId))) liveBad++;
      if (lOn.filter((o) => amzIds.has(o.offerId)).some((o) => o.maxAgeMs !== AMAZON_FRESH_MAX_AGE_MS)) liveBad++;
      if (!lOff.every((o) => lOn.some((x) => x.offerId === o.offerId))) liveBad++;
    }
    ok(liveBad === 0, `preço agora (${Math.min(120, amzProds.length)} produtos): off sem Amazon; on com Amazon (teto 24 h) e demais ofertas iguais`, { liveBad });

    // Informativo: dias fechados já gravados com membros Amazon (corrigir com scripts/reprocess-amazon-state.ts)
    const contam = await db.execute<R>(sql`
      SELECT count(*)::int AS n FROM price_daily_state s
      WHERE s.day >= ${PRICE_DAILY_REGIME_START}::date AND s.quality IN ('complete','partial') AND EXISTS (
        SELECT 1 FROM jsonb_object_keys(s.members) k JOIN affiliate_offers o ON o.id::text = k JOIN affiliate_networks n ON n.id = o.network_id WHERE n.slug = 'amazon')`);
    console.log(`informativo: ${contam[0]?.n} linhas de price_daily_state já gravadas COM membros Amazon (o modo off as corrige no reprocesso)`);
  } finally {
    if (prevMode === undefined) delete process.env.PRICE_AMAZON_MODE;
    else process.env.PRICE_AMAZON_MODE = prevMode;
  }
}

dbPart()
  .catch((e) => {
    fails++;
    console.error('FALHOU na parte do banco:', e instanceof Error ? e.stack ?? e.message : e);
  })
  .finally(() => {
    console.log(fails ? `${fails} falha(s) em ${total}` : `${total}/${total} verificações ok (amazon na média)`);
    process.exit(fails ? 1 : 0);
  });

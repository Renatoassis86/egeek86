/**
 * Fase de formacao das lojas que NAO sao Games e virada na DATA DE CORTE (dono, 2026-11-11; ata 2026-11-11-fase-de-formacao-outras-lojas).
 * Funcoes puras, sem banco/rede. Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-regua-adaptativa.ts
 */
import { effectiveMinBelow, evaluateProductV2, RULES, type OfferFact, type ProductFacts } from '../src/lib/messaging/group-rules';
import { formatOfferMessage, MIN_AVG_OFFERS_CLAIM } from '../src/lib/messaging/group-messages';
import { DATA_DE_CORTE_FORMACAO, FORMACAO, emFaseDeFormacao, mediaSimples, minLojas } from '../src/lib/messaging/fase-formacao';

let ok = 0, bad = 0;
const eq = (n: string, a: unknown, b: unknown) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { bad++; console.error('FALHOU', n, a, b); } };

// ---- data de corte e emFaseDeFormacao (Brasilia = UTC-3) ----
eq('corte sugerida', DATA_DE_CORTE_FORMACAO, '2026-11-30');
const ANTES = new Date('2026-11-29T23:59:00-03:00');
const NA_VIRADA = new Date('2026-11-30T00:00:00-03:00');
const UM_MIN_ANTES = new Date('2026-11-29T23:59:59-03:00');
eq('livros antes do corte', emFaseDeFormacao('livros', ANTES), true);
eq('livros 23:59:59 do dia 29 ainda forma', emFaseDeFormacao('livros', UM_MIN_ANTES), true);
eq('livros 00:00 BRT do dia 30 virou', emFaseDeFormacao('livros', NA_VIRADA), false);
eq('livros depois', emFaseDeFormacao('livros', new Date('2026-12-05T12:00:00Z')), false);
eq('games nunca forma (antes)', emFaseDeFormacao('games', new Date('2026-11-11T12:00:00Z')), false);
for (const v of ['impressao3d', 'tecnologia', 'livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte']) eq(`${v} forma hoje`, emFaseDeFormacao(v, new Date('2026-11-11T12:00:00Z')), true);
eq('corte injetavel (teste)', emFaseDeFormacao('livros', new Date('2026-11-11T12:00:00Z'), '2026-11-11'), false);

// ---- mínimos relaxados e régua ----
const HOJE = new Date('2026-11-11T15:00:00Z');
const DEPOIS = new Date('2026-12-01T15:00:00Z');
eq('lojas minimas na formacao', minLojas('livros', HOJE, RULES.MIN_STORES), FORMACAO.MIN_LOJAS);
eq('lojas minimas depois = 3', minLojas('livros', DEPOIS, RULES.MIN_STORES), 3);
eq('games sempre 3 lojas', minLojas('games', HOJE, RULES.MIN_STORES), 3);
eq('games sempre 10', effectiveMinBelow({ vertical: 'games' }, undefined, HOJE), 10);
eq('livros formacao = piso', effectiveMinBelow({ vertical: 'livros' }, undefined, HOJE), RULES.EARLY_MIN_BELOW_AVG_PCT);
eq('livros depois da corte = 10', effectiveMinBelow({ vertical: 'livros' }, undefined, DEPOIS), 10);
eq('contexto 0 (legado) segue 0', effectiveMinBelow({ vertical: 'livros' }, 0, HOJE), 0);

// ---- media simples ----
eq('menos de 3 ofertas = sem media', mediaSimples([10000, 12000]), null);
eq('media de 3', mediaSimples([10000, 12000, 14000]), { cents: 12000, ofertas: 3, fora: 0 });
eq('preco sentinela fica fora', mediaSimples([10000, 12000, 14000, 100000000]), { cents: 12000, ofertas: 3, fora: 1 });
eq('sobrando <3 dentro da faixa = null', mediaSimples([10000, 12000, 100000000]), null);

// ---- avaliacao ponta a ponta (V2) antes e depois da corte ----
const mkOffer = (id: string, price: number, over: Partial<OfferFact> = {}, now = HOJE): OfferFact => ({
  offerId: id, priceCents: price, slug: `s-${id}`, title: 'Livro Exemplo Capa Comum', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
  sellerId: `v-${id}`, sellerReputation: '5_green', sellerTotalSales: 500,
  confirmedAt: new Date(now.getTime() - 5 * 60_000), priceSince: new Date(now.getTime() - 3 * 3600_000),
  affiliateLinkPending: false, quarantined: false, missCount: 0, returnedAt: null, ...over,
});
const mkProd = (now: Date, offers: OfferFact[], over: Partial<ProductFacts> = {}): ProductFacts => ({
  masterProductId: 'pl1', masterName: 'Livro Exemplo', vertical: 'livros', productType: 'general', platformLabel: null, format: 'unknown', catalogGate: 'approved',
  offers, avg: null, minEvent: null, record: null, series: [], amazonSeries: [], ...over,
});
const ctxAt = (now: Date) => ({ now, maxAgeMin: 180, adTag: '#publicidade', minBelowAvgPct: undefined as number | undefined });
const g2 = (now: Date, offers: OfferFact[], over: Partial<ProductFacts> = {}) => evaluateProductV2(mkProd(now, offers, over), ctxAt(now));

// 3 ofertas, 2 lojas distintas? (vendedores distintos = lojas distintas) -> 3 lojas; uso mesmo vendedor em 2 para provar o piso de 2 lojas
const tres = [mkOffer('a', 9000), mkOffer('b', 10000), mkOffer('c', 11000)];
let r = g2(HOJE, tres);
const c1 = r.candidates.find((c) => c.trigger === 'G2');
eq('formacao: G2 por media simples sai (sem elegibilidade, sem 14 dias)', !!c1 && c1.sendable, true);
eq('formacao: media simples = 10000', c1?.avgCents, 10000);
eq('formacao: texto nunca afirma % com amostra < 5', /% abaixo da média/.test(c1?.texts.telegram ?? ''), false);
eq('formacao: texto nunca diz afiliado', /afiliad/i.test((c1?.texts.telegram ?? '') + (c1?.texts.whatsapp ?? '')), false);
eq('formacao: texto mostra a media simples e a amostra pequena', /Média simples:<\/b> R\$ 100,00 \(3 ofertas ativas; amostra pequena\)/.test(c1?.texts.telegram ?? ''), true);
eq('formacao: texto nunca diz abaixo da media', /abaixo da média/i.test(c1?.texts.telegram ?? ''), false);

// 2 lojas (dois vendedores, 3 ofertas) passa; 1 loja so, nao
const duasLojas = [mkOffer('a', 9000, { sellerId: 'x' }), mkOffer('b', 10000, { sellerId: 'x' }), mkOffer('c', 11000, { sellerId: 'y' })];
eq('formacao: 2 lojas basta', g2(HOJE, duasLojas).candidates.some((c) => c.trigger === 'G2'), true);
const umaLoja = duasLojas.map((o) => ({ ...o, sellerId: 'x' }));
eq('formacao: 1 loja nao', g2(HOJE, umaLoja).candidates.some((c) => c.trigger === 'G2'), false);
// 2 ofertas = sem media
eq('formacao: 2 ofertas nao tem media', g2(HOJE, tres.slice(0, 2)).candidates.some((c) => c.trigger === 'G2'), false);
// identidade incerta fica fora da media e nao e escolhida
const comIncerta = [mkOffer('a', 9000), mkOffer('b', 10000), mkOffer('c', 11000), mkOffer('d', 5000, { identidade: 'incerta' })];
const ri = g2(HOJE, comIncerta);
const ci = ri.candidates.find((c) => c.trigger === 'G2');
eq('incerta: media sem o item incerto', ci?.avgCents, 10000);
eq('incerta: nao e a oferta escolhida', ci?.offerIds[0] === 'd', false);
// Open Box fora da media
const comOpen = [...tres, mkOffer('e', 12500, { title: 'Livro Exemplo Open Box' })];
eq('open box fora da media simples', g2(HOJE, comOpen).candidates.find((c) => c.trigger === 'G2')?.avgCents, 10000);
// preco igual a media: nao envia (precisa estar abaixo)
eq('no nivel da media nao envia (piso > 0)', g2(HOJE, [mkOffer('a', 10000), mkOffer('b', 10000), mkOffer('c', 10000)]).candidates.filter((c) => c.trigger === 'G2' && c.sendable).length, 0);

// DEPOIS da corte: estrutura dos games. Sem media elegivel (avg null) nao ha G2; com media oferta-dia >=3 ofertas/1 dia, usa a regua de 10%.
const tresD = [mkOffer('a', 9000, {}, DEPOIS), mkOffer('b', 10000, {}, DEPOIS), mkOffer('c', 11000, {}, DEPOIS)];
eq('depois da corte: sem media oferta-dia nao ha G2', g2(DEPOIS, tresD).candidates.some((c) => c.trigger === 'G2'), false);
const avgRobusta = { cents: 10000, distinctOffers: 6, offerDays: 40, spanDays: 16, eligible: true };
const rd = g2(DEPOIS, tresD, { avg: avgRobusta });
eq('depois da corte: preco 10% abaixo da media oferta-dia envia', rd.candidates.some((c) => c.trigger === 'G2' && c.sendable), true);
const quase = [mkOffer('a', 9500, {}, DEPOIS), mkOffer('b', 10000, {}, DEPOIS), mkOffer('c', 11000, {}, DEPOIS)];
eq('depois da corte: 5% abaixo NAO envia (regua 10%)', g2(DEPOIS, quase, { avg: avgRobusta }).candidates.some((c) => c.trigger === 'G2' && c.sendable), false);
eq('antes da corte: os mesmos 5% abaixo ENVIAM (so abaixo da media)', g2(HOJE, [mkOffer('a', 9500), mkOffer('b', 10000), mkOffer('c', 11000)]).candidates.some((c) => c.trigger === 'G2' && c.sendable), true);
// 2 lojas depois da corte nao basta
eq('depois da corte: 2 lojas nao basta', g2(DEPOIS, [mkOffer('a', 8000, { sellerId: 'x' }, DEPOIS), mkOffer('b', 10000, { sellerId: 'x' }, DEPOIS), mkOffer('c', 11000, { sellerId: 'y' }, DEPOIS)], { avg: avgRobusta }).candidates.some((c) => c.trigger === 'G2'), false);
// games intocado: sem media elegivel e antes da corte nao usa media simples
eq('games nao usa media simples', evaluateProductV2(mkProd(HOJE, tres, { vertical: 'games', productType: 'game', platformLabel: 'Switch' }), ctxAt(HOJE)).candidates.some((c) => c.trigger === 'G2'), false);

// ---- texto: amostra minima ----
const NOW = new Date();
const mk = (offers: number) => formatOfferMessage({ model: 'media', name: 'Console X', seriesDays: 9, offer: { slug: 'x', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 420000, confirmedAt: NOW }, avg: { cents: 514331, offers }, vertical: 'games', messageKey: 'g2-261111-abc123', adTag: '#publicidade' } as never, 'tg') as string;
eq('amostra minima = 5', MIN_AVG_OFFERS_CLAIM, 5);
for (const n of [3, 4]) {
  eq(`${n} ofertas: sem "Vs. média"`, /Vs\. média/.test(mk(n)), false);
  eq(`${n} ofertas: sem "% abaixo da média"`, /%\s+abaixo da média|abaixo da média/.test(mk(n)), false);
}
eq('5 ofertas: com "Vs. média"', /Vs\. média/.test(mk(5)), true);
console.log(`${ok}/${ok + bad} verificações ok (fase de formação e virada na data de corte)`);
process.exit(bad ? 1 : 0);

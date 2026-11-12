/**
 * Teste da oferta "FORA DA MEDIA" (migration 0044, avg_excluded_at): a oferta marcada continua VISIVEL (minimo, lojas, lista,
 * preco agora) mas NAO entra em media, mediana, n_offers, members, regua de plausibilidade nem em mensagem de comparacao.
 * Pura, sem banco:  npx tsx scripts/test-fora-da-media.ts
 * Os precos sao valores de teste de funcoes puras (nada e gravado nem exibido ao cliente).
 */
import { computeDayState, computePeriodMetrics, type OfferDayRow, type OfferInput } from '../src/lib/pricing/daily-state';
import { storesToday } from '../src/lib/pricing/price-verdict-v2';
import { judgeOffer, type OfferFact } from '../src/lib/messaging/group-rules';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}

const NOW = new Date('2026-11-11T15:00:00Z');
const TODAY = '2026-11-11';
const row = (cents: number): OfferDayRow => ({ day: TODAY, medianCents: cents, lastCents: cents, minCents: cents, maxCents: cents, nCollected: 1, lastObservedAt: new Date('2026-11-11T14:00:00Z') });
const off = (id: string, cents: number, avgExcluded?: boolean): OfferInput => ({
  offerId: id, storeKey: `s-${id}`, networkId: 'ml', sellerId: `s-${id}`, active: true, rows: [row(cents)],
  ...(avgExcluded === undefined ? {} : { avgExcluded }),
});

// 1) Sem marca: nada muda (paridade com o calculo de sempre; avgExcluded=false equivale a ausente)
const base = [off('a', 10000), off('b', 11000), off('c', 12000)];
const s0 = computeDayState(TODAY, NOW, base);
ok(s0.avgCents === 11000 && s0.nOffers === 3 && s0.quality === 'complete', 'sem marca: media 11000, n 3', s0);
ok(JSON.stringify(computeDayState(TODAY, NOW, base.map((o) => ({ ...o, avgExcluded: false })))) === JSON.stringify(s0), 'avgExcluded=false identico a ausente');

// 2) Marcada e MAIS BARATA: visivel no minimo, fora da media/mediana/n_offers/members/lojas
const s1 = computeDayState(TODAY, NOW, [...base, off('x', 5000, true)]);
ok(s1.minCents === 5000 && s1.minOfferId === 'x', 'marcada continua sendo o menor preco (visivel)', s1);
ok(s1.avgCents === 11000, 'media NAO muda com a marcada', s1.avgCents);
ok(s1.medianCents === 11000, 'mediana NAO muda com a marcada', s1.medianCents);
ok(s1.nOffers === 3, 'n_offers NAO conta a marcada', s1.nOffers);
ok(!('x' in s1.members) && Object.keys(s1.members).length === 3, 'members nao inclui a marcada', s1.members);
ok(s1.nStores === 3, 'n_stores (estatistica) nao conta a marcada', s1.nStores);
ok(s1.freshOffers === 4, 'fresh_offers continua contando a oferta visivel', s1.freshOffers);
ok(s1.quality === 'complete', 'qualidade pela contagem fora a marcada');

// 3) Marcada e a mais CARA: maximo visivel, media intacta
const s2 = computeDayState(TODAY, NOW, [...base, off('y', 13000, true)]);
ok(s2.maxCents === 13000 && s2.avgCents === 11000 && s2.nOffers === 3, 'marcada cara: maximo visivel, media intacta', s2);

// 4) Sem a marcada, so 2 ofertas contam: media NULL (regra de 3), mas o minimo segue visivel
const s3 = computeDayState(TODAY, NOW, [off('a', 10000), off('b', 11000), off('x', 5000, true)]);
ok(s3.avgCents === null && s3.nOffers === 2 && s3.quality === 'partial' && s3.minCents === 5000, 'marcada nao completa a regra de 3 ofertas', s3);

// 5) So marcadas: sem media/mediana/n_offers, minimo visivel
const s4 = computeDayState(TODAY, NOW, [off('x', 5000, true), off('z', 6000, true)]);
ok(s4.avgCents === null && s4.medianCents === null && s4.nOffers === 0 && s4.minCents === 5000, 'so marcadas: minimo visivel, sem media', s4);

// 6) Periodo (selo/grafico): usa members, entao a marcada nao entra
const pm = computePeriodMetrics([{ day: TODAY, members: s1.members, minCents: s1.minCents }], 5000);
ok(pm.offerDays === 3 && pm.distinctOffers === 3 && pm.avgOfferDayCents === 11000, 'periodo (selo/grafico) sem a marcada', pm);

// 7) Lojas hoje: contagem visivel inclui a marcada; mediana de comparacao (filtrada) nao
const lojas = [
  { storeKey: 'a', priceCents: 10000 }, { storeKey: 'b', priceCents: 11000 }, { storeKey: 'c', priceCents: 12000 },
  { storeKey: 'x', priceCents: 5000, avgExcluded: true },
];
ok(storesToday(lojas).storeCount === 4, 'lojas hoje (lista) inclui a marcada');
ok(storesToday(lojas.filter((o) => !o.avgExcluded)).medianCents === 11000 && storesToday(lojas).medianCents !== 11000, 'mediana de comparacao exclui a marcada');

// 8) Mensagens: oferta marcada e bloqueada (toda mensagem compara com a media)
const fact = (over: Partial<OfferFact>): OfferFact => ({
  offerId: 'o1', slug: 's', title: 'Jogo', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', sellerId: 'v', sellerReputation: '5_green', sellerTotalSales: 999,
  priceCents: 10000, confirmedAt: new Date(NOW.getTime() - 60_000), priceSince: new Date(NOW.getTime() - 2 * 86_400_000), affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/x', quarantined: false, ...over,
});
const v0 = judgeOffer(fact({}), { masterName: 'Jogo' }, NOW, 30);
const v1 = judgeOffer(fact({ avgExcluded: true }), { masterName: 'Jogo' }, NOW, 30);
ok(v0.kind !== 'block', 'oferta normal passa no juizo', v0);
ok(v1.kind === 'block' && v1.reasons.includes('fora_da_media'), 'oferta marcada e bloqueada na mensagem (fora_da_media)', v1);

console.log(fails === 0 ? `OK ${total} verificacoes` : `${fails} FALHA(S) de ${total}`);
process.exit(fails === 0 ? 0 : 1);

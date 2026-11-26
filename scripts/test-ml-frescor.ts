// R-124: freio de frescor do Mercado Livre (função pura + efeito em computeDayState/computeLiveMin).
import assert from 'node:assert/strict';
import { frescorMercadoLivre, mlPrecoVelhoMs, isMercadoLivreSlug } from '../src/lib/pricing/ml-frescor';
import { computeDayState, computeLiveMin, spDay, type OfferInput } from '../src/lib/pricing/daily-state';

const H = 3_600_000;
// Flag
assert.equal(mlPrecoVelhoMs({}), 12 * H, 'padrão 12 h');
assert.equal(mlPrecoVelhoMs({ ML_PRECO_VELHO_HORAS: '24' }), 24 * H);
for (const off of ['0', 'off', 'false', 'OFF']) assert.equal(mlPrecoVelhoMs({ ML_PRECO_VELHO_HORAS: off }), null, `desliga com ${off}`);
assert.equal(mlPrecoVelhoMs({ ML_PRECO_VELHO_HORAS: 'abc' }), 12 * H, 'valor inválido = padrão');
assert.equal(mlPrecoVelhoMs({ ML_PRECO_VELHO_HORAS: '999' }), 12 * H, 'fora de 1..168 = padrão');
// Só ML
assert.ok(isMercadoLivreSlug('mercado-livre'));
assert.equal(frescorMercadoLivre('amazon', new Date()), null);
assert.equal(frescorMercadoLivre('shopee', new Date()), null);
assert.equal(frescorMercadoLivre('mercado-livre', new Date(), { ML_PRECO_VELHO_HORAS: 'off' }), null, 'desligado = regra anterior');
const f = frescorMercadoLivre('mercado-livre', null, {});
assert.equal(f?.confirmedAt.getTime(), 0, 'sem confirmação = âncora na época');
assert.equal(f?.maxAgeMs, 12 * H);

// Efeito nas métricas vivas: ML com preço congelado sai; Amazon/Shopee ficam.
const now = new Date('2026-11-25T12:00:00Z');
const day = '2026-11-25';
const quoteAt = (hAgo: number) => new Date(now.getTime() - hAgo * H);
function oferta(id: string, slug: string, cents: number, hAgo: number, confirmedHAgo: number | null, env: Record<string, string | undefined> = {}): OfferInput {
  const last = quoteAt(hAgo);
  return {
    offerId: id, storeKey: `loja-${id}`, active: true, isAmazon: slug === 'amazon', avgExcluded: false,
    freshness: slug === 'amazon' ? null : frescorMercadoLivre(slug, confirmedHAgo == null ? null : quoteAt(confirmedHAgo), env),
    rows: [{ day: spDay(last), medianCents: cents, lastCents: cents, minCents: cents, maxCents: cents, nCollected: 3, lastObservedAt: last }],
  } as OfferInput;
}
const novo = (env: Record<string, string | undefined>) => [
  oferta('ml', 'mercado-livre', 300000, 2, 2, env),         // ML fresco (2 h)
  oferta('ml-velho', 'mercado-livre', 200000, 20, 20, env), // ML congelado (20 h): R$ 2.000 mais barato
  oferta('amz', 'amazon', 350000, 2, 2, env),
  oferta('shp', 'shopee', 320000, 3, 3, env),
];
const comFreio = computeDayState(day, now, novo({}));
const semFreio = computeDayState(day, now, novo({ ML_PRECO_VELHO_HORAS: 'off' }));
assert.equal(comFreio.minCents, 300000, 'com freio: o mínimo ignora o ML congelado');
assert.ok(comFreio.staleOffers >= 1, 'o ML congelado conta como velho');
assert.equal(semFreio.minCents, 200000, 'sem freio: comportamento anterior (ML congelado ainda dentro dos 48 h)');
// Fronteira: 11h59 fica, 12h01 sai
const lim = (hAgo: number) => computeLiveMin([oferta('x', 'mercado-livre', 100000, hAgo, hAgo, {})], now);
assert.ok(lim(11.98)?.minCents === 100000, '11h59 ainda vale');
assert.equal(lim(12.02), null, '12h01 sai');
// Produto só com ML velho: sem mínimo, sem divisão por zero
const so = computeDayState(day, now, [oferta('a', 'mercado-livre', 200000, 30, 30, {})]);
assert.equal(so.minCents, null);
assert.equal(so.avgCents, null);
// Sem confirmação (nula): vale a última cotação, que também precisa estar dentro do teto
assert.equal(computeLiveMin([oferta('n', 'mercado-livre', 100000, 30, null, {})], now), null, 'sem confirmação e cotação velha sai');
console.log('test-ml-frescor: OK');

// Vitrine POR PLATAFORMA (dono, 2026-11-20): um cartão e uma mensagem para cada plataforma (Switch 1, Switch 2, Xbox One/Series, PS5, PS4),
// sempre os 10 MENORES preços até R$ 200. Teste puro (sem banco, sem rede).
import assert from 'node:assert/strict';
import { VITRINE_CAPTION_MAX, VITRINE_PLATAFORMAS, escolherMenores, montarLegendaPlataforma, visivel, vitrinePorPlataformaLigada, type JogoVitrine } from '../src/lib/messaging/vitrine-games';

const j = (i: number, gen: string, preco: number, o: Partial<JogoVitrine> = {}): JogoVitrine => ({
  masterId: `m${i}`, slug: `jogo-${i}`, titulo: `Jogo de Teste Numero ${i} Edicao Colecionador Muito Longa`, plataforma: gen, gen, precoCentavos: preco, ofertas: 1, imagem: null, ...o,
});

// cinco plataformas, na ordem pedida pelo dono
assert.deepEqual(VITRINE_PLATAFORMAS.map((p) => p.key), ['switch_1', 'switch_2', 'xbox', 'ps5', 'ps4']);
assert.deepEqual(VITRINE_PLATAFORMAS.find((p) => p.key === 'xbox')?.gens, ['xbox_one', 'xbox_series']);

// 25 jogos PS5 de R$ 100 a R$ 195: saem os 10 MENORES, do mais barato para o mais caro
const ps5 = Array.from({ length: 25 }, (_, i) => j(i + 1, 'ps5', 10000 + i * 400));
const top = escolherMenores(ps5, ['ps5']);
assert.equal(top.length, 10);
assert.deepEqual(top.map((x) => x.precoCentavos), [10000, 10400, 10800, 11200, 11600, 12000, 12400, 12800, 13200, 13600]);

// só a plataforma pedida; Xbox junta One e Series e deixa o 360 de fora; outras plataformas não vazam
const mix = [j(1, 'ps5', 15000), j(2, 'ps4', 9000), j(3, 'xbox_one', 8000), j(4, 'xbox_series', 7000), j(5, 'xbox_360', 1000), j(6, 'switch_1', 12000), j(7, 'switch_2', 13000)];
assert.deepEqual(escolherMenores(mix, ['ps5']).map((x) => x.masterId), ['m1']);
assert.deepEqual(escolherMenores(mix, ['ps4']).map((x) => x.masterId), ['m2']);
assert.deepEqual(escolherMenores(mix, ['xbox_one', 'xbox_series']).map((x) => x.masterId), ['m4', 'm3'], 'Xbox: One e Series juntos, menor primeiro, sem 360');
assert.deepEqual(escolherMenores(mix, ['switch_1']).map((x) => x.masterId), ['m6']);
assert.deepEqual(escolherMenores(mix, ['switch_2']).map((x) => x.masterId), ['m7']);

// teto de R$ 200 inclusivo, preço > 0, um por produto, sem gen conhecida fica de fora
const bordas = [j(1, 'ps4', 20000), j(2, 'ps4', 20001), j(3, 'ps4', 0), j(4, 'ps4', 5000), j(4, 'ps4', 4000), { ...j(5, 'ps4', 3000), gen: null }];
assert.deepEqual(escolherMenores(bordas, ['ps4']).map((x) => x.masterId).sort(), ['m1', 'm4']);

// desempate estável: mesmo preço, mais ofertas primeiro, depois id
const empate = [j(3, 'ps5', 9000, { ofertas: 1 }), j(1, 'ps5', 9000, { ofertas: 1 }), j(2, 'ps5', 9000, { ofertas: 5 })];
assert.deepEqual(escolherMenores(empate, ['ps5']).map((x) => x.masterId), ['m2', 'm1', 'm3']);

// legenda: título com a plataforma, 10 linhas, links na ordem, limite de 1024 caracteres visíveis
const leg = montarLegendaPlataforma(top, '22:00', 'PlayStation 5', false, (i) => `https://www.egeek86.com/go/x-${i}`);
assert.match(leg, /Jogos até R\$ 200 · PlayStation 5 · 22:00/);
assert.match(leg, /Os 10 menores preços/);
assert.equal((leg.match(/<a href=/g) ?? []).length, 10);
assert.ok(leg.indexOf('go/x-0') < leg.indexOf('go/x-9'));
assert.ok(visivel(leg) <= VITRINE_CAPTION_MAX, `legenda com ${visivel(leg)} caracteres`);
// grupo misto (Xbox): a plataforma de cada jogo aparece na linha; grupo único não repete
const xb = montarLegendaPlataforma([j(1, 'xbox_one', 8000, { plataforma: 'Xbox One' }), j(2, 'xbox_series', 9000, { plataforma: 'Xbox Series' })], '22:00', 'Xbox One / Series', true, (i) => `u${i}`);
assert.match(xb, /Xbox One/);
assert.match(xb, /Xbox Series/);
assert.doesNotMatch(leg, /· ps5 ·/);

// flag: ligada por padrão; off volta à vitrine única
assert.equal(vitrinePorPlataformaLigada({}), true);
assert.equal(vitrinePorPlataformaLigada({ VITRINE_POR_PLATAFORMA: 'off' }), false);
assert.equal(vitrinePorPlataformaLigada({ VITRINE_POR_PLATAFORMA: '0' }), false);

console.log('test-vitrine-por-plataforma: ok');

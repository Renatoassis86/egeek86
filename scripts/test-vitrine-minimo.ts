// Vitrine: minimo de 10 jogos por cartao (so o Switch 2 sai com menos) e cartao que se ajusta a quantidade (dono, 2026-11-23). Teste puro.
import assert from 'node:assert/strict';
import { VITRINE_PLATAFORMAS, VITRINE_TOP, menoresTexto, minimoJogosPlataforma, montarLegendaPlataforma, type JogoVitrine } from '../src/lib/messaging/vitrine-games';

for (const p of VITRINE_PLATAFORMAS) {
  assert.equal(minimoJogosPlataforma(p.key), p.key === 'switch_2' ? 1 : VITRINE_TOP, `minimo de ${p.key}`);
}
assert.equal(menoresTexto(1), 'O menor preço');
assert.equal(menoresTexto(4), 'Os 4 menores preços');
assert.equal(menoresTexto(10), 'Os 10 menores preços');

const j = (i: number): JogoVitrine => ({ masterId: `m${i}`, slug: `s${i}`, titulo: `Jogo ${i}`, plataforma: 'Nintendo Switch 2', gen: 'switch_2', precoCentavos: 10000 + i, ofertas: 1, imagem: null });
const leg = montarLegendaPlataforma([j(1)], '19:00', 'Nintendo Switch 2', false, () => 'https://x');
assert.ok(leg.includes('O menor preço'), 'legenda com 1 jogo concorda no singular');
assert.ok(!leg.includes('Os 1 menores'));
console.log('test-vitrine-minimo: ok');

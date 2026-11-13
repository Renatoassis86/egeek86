import assert from 'node:assert/strict';
import { baldeDoVisitante, escolherVersaoHome, parsePercentual } from '../src/lib/redesenho-home';

assert.equal(parsePercentual(undefined), 0);
assert.equal(parsePercentual(''), 0);
assert.equal(parsePercentual('abc'), 0);
assert.equal(parsePercentual('-5'), 0);
assert.equal(parsePercentual('25'), 25);
assert.equal(parsePercentual(' 25% '), 25);
assert.equal(parsePercentual('12,6'), 13);
assert.equal(parsePercentual(250), 100);
assert.equal(parsePercentual(NaN), 0);

// padrao 0%: ninguem ve a nova home, nem com cookie
assert.equal(escolherVersaoHome({ percentual: 0, visitanteId: 'x', forcar: null, admin: false }), 1);
// ?v=2 so vale para admin
assert.equal(escolherVersaoHome({ percentual: 0, visitanteId: 'x', forcar: '2', admin: false }), 1);
assert.equal(escolherVersaoHome({ percentual: 0, visitanteId: 'x', forcar: '2', admin: true }), 2);
assert.equal(escolherVersaoHome({ percentual: 100, visitanteId: 'x', forcar: '1', admin: true }), 1);
assert.equal(escolherVersaoHome({ percentual: 100, visitanteId: 'x', forcar: '1', admin: false }), 2);
// sem cookie ainda: home atual (a nao ser 100%)
assert.equal(escolherVersaoHome({ percentual: 50, visitanteId: null, forcar: null, admin: false }), 1);

// estabilidade e distribuicao aproximada
assert.equal(baldeDoVisitante('abc'), baldeDoVisitante('abc'));
let v2 = 0;
const N = 20000;
for (let i = 0; i < N; i++) {
  const id = `visitante-${i}-${(i * 2654435761) >>> 0}`;
  if (escolherVersaoHome({ percentual: 10, visitanteId: id, forcar: null, admin: false }) === 2) v2++;
}
const taxa = (v2 / N) * 100;
assert.ok(taxa > 8.5 && taxa < 11.5, `taxa fora do esperado: ${taxa}`);
console.log('test-redesenho-home: ok (taxa 10% =', taxa.toFixed(2) + '%)');
